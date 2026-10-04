import type { PitchName } from '$lib/domain/music/types';
import {
	describeAcceptable,
	describeFrequency,
	detuneCents,
	logDetection,
	nearestAcceptable,
	noteWithOctave,
	signedCents
} from '$lib/debug/detectionLog';
import {
	acceptableMidis,
	classifyNameConfusion,
	classifyNoteConfusion,
	formatNote,
	pitchOnString,
	spellPitch,
	stringLabel
} from '$lib/domain/music';
import {
	applyColdAttempt,
	classifyTemperature,
	introduceCard,
	clampTempo,
	nextSessionTempo,
	probeTemperature,
	type SessionSelector
} from '$lib/domain/progress';
import type {
	Attempt,
	CardState,
	Direction,
	Locale,
	PlannedItem,
	SessionKind,
	Settings,
	Temperature,
	Verdict
} from '$lib/domain/types';
import { cardKey } from '$lib/domain/types';
import type { BeatEvent, NoteOnset } from '$lib/application/ports';
import {
	answerWindow,
	detectFatigue,
	isInWindow,
	judgeIdentify,
	judgeLocate,
	lateCaptureEnd,
	type Judgement
} from '$lib/domain/scoring';
import type { PlaySessionController, PlayView, VerdictView } from './contract';
import type { SessionDeps } from './SessionDeps';
import { alignedPromptBeat, BEATS_PER_BAR, respirationStart } from './grid';
import { buildAnswerChoices, buildCorrection, buildPromptView } from './prompt';

type InternalStatus = PlayView['status'];

export class SessionController implements PlaySessionController {
	sessionId: string;
	readonly view: PlayView;
	readonly timeline = {
		nowBeat: (): number => {
			if (!this.deps.metronome.isRunning()) return 0;
			return (
				(this.deps.clock.now() - this.deps.metronome.beatTime(0)) /
				this.deps.metronome.secondsPerBeat()
			);
		}
	};

	private readonly deps: SessionDeps;
	private readonly kind: SessionKind;
	private readonly makeSelector: (sessionId: string) => Promise<SessionSelector>;
	private selector: SessionSelector | null = null;
	/** Epoch ms when the current series started; the selector measures elapsed time from it. */
	private startedAt = 0;
	/** Prompt chosen ahead of a counted bar, shown when the bar ends. */
	private pending: PlannedItem | null = null;
	/** Direction of the last prompt shown; a change opens a counted bar. */
	private lastDirection: Direction | null = null;
	private settings!: Settings;
	private locale: Locale = 'fr';
	private latencyMs = 0;
	private unsubBeat: (() => void) | null = null;
	private unsubNote: (() => void) | null = null;
	private earliestPromptBeat: number = BEATS_PER_BAR;
	/** The wait before the next prompt is a counted bar (start, resume, change of scene): 4 to 1 shows. */
	private counting = false;
	private current: PlannedItem | null = null;
	private promptBeatIndex: number | null = null;
	private targetBeatIndex: number | null = null;
	private promptTimeAudio: number | null = null;
	private windowClosesAt: number | null = null;
	private captured = false;
	/**
	 * Mode 1, after the window closed unanswered: still listening until this audio time for an
	 * off-beat answer. The attempt is stored when the question is settled (a note, or this time).
	 */
	private captureUntil: number | null = null;
	private verdictBeatIndex: number | null = null;
	private sessionAttempts: Attempt[] = [];
	private sessionTempoBpm: number | null = null;
	private run = 0;
	private starting = false;

	constructor(
		session: { id: string; kind: SessionKind },
		makeSelector: (sessionId: string) => Promise<SessionSelector>,
		deps: SessionDeps
	) {
		this.deps = deps;
		this.sessionId = session.id;
		this.kind = session.kind;
		this.makeSelector = makeSelector;
		this.view = $state<PlayView>({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: 80,
			beatsPerBar: BEATS_PER_BAR,
			promptBeatIndex: null,
			targetBeatIndex: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene: 'locate',
			countdown: null
		});
	}

	async start(): Promise<void> {
		if (this.starting) return;
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.starting = true;
		const run = ++this.run;
		try {
			if (this.view.status === 'finished') this.beginNewSeries();
			this.selector = await this.makeSelector(this.sessionId);
			if (this.run !== run) return;
			this.startedAt = this.deps.now();
			// Show the first prompt's stage right away, before audio and the microphone.
			this.prepareStage();
			await this.beginAudio(run);
		} finally {
			if (this.run === run) this.starting = false;
		}
	}

	private beginNewSeries(): void {
		this.sessionId = this.deps.newId();
		this.selector = null;
		this.pending = null;
		this.lastDirection = null;
		this.view.scene = 'locate';
		this.view.countdown = null;
		this.sessionAttempts = [];
		this.current = null;
		this.clearItemState();
		this.view.history = [];
		this.view.lastVerdict = null;
		this.view.fatigueDetected = false;
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
	}

	private async beginAudio(run: number): Promise<void> {
		const stored = await this.deps.settings.get();
		// Never under 80 bpm: the 2-beat lead must stay a direct-recall test (old settings allowed 60).
		this.settings = { ...stored, tempoBpm: clampTempo(stored.tempoBpm) };
		if (this.run !== run) return;
		this.locale = this.settings.locale;
		this.latencyMs = this.settings.calibrationOffsetMs ?? 0;
		logDetection('entrée audio', [
			`latence calibrée : ${this.latencyMs} ms (retirés du temps de l’attaque)`,
			`tempo : ${this.settings.tempoBpm} bpm`,
			`gain micro intégré : ${this.settings.builtInInputGain}`
		]);
		this.view.tempoBpm = this.settings.tempoBpm;
		this.sessionTempoBpm = this.settings.tempoBpm;

		await this.deps.clock.resume();
		if (this.run !== run) return;
		this.deps.detector.setBuiltInGain(this.settings.builtInInputGain);
		await this.deps.detector.start(this.settings.inputDeviceId);
		if (this.run !== run) return;
		// The permission prompt can suspend the context. Resume again before scheduling clicks.
		await this.deps.clock.resume();
		if (this.run !== run) return;
		if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
		this.deps.metronome.setTempo(this.settings.tempoBpm);
		this.deps.metronome.setAudible(this.view.scene === 'locate');

		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: this.startedAt,
			endedAt: null,
			fatigueDetected: false,
			tempoBpm: this.sessionTempoBpm
		});
		if (this.run !== run) return;

		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = this.deps.metronome.onBeat((beat) => this.onBeat(beat));
		this.unsubNote = this.deps.detector.onNote((onset) => this.onNote(onset));

		this.earliestPromptBeat = BEATS_PER_BAR;
		this.counting = true;
		this.clearItemState();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	pause(): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;
		this.view.countdown = null;
		// Discard in-progress item without recording.
		this.current = null;
		this.clearItemState();
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.deps.metronome.stop();
		this.setStatus('paused');
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
		this.deps.metronome.setTempo(this.settings.tempoBpm);
		this.earliestPromptBeat = BEATS_PER_BAR;
		this.counting = true;
		this.clearItemState();
		this.prepareStage();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	answer(pitch: PitchName): void {
		if (this.view.status !== 'awaiting' || this.captured || !this.current) return;
		if (this.current.target.direction !== 'identify') return;
		if (this.promptTimeAudio === null) return;

		this.captured = true;
		const expected = pitchOnString(this.current.target.string, this.current.target.fret);
		const answerTime = this.deps.clock.now();
		const judgement = judgeIdentify({
			expected,
			promptTime: this.promptTimeAudio,
			answerTime,
			answered: pitch
		});

		const answerLabel = judgement.answer ? formatNote(spellPitch(pitch, this.deps.random)) : null;
		this.view.lastVerdict = {
			verdict: judgement.verdict,
			offsetMs: null,
			reactionMs: judgement.reactionMs,
			answerLabel,
			correction: this.correctionFor(judgement.verdict)
		};
		this.view.answerChoices = null;
		this.deps.cues.play(judgement.verdict);
		const answerBeat = Math.floor(this.timeline.nowBeat());
		this.verdictBeatIndex = answerBeat;
		this.earliestPromptBeat = answerBeat + 1;
		this.setStatus('verdict');
		void this.persistAttempt(judgement);
	}

	quit(): void {
		// A late capture still open settles as unanswered: the attempt is not lost.
		if (this.captureUntil !== null) this.settleCapture(null);
		this.deps.metronome.stop();
		this.deps.detector.stop();
		void this.finish();
	}

	private setStatus(status: InternalStatus): void {
		this.view.status = status;
	}

	private clearItemState(): void {
		this.promptBeatIndex = null;
		this.targetBeatIndex = null;
		this.promptTimeAudio = null;
		this.windowClosesAt = null;
		this.captured = false;
		this.captureUntil = null;
		this.verdictBeatIndex = null;
	}

	private onBeat(beat: BeatEvent): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;

		if (this.view.status === 'verdict') {
			if (this.captureUntil !== null && beat.time >= this.captureUntil) this.settleCapture(null);
			// The next prompt is chosen only once the attempt is stored and the selector knows it.
			if (
				this.captureUntil === null &&
				this.verdictBeatIndex !== null &&
				beat.index >= this.verdictBeatIndex + 1
			) {
				this.advanceAfterVerdict(beat);
				// advanceAfterVerdict may set count-in or finished; TS cannot track setStatus.
				if ((this.view.status as PlayView['status']) === 'count-in') this.waitForPrompt(beat);
			}
			return;
		}

		if (this.view.status === 'awaiting') {
			this.maybeCloseWindow(beat);
			return;
		}

		if (this.view.status === 'count-in' || this.view.status === 'idle') {
			this.waitForPrompt(beat);
		}
	}

	/**
	 * Starts the waiting prompt on its beat: no earlier than `earliestPromptBeat` and, in mode 1,
	 * aligned so the target lands on the first beat of a bar. Recomputed from the beat received,
	 * so a dropped beat delays the prompt to the next aligned beat instead of misaligning it.
	 */
	private waitForPrompt(beat: BeatEvent): void {
		this.pending ??= this.takeNext();
		if (!this.pending) {
			void this.finish();
			return;
		}
		const promptBeat = this.promptBeatFor(this.pending, beat.index);
		if (beat.index >= promptBeat) {
			this.counting = false;
			this.beginNextItem(beat);
			return;
		}
		const left = promptBeat - beat.index;
		this.view.countdown = this.counting && left <= BEATS_PER_BAR ? left : null;
		// The verdict stays on screen until a counted bar actually starts counting.
		if (this.view.countdown !== null) this.view.lastVerdict = null;
	}

	private promptBeatFor(item: PlannedItem, beatIndex: number): number {
		const earliest = Math.max(this.earliestPromptBeat, beatIndex);
		if (item.target.direction !== 'locate') return earliest;
		return alignedPromptBeat(earliest, item.leadBeats ?? BEATS_PER_BAR);
	}

	/** The right answer, shown with a miss only (off beat is a right note: nothing to correct). */
	private correctionFor(verdict: Verdict): string | null {
		if (verdict !== 'wrong' || !this.current) return null;
		return buildCorrection(this.current.target, this.locale);
	}

	private takeNext(): PlannedItem | null {
		const now = this.deps.now();
		return (
			this.selector?.next({
				now,
				elapsedMs: now - this.startedAt,
				fatigued: this.view.fatigueDetected
			}) ?? null
		);
	}

	/**
	 * Before a counted bar (start, resume): picks the next prompt if none is waiting and sets
	 * its stage, so the count runs on the right screen, clicked only for the guitar.
	 */
	private prepareStage(): void {
		this.view.lastVerdict = null;
		this.view.countdown = null;
		this.pending ??= this.takeNext();
		if (!this.pending) return;
		this.lastDirection = this.pending.target.direction;
		this.enterScene(this.pending.target.direction);
	}

	/** Lane and clicks for the guitar; answer pad and silence for the screen. */
	private enterScene(direction: Direction): void {
		this.view.scene = direction;
		this.view.answerChoices = direction === 'identify' ? buildAnswerChoices() : null;
		this.deps.metronome.setAudible(direction === 'locate');
	}

	private onNote(onset: NoteOnset): void {
		const capturing = this.view.status === 'verdict' && this.captureUntil !== null;
		const listening = this.view.status === 'awaiting' && !this.captured;
		if ((!listening && !capturing) || !this.current) {
			this.logSkippedNote(onset);
			return;
		}
		if (this.current.target.direction !== 'locate') {
			logDetection('note ignorée', [
				'raison : la question en cours n’est pas « joue cette note »',
				this.describeHeard(onset)
			]);
			return;
		}
		if (this.promptTimeAudio === null || this.targetBeatIndex === null) {
			logDetection('note ignorée', [
				'raison : la fenêtre de réponse n’est pas armée',
				this.describeHeard(onset)
			]);
			return;
		}

		const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
		const window = answerWindow(this.promptTimeAudio, targetTime);
		const corrected = onset.time - this.latencyMs / 1000;
		const captureUntil = this.lateCaptureEnd();
		if (corrected < window.opensAt && !isInWindow(corrected, window)) {
			// Before the prompt or in its first MIN_RESPONSE_MS: it answers the previous prompt.
			logDetection('note ignorée', [
				'raison : jouée avant la consigne ou juste après son apparition, elle appartient à la précédente',
				this.describeHeard(onset)
			]);
			return;
		}
		if (captureUntil !== null && corrected > captureUntil) {
			logDetection('note ignorée', [
				'raison : arrivée après la fin de l’écoute hors temps',
				this.describeHeard(onset)
			]);
			return;
		}

		const judgement = judgeLocate({
			acceptable: acceptableMidis(this.current.target),
			promptTime: this.promptTimeAudio,
			targetTime,
			onset,
			latencyMs: this.latencyMs,
			captureUntil: captureUntil ?? undefined
		});
		this.logLocateDecision(onset, window, targetTime, corrected, judgement);
		if (capturing) {
			this.settleCapture(judgement);
			return;
		}
		this.captured = true;
		this.resolveLocate(judgement, this.targetBeatIndex, true);
	}

	/** End of the off-beat capture of the current prompt: bounded by the breathing bar. */
	private lateCaptureEnd(): number | null {
		if (this.targetBeatIndex === null) return null;
		return lateCaptureEnd(
			this.deps.metronome.beatTime(this.targetBeatIndex),
			this.deps.metronome.beatTime(respirationStart(this.targetBeatIndex))
		);
	}

	/**
	 * Settles a late capture: a note heard in it (off beat when right, wrong otherwise), or
	 * `null` when the capture ended in silence. Stores the attempt either way.
	 */
	private settleCapture(judgement: Judgement | null): void {
		this.captureUntil = null;
		if (judgement && judgement.answer !== null) {
			this.view.lastVerdict = this.verdictView(judgement);
			this.view.history = this.view.history.map((entry) =>
				entry.beatIndex === this.targetBeatIndex ? { ...entry, verdict: judgement.verdict } : entry
			);
			this.deps.cues.play(judgement.verdict);
		}
		void this.persistAttempt(judgement ?? this.unansweredLocate());
	}

	private unansweredLocate(): Judgement {
		return {
			answer: null,
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null
		};
	}

	private beginNextItem(beat: BeatEvent): void {
		const item = this.pending ?? this.takeNext();
		this.pending = null;
		if (!item) {
			void this.finish();
			return;
		}
		this.current = item;
		this.view.countdown = null;
		this.lastDirection = item.target.direction;
		this.view.scene = item.target.direction;

		if (item.target.direction === 'locate') {
			this.deps.metronome.setAudible(true);
			const lead = item.leadBeats ?? BEATS_PER_BAR;
			this.promptBeatIndex = beat.index;
			this.targetBeatIndex = beat.index + lead;
			this.promptTimeAudio = this.deps.metronome.beatTime(beat.index);
			this.windowClosesAt = null;
			this.captured = false;

			this.view.prompt = buildPromptView(item, this.locale, this.deps.random);
			this.view.promptBeatIndex = this.promptBeatIndex;
			this.view.targetBeatIndex = this.targetBeatIndex;
			this.view.leadBeats = item.leadBeats;
			this.view.answerChoices = null;
			this.view.lastVerdict = null;
			this.setStatus('awaiting');
			this.armLocateWindow();
			return;
		}

		this.beginIdentify(item, beat);
	}

	private armLocateWindow(): void {
		if (this.promptTimeAudio === null || this.targetBeatIndex === null) return;
		const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
		const window = answerWindow(this.promptTimeAudio, targetTime);
		this.windowClosesAt = window.closesAt;
	}

	private beginIdentify(item: PlannedItem, beat: BeatEvent): void {
		this.deps.metronome.setAudible(false);
		this.promptBeatIndex = null;
		this.targetBeatIndex = null;
		this.windowClosesAt = null;
		this.promptTimeAudio = this.deps.clock.now();
		this.captured = false;
		this.view.prompt = buildPromptView(item, this.locale, this.deps.random);
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.view.answerChoices = buildAnswerChoices();
		this.view.lastVerdict = null;
		this.verdictBeatIndex = beat.index;
		this.setStatus('awaiting');
	}

	private maybeCloseWindow(beat: BeatEvent): void {
		if (this.captured || this.windowClosesAt === null || !this.current) return;
		if (this.current.target.direction !== 'locate') return;
		if (beat.time < this.windowClosesAt) return;
		if (this.promptTimeAudio === null || this.targetBeatIndex === null) return;

		this.captured = true;
		const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
		const window = answerWindow(this.promptTimeAudio, targetTime);
		logDetection('fenêtre fermée sans note', [
			`cible : ${this.describeLocateTarget()}`,
			`fréquences acceptées : ${describeAcceptable(acceptableMidis(this.current.target))}`,
			`fenêtre : ${window.opensAt.toFixed(3)} s → ${window.closesAt.toFixed(3)} s`,
			`fermeture au beat ${beat.time.toFixed(3)} s`,
			'aucune hauteur confirmée n’est arrivée pendant l’attente',
			'verdict provisoire : faux — l’écoute continue hors temps'
		]);
		this.resolveLocate(this.unansweredLocate(), beat.index, false);
	}

	private logSkippedNote(onset: NoteOnset): void {
		const reasons: string[] = [];
		if (this.view.status !== 'awaiting') {
			reasons.push(`la session n’attend pas de note (statut : ${this.view.status})`);
		}
		if (this.captured) {
			reasons.push('une note a déjà été prise pour cette demande — celle-ci est ignorée');
		}
		if (!this.current) reasons.push('aucune question en cours');
		logDetection('note ignorée', [
			`raison : ${reasons.join(' ; ') || 'inconnue'}`,
			this.describeHeard(onset)
		]);
	}

	private describeHeard(onset: NoteOnset): string {
		return `reçu : ${describeFrequency(onset.frequencyHz)}, MIDI retenu ${onset.midi} (${noteWithOctave(onset.midi)}), clarté ${onset.clarity.toFixed(2)}, t = ${onset.time.toFixed(3)} s`;
	}

	private describeLocateTarget(): string {
		const target = this.current?.target;
		if (!target || target.direction !== 'locate') return 'cible inconnue';
		return `${target.pitch} · ${stringLabel(target.string, this.locale)}`;
	}

	private logLocateDecision(
		onset: NoteOnset,
		window: { opensAt: number; closesAt: number },
		targetTime: number,
		corrected: number,
		judgement: Judgement
	): void {
		const target = this.current?.target;
		if (!target || target.direction !== 'locate') return;
		const inWindow = isInWindow(corrected, window);
		const acceptable = acceptableMidis(target);
		const nearest = nearestAcceptable(onset.frequencyHz, acceptable);
		const fromOpenMs = Math.round((corrected - window.opensAt) * 1000);
		const fromCloseMs = Math.round((window.closesAt - corrected) * 1000);
		const fromTargetMs = Math.round((corrected - targetTime) * 1000);
		const lines = [
			`cible : ${target.pitch} · ${stringLabel(target.string, this.locale)}`,
			`fréquences acceptées : ${describeAcceptable(acceptable)}`,
			this.describeHeard(onset),
			`latence : ${this.latencyMs} ms`,
			`temps brut ${onset.time.toFixed(3)} s → corrigé ${corrected.toFixed(3)} s`,
			`fenêtre : ${window.opensAt.toFixed(3)} s → ${window.closesAt.toFixed(3)} s, cible ${targetTime.toFixed(3)} s`,
			`position : ${fromOpenMs} ms après l’ouverture, ${fromCloseMs} ms avant la fermeture, ${
				fromTargetMs < 0 ? `${-fromTargetMs} ms en avance` : `${fromTargetMs} ms en retard`
			}`
		];
		if (nearest) {
			const way = nearest.cents > 15 ? 'trop aigu' : nearest.cents < -15 ? 'trop grave' : 'proche';
			lines.push(
				`écart au plus proche accepté (${noteWithOctave(nearest.midi)}) : ${signedCents(nearest.cents)} (${way})`
			);
			for (const midi of acceptable) {
				if (midi === nearest.midi) continue;
				lines.push(
					`écart à ${noteWithOctave(midi)} : ${signedCents(detuneCents(onset.frequencyHz, midi))}`
				);
			}
		}
		if (!inWindow) {
			const before = corrected < window.opensAt;
			const deltaMs = Math.round(
				(before ? window.opensAt - corrected : corrected - window.closesAt) * 1000
			);
			lines.push(
				before
					? `hors fenêtre : ${deltaMs} ms avant l’ouverture`
					: `hors fenêtre : ${deltaMs} ms après la fermeture, pendant l’écoute hors temps`,
				`verdict : ${judgement.verdict}`
			);
		} else if (!judgement.correct) {
			lines.push(
				`écart au temps : ${judgement.timingOffsetMs} ms`,
				`verdict : faux — MIDI ${onset.midi} n’est pas dans [${acceptable.join(', ')}]`
			);
		} else {
			lines.push(
				`écart au temps : ${judgement.timingOffsetMs} ms`,
				`verdict : juste (${judgement.verdict})`
			);
		}
		logDetection('décision', lines);
	}

	private verdictView(judgement: Judgement): VerdictView {
		const target = this.current?.target;
		const answerLabel =
			judgement.answer && judgement.answer.kind === 'note' && target?.direction === 'locate'
				? formatNote(spellPitch(target.pitch, this.deps.random))
				: null;
		return {
			verdict: judgement.verdict,
			offsetMs: judgement.timingOffsetMs,
			reactionMs: judgement.reactionMs,
			answerLabel: judgement.answer ? answerLabel : null,
			correction: this.correctionFor(judgement.verdict)
		};
	}

	/**
	 * Shows a mode 1 verdict. `settled` false: the window closed unanswered, the verdict is
	 * provisional and the off-beat capture opens; the attempt waits for `settleCapture`.
	 */
	private resolveLocate(judgement: Judgement, gapFromBeat: number, settled: boolean): void {
		if (!this.current || this.promptBeatIndex === null) return;
		this.view.lastVerdict = this.verdictView(judgement);
		if (this.targetBeatIndex !== null) {
			this.view.history = [
				...this.view.history,
				{ beatIndex: this.targetBeatIndex, verdict: judgement.verdict }
			];
		}
		this.deps.cues.play(judgement.verdict);
		this.verdictBeatIndex = gapFromBeat;
		// Breathe: the next prompt waits for the first beat of the bar after the target bar.
		this.earliestPromptBeat =
			this.targetBeatIndex === null ? gapFromBeat + 1 : respirationStart(this.targetBeatIndex);
		this.setStatus('verdict');
		if (settled) void this.persistAttempt(judgement);
		else this.captureUntil = this.lateCaptureEnd();
	}

	private async persistAttempt(judgement: Judgement): Promise<void> {
		if (!this.current || this.promptTimeAudio === null) return;
		const item = this.current;
		const key = cardKey(item.target);
		const promptedAt = this.deps.clock.toEpochMs(this.promptTimeAudio);
		const attemptedInSession = this.sessionAttempts.some((a) => a.cardKey === key);

		// Provisional temperature for sync fatigue/session tracking; refined after history load.
		const provisionalTemperature =
			item.phase === 'learning' ||
			item.phase === 'consolidation' ||
			item.phase === 'free' ||
			item.phase === 'probe'
				? item.temperature
				: attemptedInSession
					? 'hot'
					: 'cold';

		let confusion = null;
		if (judgement.answer !== null && !judgement.correct) {
			if (item.target.direction === 'locate' && judgement.answer.kind === 'note') {
				confusion = classifyNoteConfusion(item.target, judgement.answer.midi);
			} else if (item.target.direction === 'identify' && judgement.answer.kind === 'name') {
				confusion = classifyNameConfusion(
					pitchOnString(item.target.string, item.target.fret),
					judgement.answer.pitch
				);
			}
		}

		const attempt: Attempt = {
			sessionId: this.sessionId,
			cardKey: key,
			target: item.target,
			phase: item.phase,
			temperature: provisionalTemperature,
			aid: item.aid,
			leadBeats: item.leadBeats,
			promptedAt,
			answer: judgement.answer,
			correct: judgement.correct,
			verdict: judgement.verdict,
			timingOffsetMs: judgement.timingOffsetMs,
			reactionMs: judgement.reactionMs,
			confusion
		};

		// Fatigue and the selector must see the attempt before any await, so the next onBeat
		// cannot pick a prompt from stale state.
		this.sessionAttempts.push(attempt);
		if (detectFatigue(this.sessionAttempts)) this.view.fatigueDetected = true;
		const outcome = this.selector?.record(attempt, this.deps.now()) ?? null;

		const history = await this.deps.attempts.listByCard(key);
		const existing = await this.deps.cards.get(key);
		const lastAttemptAt = history.length > 0 ? history[history.length - 1].promptedAt : null;
		// A missed probe is hot: it measures no forgetting (spec 2026-10-03, section 1).
		const temperature =
			item.phase === 'probe'
				? probeTemperature(attempt, this.settings.tempoBpm)
				: this.temperatureFor(item, existing, {
						lastAttemptAt,
						attemptedInSession,
						now: promptedAt
					});
		attempt.temperature = temperature;

		await this.deps.attempts.add(attempt);

		const now = this.deps.now();
		if ((item.phase === 'review' || item.phase === 'free') && temperature === 'cold') {
			if (existing) {
				const fullHistory = [...history, attempt];
				await this.storeCard(
					applyColdAttempt(existing, attempt, fullHistory, now, this.settings.tempoBpm)
				);
			}
		} else if (item.phase === 'probe') {
			if (outcome) await this.storeCard(outcome.card);
		} else if (item.phase === 'learning') {
			if (outcome) await this.storeCard(outcome.card);
			else if (!existing) {
				await this.storeCard(introduceCard(item.target, now, this.sessionId));
			}
		}
	}

	/** Stores a card and tells the selector, whose copy must not go stale. */
	private async storeCard(card: CardState): Promise<void> {
		await this.deps.cards.put(card);
		this.selector?.cardChanged(card);
	}

	/**
	 * Learning and consolidation stay hot. Free play counts cold only on a learned card.
	 * Reviews follow the cold-delay rule; probes are judged by probeTemperature.
	 */
	private temperatureFor(
		item: PlannedItem,
		card: CardState | undefined,
		input: { lastAttemptAt: number | null; attemptedInSession: boolean; now: number }
	): Temperature {
		if (item.phase === 'learning' || item.phase === 'consolidation') return item.temperature;
		if (item.phase === 'free' && (!card || card.learnedAt === null)) return item.temperature;
		return classifyTemperature(input);
	}

	private advanceAfterVerdict(beat: BeatEvent): void {
		this.clearItemState();
		this.current = null;
		this.view.prompt = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		const item = this.takeNext();
		if (!item) {
			void this.finish();
			return;
		}
		this.pending = item;
		const direction = item.target.direction;
		if (this.lastDirection !== null && direction !== this.lastDirection) {
			// Switching between guitar and screen: one counted bar to get the hands there.
			this.earliestPromptBeat = Math.max(this.earliestPromptBeat, beat.index + BEATS_PER_BAR);
			this.counting = true;
			this.enterScene(direction);
		} else if (item.countIn) {
			// A new sequence at another lead: one counted bar announces it.
			this.earliestPromptBeat = Math.max(this.earliestPromptBeat, beat.index + BEATS_PER_BAR);
			this.counting = true;
			this.view.answerChoices = null;
		} else if (direction === 'locate') {
			this.view.answerChoices = null;
		}
		this.setStatus('count-in');
	}

	private async finish(): Promise<void> {
		if (this.view.status === 'finished') return;
		const run = this.run;
		const sessionId = this.sessionId;
		const fatigueDetected = this.view.fatigueDetected;
		const tempoBpm = this.sessionTempoBpm;
		const attempts = [...this.sessionAttempts];
		this.setStatus('finished');
		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = null;
		this.unsubNote = null;

		// Yield before stop when still running so onBeat→finish mid-flush does not
		// break FakeMetronome.flush (beatTime after stop throws). quit() stops sync.
		if (this.deps.metronome.isRunning()) {
			await Promise.resolve();
			if (this.run === run) this.deps.metronome.stop();
		}
		if (this.run === run) this.deps.detector.stop();

		if (this.kind === 'learn' && tempoBpm !== null) {
			// The next learn session runs at a tempo fitted to this one's mode 1 success.
			const next = nextSessionTempo(tempoBpm, attempts);
			if (next !== tempoBpm) await this.deps.settings.update({ tempoBpm: next });
		}
		const startedAt = (await this.deps.sessions.get(sessionId))?.startedAt ?? this.deps.now();
		await this.deps.sessions.put({
			id: sessionId,
			kind: this.kind,
			startedAt,
			endedAt: this.deps.now(),
			fatigueDetected,
			tempoBpm
		});
	}
}
