import { chordDiagramFor } from '$lib/domain/exercise/chordDiagram';
import type { ItemSource } from '$lib/domain/progress';
import { detectFatigue } from '$lib/domain/scoring/fatigue';
import { SESSION_MS, type Segment } from '$lib/domain/session';
import {
	Fraction,
	METER_4_4,
	beatPositions,
	clickAccompaniment,
	type Accompaniment,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan,
	type TempoSegment
} from '$lib/domain/time';
import {
	DEFAULT_SETTINGS,
	type Attempt,
	type Execution,
	type PlannedItem,
	type SessionKind,
	type SessionRecord,
	type Settings
} from '$lib/domain/types';
import type { MechanicPresenter, Scene } from '$lib/application/mechanics/types';
import {
	DEFAULT_PLAY_VIEW,
	type LaneEntry,
	type PlaySessionController,
	type PlayView
} from '../contract';
import { openAudioInput } from '../audioInput';
import type { AttemptRecorder } from '../AttemptRecorder';
import { sessionTempo } from '../executions';
import type { ResponseSeriesDeps } from '../SessionDeps';
import { Transport, TransportStopped } from '../transport';
import { responseAttempt } from './recordResponse';
import { RoundRunner, type RunnerEvent } from './roundRunner';
import { ceilBar, barAtOrAfter } from './seriesBars';
import { nextProgressions } from './seriesEnd';
import { SeriesItems } from './seriesItems';
import { SeriesSensors } from './seriesSensors';
import { SeriesTrace } from './seriesTrace';
import { idlePlayView } from './seriesView';

/** What a series runs: its item source and the executions of its exercises, tempos frozen. */
export type PrepareResponseSeries = (
	sessionId: string
) => Promise<{ source: ItemSource; executions: Execution[] }>;

/** A round on the transport, from its opening to the opening of the next one (or a pause, or the end). */
interface OpenRound {
	item: PlannedItem;
	plan: RoundPlan;
	runner: RoundRunner;
	execution: Execution;
	/** Transport bar of its start (its target, for a change). */
	at: Fraction;
	/** Transport bar where it ends: the next round's start when they chain. */
	end: Fraction;
	promptTime: number;
	/** Its target, in beats of the map from the series' start. */
	anchorBeat: number;
	/** Closed (handover, pause, quit): its span may still listen, the runner no longer. */
	closed: boolean;
	settled: boolean;
	/** Its attempt once written. */
	attempt: Omit<Attempt, 'id'> | null;
	segment: number | null;
}

/**
 * Plays a series of response rounds on the transport (spec amendment 2026-10-23): it takes each
 * item from its source, has its plan made (`PlanSource`), opens a `RoundRunner` on it, and places
 * the rounds on the transport: the next round at the handover of the one before when it goes on
 * without a counted bar at the same tempo and on the same scene (chained), else after a counted
 * bar (silent bars first when the item asks), the tempo changed first for an item of another
 * execution. An exercise met for the first time in the series stops on its instruction. Each
 * settled round is written (`recordResponse`), which tells the source first. It judges nothing and
 * knows no exercise: what it plays comes from its data.
 */
export class ResponseSeriesController implements PlaySessionController {
	/** A new one for each series: a start after the end begins another (`deps.newId`). */
	sessionId: string;
	readonly view: PlayView;
	readonly timeline = {
		nowBeat: (): number => {
			if (!this.begun) return 0;
			const position = this.transport.map.toPosition(this.deps.clock.now());
			return position.div(this.meter.unit).toNumber();
		}
	};

	private readonly kind: SessionKind;
	private readonly prepare: PrepareResponseSeries;
	private readonly deps: ResponseSeriesDeps;
	private readonly transport: Transport;
	private readonly meter = METER_4_4;
	private readonly click: Accompaniment;

	private source: ItemSource | null = null;
	/** The recorder of this series, from its start. */
	private recorder: AttemptRecorder | null = null;
	private executions: Execution[] = [];
	private settings: Settings = DEFAULT_SETTINGS;
	/** The preparation of this series, shared by `ready` and `start`; null until asked. */
	private preparing: Promise<void> | null = null;
	private startedAt = 0;
	private tempoBpm: number | null = null;
	/** The transport has begun at least once: its map gives the time. */
	private begun = false;
	/** Bumped by every start, stop, pause, resume and quit: a wake-up or an await of another run gives up. */
	private generation = 0;
	private starting = false;
	private quitting = false;
	private finishing: Promise<void> | null = null;
	/** The first bar the click is not scheduled for. */
	private accompaniedUntil = 0;
	private wakes: (() => void)[] = [];

	/** The item waiting for its round: placed after a counted bar, or held by a stop. */
	private pending: PlannedItem | null = null;
	/** The last round opened; its span listens until the next one opens. */
	private round: OpenRound | null = null;
	/** The item before the round to open, for its expectation; null after a stop. */
	private previous: PlannedItem | null = null;
	private lastScene: Scene | null = null;
	private readonly introduced = new Set<string>();
	/** Settled rounds since the transport last began, with their targets. */
	private history: LaneEntry[] = [];

	private readonly sensors: SeriesSensors;

	/** The round offered to « Joué juste », and whether it was pressed before its attempt was written. */
	private contestRound: OpenRound | null = null;
	private contestWanted = false;

	/** What happened, segment by segment; null before the series starts. */
	private log: SeriesTrace | null = null;
	private readonly items: SeriesItems;

	constructor(
		session: { id: string; kind: SessionKind },
		prepare: PrepareResponseSeries,
		deps: ResponseSeriesDeps
	) {
		this.sessionId = session.id;
		this.kind = session.kind;
		this.prepare = prepare;
		this.deps = deps;
		this.transport = new Transport({ clock: deps.clock, sounds: deps.sounds });
		this.items = new SeriesItems(deps.mechanics, () => this.executions, deps.exercise);
		this.sensors = new SeriesSensors(deps);
		const beats = beatPositions(this.meter).map((_, i) => i + 1);
		this.click = clickAccompaniment({ meter: this.meter, beats, accent: [1], bars: ['on'] });
		this.view = $state<PlayView>(idlePlayView());
	}

	/** What happened in the series, segment by segment; null before it starts. */
	get trace(): Segment | null {
		return this.log?.tree() ?? null;
	}

	async ready(): Promise<void> {
		if (this.view.status !== 'idle' || this.starting) return;
		const generation = this.generation;
		await this.prepareSeries();
		if (this.generation !== generation || this.view.status !== 'idle') return;
		this.pending ??= this.takeNext();
		const text = this.pending ? this.items.howToOf(this.pending, this.deps.locale()) : null;
		this.view.briefing = text === null ? null : { text };
		if (this.pending) this.showStage(this.pending, null, null);
	}

	async start(): Promise<void> {
		if (this.starting) return;
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.starting = true;
		const generation = ++this.generation;
		try {
			if (this.view.status === 'finished') this.beginNewSeries();
			this.view.audioError = null;
			await this.prepareSeries();
			if (this.generation !== generation) return;
			if (!(await this.openInput(generation))) return;
			this.recorder = this.deps.recorderFor(this.sessionId);
			this.startedAt = this.epochNow();
			const first = this.pending ?? this.takeNext();
			// Its instruction, if any, was on the start screen: no stop of its own.
			this.view.briefing = null;
			this.sensors.open(this.settings.latency.note?.ms ?? 0, (kind, observation) => {
				// An observation belongs to the span open on its arrival.
				const runner = this.round?.runner;
				if (runner && !runner.span.isClosed) runner.observe(kind, observation);
			});
			this.log = new SeriesTrace(this.deps.clock.now());
			const opened = this.deps.repositories.sessions.put(this.sessionRecord(null));
			await opened;
			if (this.generation !== generation) return;
			if (!first) {
				void this.finish();
				return;
			}
			this.introduced.add(first.exerciseId);
			await this.beginWith(first, generation);
		} finally {
			if (this.generation === generation) this.starting = false;
		}
	}

	/**
	 * Opens the guitar input with the device and built-in gain of the settings, the clock resumed
	 * before and after (the permission prompt can suspend it). False when another run took over,
	 * or when no input opens: the screen says so and a later `start` tries again.
	 */
	private async openInput(generation: number): Promise<boolean> {
		const { clock, detector, repositories } = this.deps;
		this.settings = await repositories.settings.get();
		if (this.generation !== generation) return false;
		await clock.resume();
		if (this.generation !== generation) return false;
		detector.setBuiltInGain(this.settings.builtInInputGain);
		try {
			await openAudioInput(detector, repositories.settings, this.settings.inputDeviceId);
		} catch {
			if (this.generation !== generation) return false;
			this.view.audioError = 'input';
			this.view.status = 'idle';
			return false;
		}
		if (this.generation !== generation) return false;
		await clock.resume();
		return this.generation === generation;
	}

	/** After the end: another series, with its own id and nothing of the one before. */
	private beginNewSeries(): void {
		this.sessionId = this.deps.newId();
		this.preparing = null;
		this.source = null;
		this.recorder = null;
		this.executions = [];
		this.tempoBpm = null;
		this.begun = false;
		this.quitting = false;
		this.finishing = null;
		this.accompaniedUntil = 0;
		this.pending = null;
		this.round = null;
		this.previous = null;
		this.lastScene = null;
		this.introduced.clear();
		this.history = [];
		this.withdrawContest();
		this.log = null;
		Object.assign(this.view, idlePlayView());
	}

	pause(): void {
		const { status } = this.view;
		if (status !== 'count-in' && status !== 'awaiting' && status !== 'verdict') return;
		this.generation++;
		this.starting = false;
		const now = this.deps.clock.now();
		this.stopSounds();
		this.closeRound(now);
		this.closeSpan();
		this.round = null;
		this.previous = null;
		this.withdrawContest();
		this.view.countdown = null;
		this.log?.end(now, 'interrupted');
		this.log?.openStop('pause', now);
		this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		const generation = ++this.generation;
		this.log?.closeStop(this.deps.clock.now());
		this.view.briefing = null;
		const item = this.pending ?? this.choose();
		if (!item) {
			void this.finish();
			return;
		}
		if (this.needsBriefing(item)) {
			this.brief(item);
			return;
		}
		this.pending = item;
		this.view.status = 'count-in';
		void this.beginWith(item, generation);
	}

	answer(): void {
		// Played on the instrument: nothing is tapped.
	}

	contest(): void {
		if (this.view.contest !== 'available') return;
		this.view.contest = 'done';
		const attempt = this.contestRound?.attempt;
		if (attempt) void this.recorder?.contest(attempt as Attempt);
		else this.contestWanted = true;
	}

	quit(): void {
		if (this.view.status === 'finished') return;
		this.generation++;
		this.quitting = true;
		this.closeRound(this.deps.clock.now());
		this.stopSounds();
		void this.finish();
	}

	// ── the series on the transport ──────────────────────────────────────────

	/** Prepares the series once, however many callers wait on it; a failure may be retried. */
	private prepareSeries(): Promise<void> {
		if (this.preparing) return this.preparing;
		const preparing = this.loadSeries().catch((error: unknown) => {
			if (this.preparing === preparing) this.preparing = null;
			throw error;
		});
		this.preparing = preparing;
		return preparing;
	}

	private async loadSeries(): Promise<void> {
		const sessionId = this.sessionId;
		const [series, settings] = await Promise.all([
			this.prepare(sessionId),
			this.deps.repositories.settings.get()
		]);
		// Another series began meanwhile: it has its own preparation.
		if (this.sessionId !== sessionId) return;
		this.source = series.source;
		this.executions = series.executions;
		this.settings = settings;
		this.startedAt = this.epochNow();
	}

	/** Begins the transport at `item`'s tempo: a counted bar, then its round. */
	private async beginWith(item: PlannedItem, generation: number): Promise<void> {
		const tempo = this.tempoOf(item);
		this.setTempo(tempo);
		this.pending = item;
		let playFrom: number;
		try {
			({ playFrom } = await this.transport.begin({
				meter: this.meter,
				tempo: this.segment(tempo),
				accompaniment: this.click,
				listenInBars: 0,
				countIn: true
			}));
		} catch (error) {
			if (error instanceof TransportStopped) return;
			throw error;
		}
		if (this.generation !== generation) return;
		this.begun = true;
		// A new map: its beats start again from 0, the targets before it are not on it.
		this.history = [];
		this.accompaniedUntil = playFrom;
		this.place(item, playFrom, { countBar: playFrom - 1, restFrom: null });
	}

	/**
	 * `item`'s round on bar `at`, after the counted bar `countBar` (and silent bars from `restFrom`):
	 * the bars traced as they begin, the countdown on each beat of the count, the round opened at
	 * its prompt.
	 */
	private place(
		item: PlannedItem,
		at: number,
		count: { countBar: number; restFrom: number | null }
	): void {
		this.pending = item;
		const plan = this.deps.plans(item);
		const start = Fraction.of(at);
		this.enterScene(this.items.presenterOf(item));
		this.view.status = 'count-in';
		// Not placed before its round opens: the view places it where the count ends. A round
		// settled on screen (its verdict, its drawn miss, its offer) stays until the count starts.
		const settledOnScreen = this.round?.settled === true;
		const showWaiting = () => {
			this.withdrawContest();
			this.showStage(item, null, null);
		};
		if (!settledOnScreen) showWaiting();
		if (count.restFrom !== null) {
			this.wakeAt(Fraction.of(count.restFrom), (time) => this.log?.open('rest', time));
		}
		const { countBar } = count;
		this.wakeAt(Fraction.of(countBar), (time) => this.log?.open('count-in', time));
		const beats = beatPositions(this.meter).length;
		for (let beat = 0; beat < beats; beat++) {
			this.wakeAt(Fraction.of(countBar).add(Fraction.of(beat, beats)), () => {
				if (beat === 0 && settledOnScreen) showWaiting();
				this.view.countdown = this.transport.countdownAt(countBar, beat);
			});
		}
		this.wakeAt(Fraction.of(countBar + 1), () => (this.view.countdown = null));
		const prompt = start.add((plan.prompt ?? Fraction.ZERO).div(this.transport.barLength));
		this.wakeAt(prompt, (time) => this.openRound(item, plan, start, null, time));
	}

	/**
	 * Opens `item`'s round on bar `at`; `chainedAt`, the handover it opens at without a gap. The
	 * span of the round before closes here.
	 */
	private openRound(
		item: PlannedItem,
		plan: RoundPlan,
		at: Fraction,
		chainedAt: number | null,
		promptTime: number
	): void {
		this.closeSpan();
		this.withdrawContest();
		this.pending = null;
		const presenter = this.items.presenterOf(item);
		const end = at.add(plan.length.div(this.transport.barLength));
		this.accompanyTo(end);
		const latency = this.settings.latency.note ?? null;
		const round = {
			item,
			plan,
			execution: this.items.executionOf(item),
			at,
			end,
			promptTime,
			anchorBeat: this.anchorBeatOf(at, plan),
			closed: false,
			settled: false,
			attempt: null,
			segment: null
		} as Omit<OpenRound, 'runner'> as OpenRound;
		round.runner = new RoundRunner({
			plan,
			item,
			at,
			chained: chainedAt !== null,
			transport: this.transport,
			map: this.transport.map,
			latency: latency && { ms: latency.ms, provenance: latency.provenance },
			sources: this.sensors.sources,
			expectation:
				presenter.expectation?.(item.item, { opensAt: promptTime, previous: this.previous }) ?? {},
			onEvent: (event) => this.onRunnerEvent(round, event)
		});
		this.round = round;
		this.previous = item;
		const handover = round.runner.handoverTime;
		if (handover !== null) {
			this.wakeAt(barAtOrAfter(this.transport.map, this.transport.barLength, handover), () =>
				this.handOver(round)
			);
		}
		round.segment =
			this.log?.open('round', promptTime, {
				exerciseId: item.exerciseId,
				item: this.items.cardKeyOf(item)
			}) ?? null;
		this.enterScene(presenter);
		this.view.countdown = chainedAt === null ? this.view.countdown : null;
		const definition = this.items.definitionOf(item);
		this.view.chordDiagram = presenter.feedback
			? chordDiagramFor(definition, this.settings)
			: this.settings.chordDiagram;
		this.showStage(item, null, round.anchorBeat);
		this.view.status = 'awaiting';
	}

	/**
	 * The handover of `round` (ruling R2): its expectations withdrawn and the round closed there,
	 * a settlement the withdrawal brought recorded, then the next item opened at once or placed.
	 */
	private handOver(round: OpenRound): void {
		if (this.round !== round || round.closed) return;
		const time = round.runner.handoverTime as number;
		round.closed = true;
		const outcome = round.runner.close(time);
		if (outcome) this.settle(round, outcome);
		this.log?.end(time);
		this.advance(round, time);
	}

	/** After `round`: the next item chained at its handover, placed after a count, or the end. */
	private advance(round: OpenRound, time: number): void {
		const item = this.choose();
		if (!item) {
			void this.finish();
			return;
		}
		if (this.needsBriefing(item)) {
			this.brief(item);
			return;
		}
		if (round.runner.handoverTime !== null && this.chainable(item)) {
			this.openRound(item, this.deps.plans(item), round.end, time, time);
			return;
		}
		this.placeAfter(item, Math.max(ceilBar(round.end), this.accompaniedUntil));
	}

	/** `item` after a counted bar from `bar`: at its tempo, changed first when it differs. */
	private placeAfter(item: PlannedItem, bar: number): void {
		const tempo = this.tempoOf(item);
		if (tempo !== this.tempoBpm) {
			this.setTempo(tempo);
			const { playFrom } = this.transport.changeTempo(bar, this.segment(tempo), this.click, {
				listenInBars: 0,
				countIn: true
			});
			this.accompaniedUntil = playFrom;
			this.place(item, playFrom, { countBar: playFrom - 1, restFrom: null });
			return;
		}
		const restBars = item.countIn ? (item.restBars ?? 0) : 0;
		const playFrom = this.transport.countIn(bar, { restBars });
		this.accompaniedUntil = playFrom;
		this.place(item, playFrom, { countBar: playFrom - 1, restFrom: restBars > 0 ? bar : null });
	}

	/**
	 * The next item, or null when the series ends: the source has nothing more, or `SESSION_MS`
	 * is spent and the item would begin a new passage (one that does not go on without a gap).
	 */
	private choose(): PlannedItem | null {
		const item = this.takeNext();
		if (!item) return null;
		if (this.epochNow() - this.startedAt >= SESSION_MS && !this.chainable(item)) return null;
		return item;
	}

	private takeNext(): PlannedItem | null {
		const now = this.epochNow();
		return (
			this.source?.next({
				now,
				elapsedMs: now - this.startedAt,
				fatigued: this.view.fatigueDetected
			}) ?? null
		);
	}

	/** Goes on without a gap: no counted bar asked, the same tempo, the same scene. */
	private chainable(item: PlannedItem): boolean {
		return (
			!item.countIn &&
			this.tempoOf(item) === this.tempoBpm &&
			this.items.presenterOf(item).scene === this.lastScene
		);
	}

	/**
	 * Stops before `item` to tell its exercise's instruction: nothing sounds nor wakes, the span
	 * before closed; `resume` goes on with a counted bar at the exercise's tempo.
	 */
	private brief(item: PlannedItem): void {
		const now = this.deps.clock.now();
		this.introduced.add(item.exerciseId);
		this.generation++;
		this.stopSounds();
		this.closeSpan();
		this.round = null;
		this.previous = null;
		this.pending = item;
		this.withdrawContest();
		this.view.countdown = null;
		this.view.briefing = { text: this.items.howToOf(item, this.deps.locale()) ?? '' };
		this.showStage(item, null, null);
		this.log?.end(now);
		this.log?.openStop('briefing', now);
		this.view.status = 'paused';
	}

	// ── rounds and their attempts ───────────────────────────────────────────

	private onRunnerEvent(round: OpenRound, event: RunnerEvent): void {
		if (this.round !== round || round.closed) return;
		if (event.kind === 'provisional') {
			this.view.status = 'verdict';
			this.offerContest(round, event.outcome);
			return;
		}
		this.settle(round, event.outcome);
		// A round without a handover moves on once settled.
		if (round.runner.handoverTime === null) {
			const now = this.deps.clock.now();
			round.closed = true;
			round.runner.cancel();
			this.log?.end(now);
			this.advance(round, now);
		}
	}

	/** Writes the round's attempt (the recorder tells the source), and shows the settled round. */
	private settle(round: OpenRound, outcome: RoundOutcome): void {
		if (round.settled) return;
		round.settled = true;
		const { item } = round;
		const presenter = this.items.presenterOf(item);
		const value = outcome.verdict.value as ResponseValue;
		const attempt = responseAttempt({
			outcome,
			item,
			plan: round.plan,
			data: presenter.attemptData?.(item.item, value) ?? null,
			sessionId: this.sessionId,
			execution: round.execution,
			promptedAt: this.deps.clock.toEpochMs(round.promptTime),
			cardKey: this.items.cardKeyOf(item)
		});
		const recorder = this.recorder;
		if (!recorder) return;
		// The recorder tells the source, before any write.
		const written = recorder.recordResponse(attempt, round.runner.span, item);
		round.attempt = attempt;
		const { segment } = round;
		const log = this.log;
		if (segment !== null && log) {
			written.then(
				(attemptId) => log.set(segment, { attemptId }),
				() => undefined
			);
		}
		if (detectFatigue(recorder.sessionAttempts)) this.view.fatigueDetected = true;
		this.history = [...this.history, { beatIndex: round.anchorBeat, verdict: value.verdict }];
		this.offerContest(round, outcome);
		if (this.contestRound === round && this.contestWanted) {
			this.contestWanted = false;
			void recorder.contest(attempt as Attempt);
		}
		if (this.round === round && !round.closed) this.view.status = 'verdict';
		if (this.round === round) {
			this.showStage(item, { value, success: outcome.success }, round.anchorBeat);
		}
	}

	/** Closes the round under way at `now` (pause, quit): settled if it heard enough, else dropped. */
	private closeRound(now: number): void {
		const round = this.round;
		if (!round || round.closed) return;
		round.closed = true;
		const outcome = round.runner.close(now);
		if (outcome) this.settle(round, outcome);
	}

	/**
	 * Ends the span of the last round: its expectations withdrawn first, so a window a sensor
	 * cuts short reports into it; then its attempt takes the final list (`recordResponse`).
	 */
	private closeSpan(): void {
		const runner = this.round?.runner;
		if (!runner || runner.span.isClosed) return;
		runner.withdraw();
		runner.span.close();
	}

	/** A miss of a contestable mechanic may be contested until the next round, in development only. */
	private offerContest(round: OpenRound, outcome: RoundOutcome): void {
		if (!this.deps.development) return;
		const miss = outcome.correct === false;
		if (!this.items.presenterOf(round.item).contestable || !miss) {
			this.withdrawContest();
			return;
		}
		if (this.view.contest === null) this.view.contest = 'available';
		this.contestRound = round;
	}

	private withdrawContest(): void {
		this.view.contest = null;
		this.contestRound = null;
		this.contestWanted = false;
	}

	// ── the screen ───────────────────────────────────────────────────────────

	/** The screen model of `item` in the view its exercise names, placed on its target. */
	private showStage(
		item: PlannedItem,
		settled: { value: ResponseValue; success: boolean } | null,
		anchorBeat: number | null
	): void {
		const staged = this.items
			.presenterOf(item)
			.stageOf?.(
				item.item,
				settled,
				this.deps.locale(),
				{ aid: item.aid },
				{ anchorBeat, history: [...this.history] },
				{ chordDiagram: chordDiagramFor(this.items.definitionOf(item), this.settings) }
			);
		this.view.stage = staged
			? { view: this.items.definitionOf(item).view ?? DEFAULT_PLAY_VIEW, model: staged.model }
			: null;
	}

	private enterScene(presenter: MechanicPresenter): void {
		this.lastScene = presenter.scene;
		this.view.scene = presenter.scene;
	}

	/** The beat of the round's first expectation (its target) on the map. */
	private anchorBeatOf(at: Fraction, plan: RoundPlan): number {
		const target = plan.expectations[0]?.at ?? Fraction.ZERO;
		return at.mul(this.transport.barLength).add(target).div(this.meter.unit).toNumber();
	}

	// ── the transport ────────────────────────────────────────────────────────

	/** Calls `callback` with the bar's audio time once the clock reaches bar `bar`, in this run only. */
	private wakeAt(bar: Fraction, callback: (time: number) => void): void {
		const generation = this.generation;
		const time = this.transport.map.toSeconds(bar.mul(this.transport.barLength));
		this.wakes.push(
			this.transport.at(bar, () => {
				if (this.generation === generation) callback(time);
			})
		);
	}

	/** Clicks every bar up to the one `end` falls in. */
	private accompanyTo(end: Fraction): void {
		const to = ceilBar(end);
		if (to <= this.accompaniedUntil) return;
		this.transport.accompany(this.accompaniedUntil, to, this.click);
		this.accompaniedUntil = to;
	}

	private stopSounds(): void {
		this.wakes.forEach((cancel) => cancel());
		this.wakes = [];
		this.transport.stop();
	}

	private segment(bpm: number): TempoSegment {
		return { at: Fraction.ZERO, bpm, unit: this.meter.unit };
	}

	private setTempo(tempo: number): void {
		this.tempoBpm = tempo;
		this.view.tempoBpm = tempo;
	}

	// ── the end ──────────────────────────────────────────────────────────────

	private finish(): Promise<void> {
		this.finishing ??= this.writeEnd();
		return this.finishing;
	}

	private async writeEnd(): Promise<void> {
		this.generation++;
		// A start cut short by the end gives up: a later start begins another series.
		this.starting = false;
		const now = this.deps.clock.now();
		this.stopSounds();
		this.closeRound(now);
		this.closeSpan();
		this.sensors.close();
		this.withdrawContest();
		this.view.countdown = null;
		this.view.briefing = null;
		this.view.stage = null;
		this.view.status = 'finished';
		this.log?.close(now, this.quitting ? 'quit' : 'time');
		this.deps.detector.stop();
		// Taken now: a new series started meanwhile has its own.
		const record = this.sessionRecord(null);
		const recorder = this.recorder;
		const { repositories } = this.deps;
		if (recorder && this.kind !== 'free') {
			// Each exercise on the beat runs next at a tempo fitted to its own success here.
			const moved = nextProgressions(record.executions, recorder.sessionAttempts, this.epochNow());
			for (const progression of moved) await repositories.progressions.put(progression);
		}
		// The ended session implies its attempts are written with their complete observations.
		await recorder?.settled();
		await repositories.sessions.put({ ...record, endedAt: this.epochNow() });
	}

	private sessionRecord(endedAt: number | null): SessionRecord {
		return {
			id: this.sessionId,
			kind: this.kind,
			startedAt: this.startedAt,
			endedAt,
			fatigueDetected: this.view.fatigueDetected,
			executions: this.executions,
			latencyMs: this.settings.latency.note?.ms ?? null
		};
	}

	// ── data of the items ────────────────────────────────────────────────────

	/** The tempo an item plays at: its execution's, else the series' own. */
	private tempoOf(item: PlannedItem): number {
		return (
			this.items.executionOf(item).tempoBpm ??
			this.tempoBpm ??
			sessionTempo(this.executions, item.exerciseId, item.tempoScope)
		);
	}

	/** The first item of an exercise with an instruction, in this series. */
	private needsBriefing(item: PlannedItem): boolean {
		return (
			!this.introduced.has(item.exerciseId) && this.items.howToOf(item, this.deps.locale()) !== null
		);
	}

	private epochNow(): number {
		return this.deps.clock.toEpochMs(this.deps.clock.now());
	}
}
