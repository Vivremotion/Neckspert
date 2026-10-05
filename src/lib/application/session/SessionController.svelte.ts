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
	formatNote,
	pitchOnString,
	spellPitch,
	stringLabel
} from '$lib/domain/music';
import { clampTempo, nextSessionTempo, type SessionSelector } from '$lib/domain/progress';
import type {
	Answer,
	Direction,
	Locale,
	PlannedItem,
	SessionKind,
	Settings,
	Verdict
} from '$lib/domain/types';
import type { BeatEvent, NoteOnset } from '$lib/application/ports';
import { detectFatigue, type Judgement } from '$lib/domain/scoring';
import type { PlaySessionController, PlayView, PromptView, VerdictView } from './contract';
import type { SessionDeps } from './SessionDeps';
import {
	BEATS_PER_BAR,
	beatTiming,
	identifyTiming,
	STRING_PREVIEW_BEATS,
	type IgnoreReason,
	type Round,
	type RoundEvent,
	type RoundOutcome,
	type TimingRelation
} from '$lib/domain/timing';
import { AttemptRecorder } from './AttemptRecorder';
import { openAudioInput } from './audioInput';
import { buildAnswerChoices, buildCorrection, buildPromptView } from './prompt';

type InternalStatus = PlayView['status'];

/** Why a note did not answer, as the detection log says it. */
const IGNORED_BECAUSE: Record<IgnoreReason, string> = {
	settled: 'une note a déjà été prise pour cette demande — celle-ci est ignorée',
	'before-window':
		'jouée avant la consigne ou juste après son apparition, elle appartient à la précédente',
	'after-capture': 'arrivée après la fin de l’écoute hors temps'
};

/** Provisional: the time relation follows the direction until exercises name theirs. */
function timingFor(item: PlannedItem): TimingRelation {
	return item.target.direction === 'locate' ? beatTiming : identifyTiming;
}

/** The attempt fields of a round outcome; rounds keep the answer opaque. */
function judgementOf(outcome: RoundOutcome): Judgement {
	return {
		answer: outcome.answer as Answer | null,
		correct: outcome.correct,
		verdict: outcome.verdict,
		timingOffsetMs: outcome.timingOffsetMs,
		reactionMs: outcome.reactionMs
	};
}

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
	/** Display of `pending`, built once so the string preview and the prompt spell the note alike. */
	private pendingPrompt: PromptView | null = null;
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
	/** Timing of the current prompt, from its appearance to its verdict. */
	private round: Round | null = null;
	private recorder: AttemptRecorder | null = null;
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
			countdown: null,
			preview: null,
			audioError: null
		});
	}

	async start(): Promise<void> {
		if (this.starting) return;
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.starting = true;
		this.view.audioError = null;
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
		this.pendingPrompt = null;
		this.view.preview = null;
		this.lastDirection = null;
		this.view.scene = 'locate';
		this.view.countdown = null;
		this.recorder = null;
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
		if (this.selector) {
			this.recorder = new AttemptRecorder({
				attempts: this.deps.attempts,
				cards: this.deps.cards,
				clock: this.deps.clock,
				now: this.deps.now,
				selector: this.selector,
				sessionId: this.sessionId,
				tempoBpm: this.settings.tempoBpm
			});
		}

		await this.deps.clock.resume();
		if (this.run !== run) return;
		this.deps.detector.setBuiltInGain(this.settings.builtInInputGain);
		try {
			await openAudioInput(this.deps.detector, this.deps.settings, this.settings.inputDeviceId);
		} catch (error) {
			if (this.run !== run) return;
			// No input at all (refused, unplugged): say so on screen rather than fail silently.
			logDetection('entrée audio', [`ouverture impossible : ${String(error)}`]);
			this.view.audioError = 'input';
			this.setStatus('idle');
			return;
		}
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
		// A miss already shown is kept: the open late capture settles as unanswered.
		this.abandonRound();
		this.view.countdown = null;
		this.view.preview = null;
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
		if (this.view.status !== 'awaiting' || !this.round || !this.current) return;
		if (this.current.target.direction !== 'identify') return;
		const expected = pitchOnString(this.current.target.string, this.current.target.fret);
		const answer: Answer = { kind: 'name', pitch };
		this.apply(
			this.round.observe({ time: this.deps.clock.now(), correct: pitch === expected, answer })
		);
	}

	quit(): void {
		// A late capture still open settles as unanswered: the attempt is not lost.
		this.abandonRound();
		this.deps.metronome.stop();
		this.deps.detector.stop();
		void this.finish();
	}

	private setStatus(status: InternalStatus): void {
		this.view.status = status;
	}

	private clearItemState(): void {
		this.round = null;
	}

	/** Settles an open late capture as unanswered and stores it; nothing otherwise. */
	private abandonRound(): void {
		const outcome = this.round?.abandon();
		if (outcome) this.settle(outcome);
	}

	private onBeat(beat: BeatEvent): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;

		if (this.round) {
			this.apply(this.round.onBeat(beat));
			// The next prompt is chosen only once the attempt is stored and the selector knows it.
			const after = this.round.after();
			if (after && beat.index >= after.advanceAt) {
				this.earliestPromptBeat = after.earliestPrompt;
				this.advanceAfterVerdict(beat);
				// advanceAfterVerdict may set count-in or finished; TS cannot track setStatus.
				if ((this.view.status as PlayView['status']) === 'count-in') this.waitForPrompt(beat);
			}
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
		// Mode 1 prompts come in two steps: the string first, then the note on the prompt beat.
		this.view.preview =
			this.pending.target.direction === 'locate' && left <= STRING_PREVIEW_BEATS
				? this.pendingPromptView(this.pending)
				: null;
		// The verdict stays on screen until a counted bar actually starts counting.
		if (this.view.countdown !== null) this.view.lastVerdict = null;
	}

	private promptBeatFor(item: PlannedItem, beatIndex: number): number {
		return timingFor(item).promptBeat(Math.max(this.earliestPromptBeat, beatIndex), item);
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
		if (!this.round || !this.current) {
			this.logSkippedNote(onset);
			return;
		}
		const target = this.current.target;
		if (target.direction !== 'locate') {
			logDetection('note ignorée', [
				'raison : la question en cours n’est pas « joue cette note »',
				this.describeHeard(onset)
			]);
			return;
		}
		const corrected = onset.time - this.latencyMs / 1000;
		const answer: Answer = { kind: 'note', midi: onset.midi };
		const event = this.round.observe({
			time: corrected,
			correct: acceptableMidis(target).includes(onset.midi),
			answer
		});
		if (event.kind === 'ignored') {
			logDetection('note ignorée', [
				`raison : ${IGNORED_BECAUSE[event.reason]}`,
				this.describeHeard(onset)
			]);
			return;
		}
		if (event.kind === 'settled') this.logLocateDecision(onset, corrected, event.outcome);
		this.apply(event);
	}

	private pendingPromptView(item: PlannedItem): PromptView {
		this.pendingPrompt ??= buildPromptView(item, this.locale, this.deps.random);
		return this.pendingPrompt;
	}

	private apply(event: RoundEvent): void {
		if (event.kind === 'provisional') this.showProvisional(event.outcome);
		else if (event.kind === 'settled') this.settle(event.outcome);
	}

	/**
	 * Mode 1, the window closed unanswered: the miss shows without its correction while the
	 * off-beat capture listens; the attempt waits for the round to settle.
	 */
	private showProvisional(outcome: RoundOutcome): void {
		logDetection('fenêtre fermée sans note', [
			`cible : ${this.describeLocateTarget()}`,
			'aucune hauteur confirmée n’est arrivée pendant l’attente',
			'verdict provisoire : faux — l’écoute continue hors temps'
		]);
		this.view.lastVerdict = this.verdictView(judgementOf(outcome), false);
		this.addToLane(outcome);
		this.deps.cues.play(outcome.verdict);
		this.setStatus('verdict');
	}

	/**
	 * Final verdict, with its correction, and the attempt stored. After a provisional miss, the
	 * lane entry and the cue change only if the verdict did.
	 */
	private settle(outcome: RoundOutcome): void {
		const judgement = judgementOf(outcome);
		const provisional = this.view.status === 'verdict';
		const shown = this.view.lastVerdict?.verdict;
		this.view.lastVerdict = this.verdictView(judgement);
		this.view.answerChoices = null;
		if (!provisional) {
			this.addToLane(outcome);
			this.deps.cues.play(outcome.verdict);
		} else if (outcome.verdict !== shown) {
			this.view.history = this.view.history.map((entry) =>
				entry.beatIndex === outcome.laneBeat ? { ...entry, verdict: outcome.verdict } : entry
			);
			this.deps.cues.play(outcome.verdict);
		}
		this.setStatus('verdict');
		this.persistAttempt(outcome);
	}

	private addToLane(outcome: RoundOutcome): void {
		if (outcome.laneBeat === null) return;
		this.view.history = [
			...this.view.history,
			{ beatIndex: outcome.laneBeat, verdict: outcome.verdict }
		];
	}

	private beginNextItem(beat: BeatEvent): void {
		const item = this.pending ?? this.takeNext();
		const built = this.pending === item ? this.pendingPrompt : null;
		this.pending = null;
		this.pendingPrompt = null;
		this.view.preview = null;
		if (!item) {
			void this.finish();
			return;
		}
		this.current = item;
		this.view.countdown = null;
		this.lastDirection = item.target.direction;
		this.view.scene = item.target.direction;
		this.round = timingFor(item).open({
			planned: item,
			promptBeat: beat.index,
			now: this.deps.clock.now(),
			beatTime: (index) => this.deps.metronome.beatTime(index),
			secondsPerBeat: this.deps.metronome.secondsPerBeat()
		});

		if (item.target.direction === 'locate') {
			this.deps.metronome.setAudible(true);
			this.view.prompt = built ?? buildPromptView(item, this.locale, this.deps.random);
			this.view.promptBeatIndex = this.round.promptBeatIndex;
			this.view.targetBeatIndex = this.round.targetBeatIndex;
			this.view.leadBeats = item.leadBeats;
			this.view.answerChoices = null;
			this.view.lastVerdict = null;
			this.setStatus('awaiting');
			return;
		}

		this.beginIdentify(item);
	}

	private beginIdentify(item: PlannedItem): void {
		this.deps.metronome.setAudible(false);
		this.view.prompt = buildPromptView(item, this.locale, this.deps.random);
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.view.answerChoices = buildAnswerChoices();
		this.view.lastVerdict = null;
		this.setStatus('awaiting');
	}

	private logSkippedNote(onset: NoteOnset): void {
		const reasons: string[] = [];
		if (this.view.status !== 'awaiting') {
			reasons.push(`la session n’attend pas de note (statut : ${this.view.status})`);
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

	private logLocateDecision(onset: NoteOnset, corrected: number, outcome: RoundOutcome): void {
		const target = this.current?.target;
		if (!target || target.direction !== 'locate') return;
		const acceptable = acceptableMidis(target);
		const nearest = nearestAcceptable(onset.frequencyHz, acceptable);
		const lines = [
			`cible : ${this.describeLocateTarget()}`,
			`fréquences acceptées : ${describeAcceptable(acceptable)}`,
			this.describeHeard(onset),
			`latence : ${this.latencyMs} ms`,
			`temps brut ${onset.time.toFixed(3)} s → corrigé ${corrected.toFixed(3)} s`
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
		lines.push(
			`écart au temps : ${outcome.timingOffsetMs} ms`,
			outcome.correct
				? `verdict : juste (${outcome.verdict})`
				: `verdict : faux — MIDI ${onset.midi} n’est pas dans [${acceptable.join(', ')}]`
		);
		logDetection('décision', lines);
	}

	/** `withCorrection` false while the late capture listens: reading the fret must not answer. */
	private verdictView(judgement: Judgement, withCorrection = true): VerdictView {
		const answer = judgement.answer;
		const target = this.current?.target;
		const answerLabel = !answer
			? null
			: answer.kind === 'name'
				? formatNote(spellPitch(answer.pitch, this.deps.random))
				: target?.direction === 'locate'
					? formatNote(spellPitch(target.pitch, this.deps.random))
					: null;
		return {
			verdict: judgement.verdict,
			offsetMs: judgement.timingOffsetMs,
			reactionMs: judgement.reactionMs,
			answerLabel,
			correction: withCorrection ? this.correctionFor(judgement.verdict) : null
		};
	}

	private persistAttempt(outcome: RoundOutcome): void {
		if (!this.current || !this.round || !this.recorder) return;
		const { stored } = this.recorder.record(this.current, outcome, this.round.promptTime);
		// Fatigue sees the attempt at once; the write settles on its own.
		if (detectFatigue(this.recorder.sessionAttempts)) this.view.fatigueDetected = true;
		void stored;
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
		const attempts = [...(this.recorder?.sessionAttempts ?? [])];
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
