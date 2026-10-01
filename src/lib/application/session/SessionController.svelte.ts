import type { PitchName } from '$lib/domain/music/types';
import {
	acceptableMidis,
	classifyNameConfusion,
	classifyNoteConfusion,
	formatNote,
	pitchOnString,
	spellPitch
} from '$lib/domain/music';
import {
	applyColdAttempt,
	classifyTemperature,
	introduceCard,
	placementCard
} from '$lib/domain/progress';
import type {
	Attempt,
	Locale,
	PlannedItem,
	SessionPlan,
	Settings,
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
	type Judgement
} from '$lib/domain/scoring';
import type { PlaySessionController, PlayView, VerdictView } from './contract';
import type { SessionDeps } from './SessionDeps';
import { buildAnswerChoices, buildPromptView } from './prompt';

const BEATS_PER_BAR = 4 as const;

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
	private readonly kind: SessionPlan['kind'];
	private readonly series: readonly PlannedItem[];
	private queue: PlannedItem[];
	private settings!: Settings;
	private locale: Locale = 'fr';
	private latencyMs = 0;
	private unsubBeat: (() => void) | null = null;
	private unsubNote: (() => void) | null = null;
	private earliestPromptBeat: number = BEATS_PER_BAR;
	private current: PlannedItem | null = null;
	private promptBeatIndex: number | null = null;
	private targetBeatIndex: number | null = null;
	private promptTimeAudio: number | null = null;
	private windowClosesAt: number | null = null;
	private captured = false;
	private verdictBeatIndex: number | null = null;
	private sessionAttempts: Attempt[] = [];
	private sessionTempoBpm: number | null = null;
	private run = 0;
	private starting = false;

	constructor(plan: SessionPlan, deps: SessionDeps) {
		this.deps = deps;
		this.sessionId = plan.id;
		this.kind = plan.kind;
		this.series = [...plan.items];
		this.queue = [...plan.items];
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
			fatigueDetected: false
		});
	}

	async start(): Promise<void> {
		if (this.starting) return;
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.starting = true;
		const run = ++this.run;
		try {
			if (this.view.status === 'finished') this.beginNewSeries();
			await this.beginAudio(run);
		} finally {
			if (this.run === run) this.starting = false;
		}
	}

	private beginNewSeries(): void {
		this.sessionId = this.deps.newId();
		this.queue = [...this.series];
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
		this.settings = await this.deps.settings.get();
		if (this.run !== run) return;
		this.locale = this.settings.locale;
		this.latencyMs = this.settings.calibrationOffsetMs ?? 0;
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
		this.deps.metronome.setAudible(true);

		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: this.deps.now(),
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
		this.clearItemState();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	pause(): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;
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
		this.deps.metronome.setAudible(true);
		this.earliestPromptBeat = BEATS_PER_BAR;
		this.clearItemState();
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
			answerLabel
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
		this.verdictBeatIndex = null;
	}

	private onBeat(beat: BeatEvent): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;

		if (this.view.status === 'verdict') {
			if (this.verdictBeatIndex !== null && beat.index >= this.verdictBeatIndex + 1) {
				this.advanceAfterVerdict();
				// advanceAfterVerdict may set count-in or finished; TS cannot track setStatus.
				if (
					(this.view.status as PlayView['status']) === 'count-in' &&
					beat.index >= this.earliestPromptBeat
				) {
					this.beginNextItem(beat);
				}
			}
			return;
		}

		if (this.view.status === 'awaiting') {
			this.maybeCloseWindow(beat);
			return;
		}

		if (this.view.status === 'count-in' || this.view.status === 'idle') {
			if (beat.index >= this.earliestPromptBeat) {
				this.beginNextItem(beat);
			}
		}
	}

	private onNote(onset: NoteOnset): void {
		if (this.view.status !== 'awaiting' || this.captured || !this.current) return;
		if (this.current.target.direction !== 'locate') return;
		if (this.promptTimeAudio === null || this.targetBeatIndex === null) return;

		this.captured = true;
		const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
		const window = answerWindow(this.promptTimeAudio, targetTime);
		const corrected = onset.time - this.latencyMs / 1000;
		const onsetForJudge = isInWindow(corrected, window) ? onset : null;
		const judgement = judgeLocate({
			acceptable: acceptableMidis(this.current.target),
			promptTime: this.promptTimeAudio,
			targetTime,
			onset: onsetForJudge,
			latencyMs: this.latencyMs
		});
		void this.resolveLocate(judgement, this.targetBeatIndex);
	}

	private beginNextItem(beat: BeatEvent): void {
		if (this.queue.length === 0) {
			void this.finish();
			return;
		}
		const item = this.queue.shift()!;
		this.current = item;

		if (item.target.direction === 'locate') {
			this.deps.metronome.setAudible(true);
			const lead = item.leadBeats ?? 1;
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
		const judgement = judgeLocate({
			acceptable: acceptableMidis(this.current.target),
			promptTime: this.promptTimeAudio,
			targetTime: this.deps.metronome.beatTime(this.targetBeatIndex),
			onset: null,
			latencyMs: this.latencyMs
		});
		void this.resolveLocate(judgement, beat.index);
	}

	private async resolveLocate(judgement: Judgement, gapFromBeat: number): Promise<void> {
		if (!this.current || this.promptBeatIndex === null) return;
		const answerLabel =
			judgement.answer && judgement.answer.kind === 'note'
				? formatNote(
						spellPitch(
							this.current.target.direction === 'locate' ? this.current.target.pitch : 'C',
							this.deps.random
						)
					)
				: null;
		const verdictView: VerdictView = {
			verdict: judgement.verdict,
			offsetMs: judgement.timingOffsetMs,
			reactionMs: judgement.reactionMs,
			answerLabel: judgement.answer ? answerLabel : null
		};
		this.view.lastVerdict = verdictView;
		if (this.targetBeatIndex !== null) {
			this.view.history = [
				...this.view.history,
				{ beatIndex: this.targetBeatIndex, verdict: judgement.verdict }
			];
		}
		this.deps.cues.play(judgement.verdict);
		this.verdictBeatIndex = gapFromBeat;
		this.earliestPromptBeat = gapFromBeat + 1;
		this.setStatus('verdict');
		await this.persistAttempt(judgement);
	}

	private async persistAttempt(judgement: Judgement): Promise<void> {
		if (!this.current || this.promptTimeAudio === null) return;
		const item = this.current;
		const key = cardKey(item.target);
		const promptedAt = this.deps.clock.toEpochMs(this.promptTimeAudio);
		const attemptedInSession = this.sessionAttempts.some((a) => a.cardKey === key);

		// Provisional temperature for sync fatigue/session tracking; refined after history load.
		const provisionalTemperature =
			item.phase === 'learning' || item.phase === 'free'
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

		// Queue and fatigue must run before any await so the next onBeat cannot race them.
		this.sessionAttempts.push(attempt);
		if (item.repeatUntilCorrect && !judgement.correct) {
			this.queue.push(item);
		}
		if (detectFatigue(this.sessionAttempts)) {
			this.view.fatigueDetected = true;
			this.queue = this.queue.filter((q) => q.phase !== 'learning');
		}

		const history = await this.deps.attempts.listByCard(key);
		const lastAttemptAt = history.length > 0 ? history[history.length - 1].promptedAt : null;
		const temperature =
			item.phase === 'learning' || item.phase === 'free'
				? item.temperature
				: classifyTemperature({
						lastAttemptAt,
						attemptedInSession,
						now: promptedAt
					});
		attempt.temperature = temperature;

		await this.deps.attempts.add(attempt);

		const now = this.deps.now();
		if (item.phase === 'placement' && item.target.direction === 'locate') {
			const card = placementCard(item.target, attempt, now, this.sessionId, this.settings.tempoBpm);
			if (card) await this.deps.cards.put(card);
		} else if (item.phase === 'review' && temperature === 'cold') {
			const existing = await this.deps.cards.get(key);
			if (existing) {
				const fullHistory = [...history, attempt];
				await this.deps.cards.put(
					applyColdAttempt(existing, attempt, fullHistory, now, this.settings.tempoBpm)
				);
			}
		} else if (item.phase === 'learning' && judgement.correct) {
			const existing = await this.deps.cards.get(key);
			if (!existing) {
				await this.deps.cards.put(introduceCard(item.target, now, this.sessionId));
			}
		}
	}

	private advanceAfterVerdict(): void {
		this.clearItemState();
		this.current = null;
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		if (this.queue.length === 0) {
			void this.finish();
			return;
		}
		this.setStatus('count-in');
	}

	private async finish(): Promise<void> {
		if (this.view.status === 'finished') return;
		const run = this.run;
		const sessionId = this.sessionId;
		const fatigueDetected = this.view.fatigueDetected;
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

		const startedAt = (await this.deps.sessions.get(sessionId))?.startedAt ?? this.deps.now();
		await this.deps.sessions.put({
			id: sessionId,
			kind: this.kind,
			startedAt,
			endedAt: this.deps.now(),
			fatigueDetected,
			tempoBpm: this.sessionTempoBpm
		});
		if (this.kind === 'placement') {
			await this.deps.settings.update({ placementDoneAt: this.deps.now() });
		}
	}
}
