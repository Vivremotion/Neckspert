import { logDetection } from '$lib/debug/detectionLog';
import { DEFAULT_TEMPO_BPM, nextTempo } from '$lib/domain/exercise';
import { cardKeyOf } from '$lib/domain/mechanics';
import type { SessionSelector } from '$lib/domain/progress';
import type {
	Attempt,
	Execution,
	Locale,
	MechanicId,
	PlannedItem,
	SessionKind,
	Settings
} from '$lib/domain/types';
import type { BeatEvent } from '$lib/application/ports';
import type { MechanicPresenter, Scene, SensorKind } from '$lib/application/mechanics/types';
import { detectFatigue } from '$lib/domain/scoring';
import type { PlaySessionController, PlayView, PromptView, VerdictView } from './contract';
import type { SessionDeps } from './SessionDeps';
import {
	BEATS_PER_BAR,
	type IgnoreReason,
	type Round,
	type RoundEvent,
	type RoundOutcome
} from '$lib/domain/timing';
import { AttemptRecorder, type JudgedAnswer } from './AttemptRecorder';
import { openAudioInput } from './audioInput';
import { sessionTempo } from './executions';
import { ObservationSpan } from './observationSpan';
import type { Observation, ObservationSource } from './sensors';

type InternalStatus = PlayView['status'];

/** The sensor the screen's answer buttons feed. */
const TAP_SENSOR: SensorKind = 'tap';

/** Why an observation did not answer, as the detection log says it. */
const IGNORED_BECAUSE: Record<IgnoreReason, string> = {
	settled: 'une réponse a déjà été prise pour cette demande — celle-ci est ignorée',
	'before-window':
		'arrivée avant la consigne ou juste après son apparition, elle appartient à la précédente',
	'after-capture': 'arrivée après la fin de l’écoute hors temps'
};

/** What a series runs: its selector and the executions of its exercises, tempos frozen. */
export type PrepareSeries = (
	sessionId: string
) => Promise<{ selector: SessionSelector; executions: Execution[] }>;

function describeObservation(sensor: SensorKind, observation: Observation): string {
	return `capteur : ${sensor}, t = ${observation.time.toFixed(3)} s`;
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
	private readonly prepare: PrepareSeries;
	private selector: SessionSelector | null = null;
	/** The series' executions, tempos frozen at the start. */
	private executions: Execution[] = [];
	/** Tempo the metronome runs the series at. */
	private tempoBpm: number = DEFAULT_TEMPO_BPM;
	/** Epoch ms when the current series started; the selector measures elapsed time from it. */
	private startedAt = 0;
	/** Prompt chosen ahead of a counted bar, shown when the bar ends. */
	private pending: PlannedItem | null = null;
	/** Display of `pending`, built once so the string preview and the prompt spell the note alike. */
	private pendingPrompt: PromptView | null = null;
	/** Scene of the last prompt shown; a change opens a counted bar. */
	private lastScene: Scene | null = null;
	private settings!: Settings;
	private locale: Locale = 'fr';
	private latencyMs = 0;
	private unsubBeat: (() => void) | null = null;
	/** Observation sources open for the series, by sensor kind. */
	private sources = new Map<SensorKind, ObservationSource>();
	private closeSources: (() => void)[] = [];
	private earliestPromptBeat: number = BEATS_PER_BAR;
	/** The wait before the next prompt is a counted bar (start, resume, change of scene): 4 to 1 shows. */
	private counting = false;
	private current: PlannedItem | null = null;
	/** Timing of the current prompt, from its appearance to its verdict. */
	private round: Round | null = null;
	/**
	 * Observations of the last prompt shown, from its round's opening to the next one, a pause or
	 * the end; it outlives the round through the breathing and counted bars.
	 */
	private span: ObservationSpan | null = null;
	/** The attempt the span's round produced, completed with the span when it closes. */
	private spanAttempt: Attempt | null = null;
	private recorder: AttemptRecorder | null = null;
	private run = 0;
	private starting = false;

	constructor(
		session: { id: string; kind: SessionKind },
		prepare: PrepareSeries,
		deps: SessionDeps
	) {
		this.deps = deps;
		this.sessionId = session.id;
		this.kind = session.kind;
		this.prepare = prepare;
		this.view = $state<PlayView>({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: DEFAULT_TEMPO_BPM,
			beatsPerBar: BEATS_PER_BAR,
			promptBeatIndex: null,
			targetBeatIndex: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene: 'guitar',
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
			const { selector, executions } = await this.prepare(this.sessionId);
			if (this.run !== run) return;
			this.selector = selector;
			this.executions = executions;
			this.tempoBpm = sessionTempo(executions);
			this.view.tempoBpm = this.tempoBpm;
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
		this.executions = [];
		this.pending = null;
		this.pendingPrompt = null;
		this.view.preview = null;
		this.lastScene = null;
		this.view.scene = 'guitar';
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
		this.settings = await this.deps.settings.get();
		if (this.run !== run) return;
		this.locale = this.settings.locale;
		this.latencyMs = this.settings.calibrationOffsetMs ?? 0;
		logDetection('entrée audio', [
			`latence calibrée : ${this.latencyMs} ms (retirés du temps de l’attaque)`,
			`tempo : ${this.tempoBpm} bpm`,
			`gain micro intégré : ${this.settings.builtInInputGain}`
		]);
		if (this.selector) {
			this.recorder = new AttemptRecorder({
				attempts: this.deps.attempts,
				cards: this.deps.cards,
				clock: this.deps.clock,
				now: this.deps.now,
				selector: this.selector,
				sessionId: this.sessionId,
				rules: (mechanic) => this.presenterOf(mechanic).rules
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
		this.deps.metronome.setTempo(this.tempoBpm);
		this.deps.metronome.setAudible(this.view.scene === 'guitar');

		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: this.startedAt,
			endedAt: null,
			fatigueDetected: false,
			executions: this.executions,
			latencyMs: this.latencyMs
		});
		if (this.run !== run) return;

		this.unsubBeat?.();
		this.unsubBeat = this.deps.metronome.onBeat((beat) => this.onBeat(beat));
		this.openSources();

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
		this.closeSpan();
		this.expectAll(null, null);
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
		this.deps.metronome.setTempo(this.tempoBpm);
		this.earliestPromptBeat = BEATS_PER_BAR;
		this.counting = true;
		this.clearItemState();
		this.prepareStage();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	answer(value: string): void {
		if (this.view.status !== 'awaiting') return;
		this.sources.get(TAP_SENSOR)?.push?.(value);
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

	private presenterFor(item: PlannedItem): MechanicPresenter {
		return this.presenterOf(item.mechanic);
	}

	private presenterOf(mechanic: MechanicId): MechanicPresenter {
		const presenter = this.deps.mechanics[mechanic];
		if (!presenter) throw new Error(`No presenter for mechanic: ${mechanic}`);
		return presenter;
	}

	/**
	 * The execution a prompt belongs to, by its exercise. Its tempo is the one the attempt is
	 * judged at; a change of tempo between executions would start here (decision 4).
	 */
	private executionOf(item: PlannedItem): Execution {
		const execution = this.executions.find((e) => e.exerciseId === item.exerciseId);
		if (!execution) throw new Error(`No execution for exercise: ${item.exerciseId}`);
		return execution;
	}

	/** One source per sensor the mechanics use, opened with the calibrated latency. */
	private openSources(): void {
		this.closeAllSources();
		const kinds = new Set(Object.values(this.deps.mechanics).map((p) => p.sensor));
		for (const kind of kinds) {
			const factory = this.deps.sensors[kind];
			if (!factory) throw new Error(`No factory for sensor: ${kind}`);
			const source = factory({ latencyMs: this.latencyMs, clock: this.deps.clock });
			this.sources.set(kind, source);
			this.closeSources.push(
				source.onObservation((observation) => this.onObservation(kind, observation))
			);
		}
	}

	/** The source of `sensor` listens for `expectation`; every other source, for nothing. */
	private expectAll(sensor: SensorKind | null, expectation: unknown): void {
		for (const [kind, source] of this.sources) {
			source.expect?.(kind === sensor ? expectation : null);
		}
	}

	private closeAllSources(): void {
		this.closeSources.forEach((close) => close());
		this.closeSources = [];
		this.sources.clear();
	}

	private clearItemState(): void {
		this.round = null;
	}

	/** Settles an open late capture as unanswered and stores it; nothing otherwise. */
	private abandonRound(): void {
		const outcome = this.round?.abandon();
		if (outcome) this.settle(outcome, null);
	}

	/** Ends the open span; its attempt, if its round produced one, takes the final list. */
	private closeSpan(): void {
		const span = this.span;
		const attempt = this.spanAttempt;
		this.span = null;
		this.spanAttempt = null;
		if (!span) return;
		const observations = span.close();
		// Not awaited: the beat loop stays synchronous; finish() waits for it through the recorder.
		if (attempt) void this.recorder?.completeObservations(attempt, observations);
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
		// Prompts with a preview come in two steps: the string first, then the note on the prompt beat.
		this.view.preview =
			left <= this.presenterFor(this.pending).rules.timing.previewBeats
				? this.pendingPromptView(this.pending)
				: null;
		// The verdict stays on screen until a counted bar actually starts counting.
		if (this.view.countdown !== null) this.view.lastVerdict = null;
	}

	private promptBeatFor(item: PlannedItem, beatIndex: number): number {
		return this.presenterFor(item).rules.timing.promptBeat(
			Math.max(this.earliestPromptBeat, beatIndex),
			item
		);
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
		const presenter = this.presenterFor(this.pending);
		this.lastScene = presenter.scene;
		this.enterScene(presenter);
	}

	/** Lane and clicks for the guitar; answer pad and silence for the screen. */
	private enterScene(presenter: MechanicPresenter): void {
		this.view.scene = presenter.scene;
		this.view.answerChoices = presenter.answerChoices?.() ?? null;
		this.deps.metronome.setAudible(presenter.scene === 'guitar');
	}

	/**
	 * Keeps an observation in the open span with its fate, and routes it to the current round when
	 * it is readable and comes from the sensor of the span's prompt, judged by that prompt's
	 * mechanic. Without a span (count-in, finished), it is only logged.
	 */
	private onObservation(sensor: SensorKind, observation: Observation): void {
		const span = this.span;
		if (!span) {
			this.logSkipped(sensor, observation);
			return;
		}
		const planned = span.planned;
		const presenter = this.presenterFor(planned);
		if (!observation.readable) {
			span.add(sensor, observation, 'unreadable', null);
			logDetection('observation illisible', [
				describeObservation(sensor, observation),
				JSON.stringify(observation.payload)
			]);
			return;
		}
		if (sensor !== presenter.sensor) {
			span.add(sensor, observation, 'other-sensor', null);
			logDetection('observation ignorée', [
				`raison : la consigne en cours attend le capteur « ${presenter.sensor} »`,
				describeObservation(sensor, observation)
			]);
			return;
		}
		const judged = presenter.rules.judge(planned.item, observation.payload);
		if (!this.round) {
			// Breathing or counted bar: the round is over, its span still listens.
			span.add(sensor, observation, 'settled', judged.correct);
			this.logSkipped(sensor, observation);
			return;
		}
		const event = this.round.observe({
			time: observation.time,
			correct: judged.correct,
			answer: judged.answer
		});
		if (event.kind === 'ignored') {
			span.add(sensor, observation, event.reason, judged.correct);
			logDetection('observation ignorée', [
				`raison : ${IGNORED_BECAUSE[event.reason]}`,
				describeObservation(sensor, observation),
				...(presenter.debugLines?.(planned.item, observation.payload) ?? [])
			]);
			return;
		}
		if (event.kind === 'settled') {
			// Kept before the attempt is written: its snapshot includes the answer.
			span.add(sensor, observation, 'answer', judged.correct);
			this.logDecision(presenter, planned, sensor, observation, event.outcome);
			this.settle(event.outcome, { answer: judged.answer, confusion: judged.confusion });
			return;
		}
		// `observe` of today's time relations only ignores or settles; anything else would drop
		// the observation from the span, so it must fail loudly rather than lose it.
		throw new Error(`Round.observe returned '${event.kind}': its observation cannot be kept`);
	}

	private promptViewOf(item: PlannedItem): PromptView {
		return this.presenterFor(item).prompt(
			item.item,
			{ aid: item.aid, stringAid: item.stringAid ?? false },
			this.locale,
			this.deps.random
		);
	}

	private pendingPromptView(item: PlannedItem): PromptView {
		this.pendingPrompt ??= this.promptViewOf(item);
		return this.pendingPrompt;
	}

	/** Beat events only: a round settles with an answer on an observation, never on a beat. */
	private apply(event: RoundEvent): void {
		if (event.kind === 'provisional') this.showProvisional(event.outcome);
		else if (event.kind === 'settled') this.settle(event.outcome, null);
	}

	/**
	 * The window closed unanswered: the miss shows without its correction while the round keeps
	 * listening (off beat); the attempt waits for the round to settle.
	 */
	private showProvisional(outcome: RoundOutcome): void {
		logDetection('fenêtre fermée sans réponse', [
			`cible : ${this.current ? this.cardKeyOf(this.current) : 'inconnue'}`,
			'aucune réponse n’est arrivée pendant l’attente',
			'verdict provisoire : faux — l’écoute continue'
		]);
		this.view.lastVerdict = this.verdictView(outcome, false);
		this.addToLane(outcome);
		this.deps.cues.play(outcome.verdict);
		this.setStatus('verdict');
	}

	/**
	 * Final verdict, with its correction, and the attempt stored. After a provisional miss, the
	 * lane entry and the cue change only if the verdict did. `judged`: the mechanic's judgement
	 * of the answer, null without one.
	 */
	private settle(outcome: RoundOutcome, judged: JudgedAnswer): void {
		const provisional = this.view.status === 'verdict';
		const shown = this.view.lastVerdict?.verdict;
		this.view.lastVerdict = this.verdictView(outcome);
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
		this.persistAttempt(outcome, judged);
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
		const presenter = this.presenterFor(item);
		this.lastScene = presenter.scene;
		this.view.scene = presenter.scene;
		this.round = presenter.rules.timing.open({
			planned: item,
			promptBeat: beat.index,
			now: this.deps.clock.now(),
			beatTime: (index) => this.deps.metronome.beatTime(index),
			secondsPerBeat: this.deps.metronome.secondsPerBeat()
		});
		this.closeSpan();
		this.span = new ObservationSpan(this.round.promptTime, item);
		this.expectAll(
			presenter.sensor,
			presenter.expectation
				? presenter.expectation(item.item, { opensAt: this.round.promptTime })
				: null
		);

		// The lane runs with the guitar only; the screen answers at its own pace, in silence.
		const onLane = presenter.scene === 'guitar';
		this.deps.metronome.setAudible(onLane);
		this.view.prompt = built ?? this.promptViewOf(item);
		this.view.promptBeatIndex = onLane ? this.round.promptBeatIndex : null;
		this.view.targetBeatIndex = onLane ? this.round.targetBeatIndex : null;
		this.view.leadBeats = onLane ? item.leadBeats : null;
		this.view.answerChoices = presenter.answerChoices?.() ?? null;
		this.view.lastVerdict = null;
		this.setStatus('awaiting');
	}

	private cardKeyOf(item: PlannedItem): string {
		return cardKeyOf(this.presenterFor(item).rules, item.item);
	}

	private logSkipped(sensor: SensorKind, observation: Observation): void {
		const reasons: string[] = [];
		if (this.view.status !== 'awaiting') {
			reasons.push(`la session n’attend pas de réponse (statut : ${this.view.status})`);
		}
		if (!this.current) reasons.push('aucune question en cours');
		logDetection('observation ignorée', [
			`raison : ${reasons.join(' ; ') || 'inconnue'}`,
			describeObservation(sensor, observation)
		]);
	}

	private logDecision(
		presenter: MechanicPresenter,
		item: PlannedItem,
		sensor: SensorKind,
		observation: Observation,
		outcome: RoundOutcome
	): void {
		logDetection('décision', [
			`cible : ${this.cardKeyOf(item)}`,
			...(presenter.debugLines?.(item.item, observation.payload) ?? []),
			describeObservation(sensor, observation),
			`latence : ${this.latencyMs} ms (déjà retirée)`,
			`écart au temps : ${outcome.timingOffsetMs ?? '—'} ms`,
			`verdict : ${outcome.correct ? 'juste' : 'faux'} (${outcome.verdict})`
		]);
	}

	/** `withCorrection` false while the late capture listens: reading the fret must not answer. */
	private verdictView(outcome: RoundOutcome, withCorrection = true): VerdictView {
		const item = this.current;
		const presenter = item ? this.presenterFor(item) : null;
		const answerLabel =
			outcome.answer === null || !item || !presenter
				? null
				: presenter.answerLabel(outcome.answer, item.item, this.locale, this.deps.random);
		return {
			verdict: outcome.verdict,
			offsetMs: outcome.timingOffsetMs,
			reactionMs: outcome.reactionMs,
			answerLabel,
			correction:
				withCorrection && item && presenter
					? presenter.reveal(item.item, outcome, this.locale)
					: null
		};
	}

	private persistAttempt(outcome: RoundOutcome, judged: JudgedAnswer): void {
		if (!this.current || !this.round || !this.recorder) return;
		const { attempt } = this.recorder.record(
			this.current,
			outcome,
			this.round.promptTime,
			judged,
			this.executionOf(this.current),
			this.span?.snapshot() ?? []
		);
		if (this.span) this.spanAttempt = attempt;
		// Fatigue sees the attempt at once; the write settles on its own.
		if (detectFatigue(this.recorder.sessionAttempts)) this.view.fatigueDetected = true;
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
		const presenter = this.presenterFor(item);
		if (this.lastScene !== null && presenter.scene !== this.lastScene) {
			// Switching between guitar and screen: one counted bar to get the hands there.
			this.earliestPromptBeat = Math.max(this.earliestPromptBeat, beat.index + BEATS_PER_BAR);
			this.counting = true;
			this.enterScene(presenter);
		} else if (item.countIn) {
			// A new sequence at another lead: one counted bar announces it.
			this.earliestPromptBeat = Math.max(this.earliestPromptBeat, beat.index + BEATS_PER_BAR);
			this.counting = true;
			this.view.answerChoices = null;
		} else if (presenter.scene === 'guitar') {
			this.view.answerChoices = null;
		}
		this.setStatus('count-in');
	}

	private async finish(): Promise<void> {
		if (this.view.status === 'finished') return;
		const run = this.run;
		const sessionId = this.sessionId;
		const fatigueDetected = this.view.fatigueDetected;
		const executions = this.executions;
		const recorder = this.recorder;
		// Captured now: a series started during the awaits below re-reads the settings.
		const latencyMs = this.latencyMs;
		const attempts = [...(recorder?.sessionAttempts ?? [])];
		this.closeSpan();
		this.setStatus('finished');
		this.unsubBeat?.();
		this.unsubBeat = null;
		this.expectAll(null, null);
		this.closeAllSources();

		// Yield before stop when still running so onBeat→finish mid-flush does not
		// break FakeMetronome.flush (beatTime after stop throws). quit() stops sync.
		if (this.deps.metronome.isRunning()) {
			await Promise.resolve();
			if (this.run === run) this.deps.metronome.stop();
		}
		if (this.run === run) this.deps.detector.stop();

		if (this.kind === 'learn') {
			// Each exercise on the beat runs next at a tempo fitted to its own success here.
			for (const { exerciseId, tempoBpm } of executions) {
				if (tempoBpm === null) continue;
				const own = attempts.filter((attempt) => attempt.exerciseId === exerciseId);
				const next = nextTempo(tempoBpm, own);
				if (next === tempoBpm) continue;
				// A tempo moves only after enough attempts, so `own` names the exercise's mechanic.
				await this.deps.progressions.put({
					exerciseId,
					mechanic: own[0].mechanic,
					tempoBpm: next,
					updatedAt: this.deps.now()
				});
			}
		}
		// The ended session implies its attempts are written with their complete observations.
		await recorder?.settled();
		const startedAt = (await this.deps.sessions.get(sessionId))?.startedAt ?? this.deps.now();
		await this.deps.sessions.put({
			id: sessionId,
			kind: this.kind,
			startedAt,
			endedAt: this.deps.now(),
			fatigueDetected,
			executions,
			latencyMs
		});
	}
}
