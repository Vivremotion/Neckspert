import { chordDiagramFor } from '$lib/domain/exercise/chordDiagram';
import { exerciseLevelsOf, pacingAt, tempoOf } from '$lib/domain/exercise/levels';
import type { ItemSource } from '$lib/domain/progress';
import { detectFatigue } from '$lib/domain/scoring/fatigue';
import {
	SESSION_MS,
	type Coming,
	type Next,
	type Segment,
	type SeriesEnd
} from '$lib/domain/session';
import {
	Fraction,
	METER_4_4,
	beatPositions,
	clickAccompaniment,
	levelRange,
	renderSounds,
	type Accompaniment,
	type Meter,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan,
	type ScheduledSound,
	type TempoSegment
} from '$lib/domain/time';
import {
	DEFAULT_SETTINGS,
	responseVerdictOf,
	type Attempt,
	type Execution,
	type PlannedItem,
	type SessionKind,
	type SessionRecord,
	type Settings
} from '$lib/domain/types';
import { SCENE_CLICKS, type Scene, type StagePlace } from '$lib/application/mechanics/types';
import {
	playViewOf,
	type Announcement,
	type LaneEntry,
	type PlaySessionController,
	type PlayView
} from './contract';
import { openAudioInput } from './audioInput';
import { asksForHeadphones } from './clickBleed';
import type { AttemptRecorder } from './AttemptRecorder';
import { sensorLatency } from './latency';
import type { SessionControllerDeps } from './SessionDeps';
import { START_DELAY_S, Transport, TransportStopped } from './transport';
import {
	aidedBeyondLevel,
	blockReadingOf,
	compilePlan,
	contentFigure,
	roundAttempt,
	roundGiven,
	runSetup,
	type RoundGiven,
	type RunSetup
} from './series/compilePlan';
import { ExerciseLevels } from './series/exerciseLevels';
import { RoundRunner, type RunnerEvent } from './series/roundRunner';
import { ceilBar, barAtOrAfter } from './series/seriesBars';
import {
	comingStart,
	inFreeTime,
	nextBeat,
	placeNext,
	type Placement,
	type PlacementContext
} from './series/placement';
import { SeriesItems } from './series/seriesItems';
import { SeriesSensors } from './series/seriesSensors';
import { SeriesTakes } from './series/seriesTakes';
import { SeriesTrace } from './series/seriesTrace';
import { idlePlayView } from './series/seriesView';
import { followsBeats, stageModel, type SeriesMoment } from './series/stage';

/** What a series runs: its item source, and its length (`SESSION_MS` when it gives none). */
export type PrepareSession = (
	sessionId: string
) => Promise<{ source: ItemSource; durationMs?: number }>;

/** A prompt not placed on the lane yet: waiting for its round. */
const NOT_PLACED = { anchorBeat: null, promptBeat: null, bands: [] } as const;

/** A round on the transport, from its opening to the opening of the next one (or a pause, or the end). */
interface OpenRound {
	item: PlannedItem;
	plan: RoundPlan;
	runner: RoundRunner;
	/** Its exercise and scope, at the tempo it plays (null in free time). */
	execution: Execution;
	/** Transport bar of its start (its target, for a change). */
	at: Fraction;
	/** Transport bar where it ends: the next round's start when they chain. */
	end: Fraction;
	promptTime: number;
	/** Its prompt, in beats of the map from the series' start. */
	promptBeat: number;
	/** Its target, in beats of the map from the series' start. */
	anchorBeat: number;
	/** Its extended expectations, in the same beats. */
	bands: StagePlace['bands'];
	/** Closed (handover, pause, quit): its span may still listen, the runner no longer. */
	closed: boolean;
	settled: boolean;
	/** Its attempt once written. */
	attempt: Omit<Attempt, 'id'> | null;
	segment: number | null;
	/** What its level gives its judge, and how long it listens past its handover. */
	given: RoundGiven;
	/** Whole bars from its run's first bar to its start; null when it does not start on a bar. */
	fromRunStart: number | null;
}

/** The run being played: where its accompaniment starts, and what plays under it. */
interface RunPlay {
	/** Transport bar of its first bar after the count: bar 0 of its accompaniment. */
	origin: number;
	/** What plays under it: its exercise's accompaniment from `origin`, else the series' click. */
	accompaniment: Accompaniment;
	/** Its accompaniment with no bar muted, heard again over its muted bars in its take; null: none. */
	unmuted: Accompaniment | null;
}

/** A cycle heard rather than played (a listen): its content sounds, nothing is judged nor written. */
interface HeardCycle {
	/** The item whose round comes after it: its content is the one heard. */
	item: PlannedItem;
	plan: RoundPlan;
	/** Transport bars of its start and of its end. */
	at: Fraction;
	end: Fraction;
	/** Whole bars from its run's first bar to its start; null when it does not start on a bar. */
	fromRunStart: number | null;
}

/** What the policy decided comes at the next place: a round (played along or not), or a heard cycle. */
type Placed = Extract<Next, { role: 'round' | 'listen' }>;

/** The sensor a plan's rounds listen to: its first expectation's; null without one. */
function sensorOf(plan: RoundPlan): string | null {
	return plan.expectations[0]?.sensor ?? null;
}

/** A cycle's successor is decided this many beats before its handover, its first bar scheduled in time. */
const DECIDE_AHEAD_BEATS = 1;

/**
 * Plays a series of rounds on the transport (spec amendment 2026-10-23): it takes each item from
 * its source, has its plan compiled (`compilePlan`: from its exercise's round template, or a cycle
 * of its figure), opens a `RoundRunner` on it, and places the rounds on the transport: the next
 * round at the handover of the one before when it goes on without a counted bar at the same tempo
 * and on the same scene (chained); after a round without a handover, once it settles, on the
 * first place its plan allows (`timedStart`, L4) or on the beat after the answer in free time
 * (D3), shown `previewBeats` before its prompt (D5); else after a counted bar (silent bars first
 * when the item asks), the tempo changed first for an item of another tempo. At each boundary the
 * policy decides (`next`, through `ExerciseLevels`): another round, a breath (a run played out:
 * the next round after a counted bar), or the end (past the series' length where the next round
 * does not chain, or the source has nothing more). An exercise met for the first time in the
 * series stops on its instruction, as its flow says (`briefing`: in each series, or only until it
 * was played once). Each settled round is written (`roundAttempt`, through the recorder, which
 * tells the source first), and moves its exercise's level (`ExerciseLevels`); a level reached
 * applies at the next round that does not chain, announced, its tempo the new level's. It keeps
 * the trace of the series (count-in, run › round, pause, instruction; a run is the rounds between
 * two counted bars) and the take of each run (`SeriesTakes`), hands both to the session memory at
 * the end, and plays the last run again from the pause (`replay`), with the latency of the sensor
 * that run listened to; the session keeps the latency of its first rounds' sensor.
 *
 * A round may be a cycle of a figure (plan H6, D8): `compilePlan` compiles it and writes its
 * attempt, `stage` builds its screen model, shown again on every beat. A run then opens with its
 * exercise's listen-in (and its counted bar, unless it has none: then the last listen-in bar
 * shows the count, silently), plays its accompaniment, muted bars silent, and its entry bars
 * before its first cycle; cycles chain at their end, what follows each decided a beat before so
 * its first bar is scheduled in time, and each keeps taking what it captured but was heard late
 * until it settles, `settleAfter` past its end. A run that ends there has its breath scheduled
 * ahead (`pacing.breathMinMs`, its accompaniment with no bar muted, the last bar counted, heard
 * only where the level has a counted bar), shown with the run's marks; the next run is decided
 * once its last cycle has settled, at the level it reached, announced at once and until its first
 * round opens (`PlayView.announcement`), its tempo changed after the breath with a listen-in and
 * its count. An exercise that can make its content sound (`contentFigure`) has it
 * demonstrated over a longer listen-in the first time the player meets it, heard on demand
 * (`listen`, a heard cycle the policy places) and, when the anti-blocking asks it, heard then
 * played along, each remedy announced; « On change d’air » ends the series and names the measure
 * that breaks. Decided ahead (a breath, an instruction) the policy is only asked, so a run, its
 * remedies and a listen asked are taken once. A pause cuts the round under way, which comes again
 * first; the last run is heard again from the pause or the breath, its muted bars clicked. It
 * judges nothing and knows no exercise: what it plays comes from its data.
 */
export class SessionController implements PlaySessionController {
	/** A new one for each series: a start after the end begins another (`deps.newId`). */
	sessionId: string;
	readonly view: PlayView;
	readonly timeline = {
		nowBeat: (): number => {
			if (!this.begun) return 0;
			const position = this.transport.map.toPosition(this.deps.clock.now());
			return position.div(this.seriesMeter.unit).toNumber();
		}
	};

	private readonly kind: SessionKind;
	private readonly prepare: PrepareSession;
	private readonly deps: SessionControllerDeps;
	private readonly transport: Transport;
	/** The meter the series plays in, its current item's exercise's; null until the transport begins. */
	private meter: Meter | null = null;
	/** Every beat clicked, accent on 1, in the series' meter. */
	private click: Accompaniment | null = null;

	private source: ItemSource | null = null;
	/** The recorder of this series, from its start. */
	private recorder: AttemptRecorder | null = null;
	/** One per (exercise, scope) met, at the tempo of its first round; written with the session. */
	private executions: Execution[] = [];
	/** Where each (exercise, scope) stands in its levels. */
	private readonly levels: ExerciseLevels;
	/** The level change announced until the round it applies to opens; kept through a pause. */
	private announcing: PlayView['announcement'] = null;
	private settings: Settings = DEFAULT_SETTINGS;
	/** The preparation of this series, shared by `ready` and `start`; null until asked. */
	private preparing: Promise<void> | null = null;
	private startedAt = 0;
	/** The series' length, as its preparation gives it. */
	private durationMs = SESSION_MS;
	/** Why the series ended on its own, once the policy says so. */
	private ended: SeriesEnd | null = null;
	private tempoBpm: number | null = null;
	/** The transport has begun at least once: its map gives the time. */
	private begun = false;
	/** Bumped by every start, stop, pause, resume and quit: a wake-up or an await of another run gives up. */
	private generation = 0;
	private starting = false;
	private quitting = false;
	/** Count of input openings begun; the latest owns the detector (`closeStale`). */
	private openings = 0;
	private finishing: Promise<void> | null = null;
	/** The first bar the click is not scheduled for. */
	private accompaniedUntil = 0;
	private wakes: (() => void)[] = [];

	/** The item waiting for its round: placed after a counted bar, or held by a stop. */
	private pending: PlannedItem | null = null;
	/** Items a pause gave back, served before the source's next: a round cut short comes again. */
	private givenBack: PlannedItem[] = [];
	/** What the policy decided comes at the place being prepared; null once it is opened. */
	private placed: Placed | null = null;
	/** The cycle heard under way, or the last one; null after a stop. */
	private heard: HeardCycle | null = null;
	/** The content was just heard (a listen, a demonstration): the next round played carries it. */
	private listened = false;
	/** The exercises demonstrated in this series, over a longer listen-in at their first encounter. */
	private readonly demonstrated = new Set<string>();
	/** The demonstration placed last, in transport bars `[from, to)`. */
	private demo: { from: number; to: number } | null = null;
	/** The breath placed last, in transport bars `[from, to)`, its last bar counted. */
	private breath: { from: number; to: number } | null = null;
	/** The series' end, once decided ahead of the end of the round under way; a pause ends it too. */
	private ending: SeriesEnd | null = null;
	/** The session record was written at the start: only then is its end written. */
	private opened = false;
	/** The first item of a session of one exercise: its record names it, with the level reached. */
	private sessionItem: PlannedItem | null = null;
	/** The last round opened; its span listens until the next one opens. */
	private round: OpenRound | null = null;
	/**
	 * Rounds past their handover still taking what they captured but was heard late, oldest
	 * first; each settles `given.settleAfter` after its end.
	 */
	private lingering: OpenRound[] = [];
	/** The run under way, from its counted bar (or listen-in) on; null before the first. */
	private run: RunPlay | null = null;
	/** The rounds of the run settled so far, oldest first. */
	private runOutcomes: RoundOutcome[] = [];
	/** The listen-in placed last, in transport bars `[from, to)`. */
	private listenIn: { from: number; to: number } | null = null;
	/** The counted bar placed last; null when the run starts without one. */
	private countBar: number | null = null;
	/** The start of the round placed and not opened yet, in transport bars. */
	private placedStart: Fraction | null = null;
	/** Sessions of each exercise ended before this series, by exercise id. */
	private endedSessions = new Map<string, number>();
	/** The exercises the player has an attempt of, from before this series. */
	private met = new Set<string>();
	/** The latency of the sensor the last run listened to, in seconds: its take is heard with it. */
	private runLatencyS = 0;
	/** The run whose take is kept: its muted bars are heard again with their click. */
	private keptRun: RunPlay | null = null;
	/**
	 * The latency of the first sensor met in the series that has one calibrated, in ms: the
	 * session's; null while none was met.
	 */
	private sessionLatencyMs: number | null = null;
	/** The item before the round to open, for its expectation; null after a stop. */
	private previous: PlannedItem | null = null;
	private lastScene: Scene | null = null;
	private readonly introduced = new Set<string>();
	/** Settled rounds since the transport last began, with their targets. */
	private history: LaneEntry[] = [];

	private readonly sensors: SeriesSensors;

	/** The round offered to « Joué juste », and whether it was pressed before its attempt was written. */
	private contestRound: OpenRound | null = null;
	/** The value drawn for each item taken from the source: it spells the item's notes alike. */
	private readonly spelling = new WeakMap<PlannedItem, number>();
	private contestWanted = false;

	/** What happened, segment by segment; null before the series starts. */
	private log: SeriesTrace | null = null;
	/** The run under way in the trace: its segment, under which its take is kept; null between runs. */
	private runSegment: number | null = null;
	/**
	 * A counted bar is placed: the run under way ends where it begins (or where the next round
	 * opens, if sooner), and the input is kept from the next run's first prompt.
	 */
	private runEnding: { keepFrom: number } | null = null;
	/** The input of each run, the last one to be heard again from the pause (`replay`). */
	private readonly takes: SeriesTakes;
	private readonly items: SeriesItems;

	constructor(
		session: { id: string; kind: SessionKind },
		prepare: PrepareSession,
		deps: SessionControllerDeps
	) {
		this.sessionId = session.id;
		this.kind = session.kind;
		this.prepare = prepare;
		this.deps = deps;
		this.transport = new Transport({ clock: deps.clock, sounds: deps.sounds });
		this.takes = new SeriesTakes({ takes: deps.takes, sounds: deps.sounds });
		this.items = new SeriesItems(deps.mechanics, deps.exercise);
		this.levels = new ExerciseLevels({
			levels: deps.levels,
			exercise: deps.exercise,
			now: () => this.epochNow()
		});
		this.sensors = new SeriesSensors(deps);
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
		const waiting = this.pending ?? this.takeNext();
		// Shown at the level its exercise will play at.
		this.pending = waiting && this.leveled(waiting);
		const text = this.pending ? this.briefingOf(this.pending) : null;
		this.view.briefing = text === null ? null : { text };
		if (!this.pending) return;
		// Not refused: a first encounter still reads its instruction below.
		const sensor = sensorOf(this.planOf(this.pending, this.meterOf(this.pending)));
		if (asksForHeadphones(this.settings.clickBleed, sensor)) this.view.audioError = 'bleed';
		this.showStage(this.pending, null, NOT_PLACED);
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
			this.sessionItem = first;
			if (first) this.meetSensor(this.planOf(first, this.meterOf(first)));
			// Its instruction, if any, was on the start screen: no stop of its own.
			this.view.briefing = null;
			this.sensors.open(
				(kind) => sensorLatency(this.settings.latency, kind)?.ms ?? 0,
				(kind, observation) => {
					// A round past its handover takes first what it captured but was heard late.
					for (const late of this.lingering) if (late.runner.offerLate(kind, observation)) return;
					// An observation belongs to the span open on its arrival.
					const runner = this.round?.runner;
					if (runner && !runner.span.isClosed) runner.observe(kind, observation);
				}
			);
			// A new series: the takes of the one before are not this one's.
			this.takes.clear();
			this.log = new SeriesTrace(this.deps.clock.now());
			this.opened = true;
			const opened = this.deps.repositories.sessions.put(this.sessionRecord(null));
			await opened;
			if (this.generation !== generation) return;
			if (!first) {
				this.end('complete');
				return;
			}
			// The first round opens the first run of its exercise.
			const decided = this.decide(first, { chains: false, countIn: true });
			if (decided.next.role === 'end') {
				this.end(decided.next.reason);
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
		// This opening owns the detector until another begins.
		const opening = ++this.openings;
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
		// A quit during the permission prompt: the input opens after the end, which closed nothing.
		if (this.generation !== generation) return this.closeStale(detector, opening);
		await clock.resume();
		return this.generation === generation || this.closeStale(detector, opening);
	}

	/**
	 * Closes an input that finished opening for a run that has ended (always false), unless a
	 * later opening has begun: that one owns the detector now, and a stop would be its own.
	 */
	private closeStale(detector: { stop(): void }, opening: number): false {
		if (this.openings === opening) detector.stop();
		return false;
	}

	/** After the end: another series, with its own id and nothing of the one before. */
	private beginNewSeries(): void {
		this.sessionId = this.deps.newId();
		this.preparing = null;
		this.source = null;
		this.recorder = null;
		this.executions = [];
		this.announcing = null;
		this.tempoBpm = null;
		this.begun = false;
		this.meter = null;
		this.click = null;
		this.quitting = false;
		this.ended = null;
		this.finishing = null;
		this.accompaniedUntil = 0;
		this.pending = null;
		this.givenBack = [];
		this.placed = null;
		this.heard = null;
		this.listened = false;
		this.demonstrated.clear();
		this.demo = null;
		this.breath = null;
		this.ending = null;
		this.opened = false;
		this.sessionItem = null;
		this.round = null;
		this.lingering = [];
		this.run = null;
		this.keptRun = null;
		this.runOutcomes = [];
		this.runLatencyS = 0;
		this.sessionLatencyMs = null;
		this.listenIn = null;
		this.countBar = null;
		this.placedStart = null;
		this.previous = null;
		this.lastScene = null;
		this.introduced.clear();
		this.history = [];
		this.withdrawContest();
		this.log = null;
		this.runSegment = null;
		this.runEnding = null;
		Object.assign(this.view, idlePlayView());
	}

	pause(): void {
		const { status } = this.view;
		if (status !== 'count-in' && status !== 'awaiting' && status !== 'verdict') return;
		this.generation++;
		this.starting = false;
		const now = this.deps.clock.now();
		// Before the sounds stop: stopping empties the journal the take reads its sounds from.
		this.cutRun(now, 'interrupted');
		this.stopSounds();
		// A round cut short (judged whole, its end not reached) comes again first.
		const cut = this.closeRound(now);
		if (cut) this.giveBack(cut.item);
		this.closeLingering(now);
		this.closeSpan();
		this.round = null;
		this.previous = null;
		this.forgetPlaces();
		// Play goes on with a new run; a listen asked is forgotten.
		this.levels.interrupt();
		this.withdrawContest();
		this.view.countdown = null;
		this.log?.end(now, 'interrupted');
		// The end was decided already: the pause does not bring the series back.
		if (this.ending) {
			this.end(this.ending);
			return;
		}
		this.log?.openStop('pause', now);
		this.view.status = 'paused';
	}

	/** `item`, cut short, comes again before the item that was waiting, which comes after it. */
	private giveBack(item: PlannedItem): void {
		if (this.pending && this.pending !== item) this.givenBack.unshift(this.pending);
		this.pending = item;
	}

	/** What was placed on the transport is gone with it: the policy decides again when play goes on. */
	private forgetPlaces(): void {
		this.placed = null;
		this.heard = null;
		this.demo = null;
		this.breath = null;
	}

	resume(): void {
		void this.goOn();
	}

	/** From the pause: play goes on as `resume` says, once the transport has begun again. */
	private goOn(): Promise<void> {
		if (this.view.status !== 'paused') return Promise.resolve();
		// A replay under way stops: play goes on.
		this.takes.stop();
		const generation = ++this.generation;
		this.log?.closeStop(this.deps.clock.now());
		this.view.briefing = null;
		const item = this.pending ?? this.takeNext();
		if (!item) {
			this.end('complete');
			return Promise.resolve();
		}
		// A stop is a boundary: the series goes on after a counted bar, unless its length is spent.
		// Before an instruction, the policy is only asked: the item counts in the run after it.
		const briefing = this.needsBriefing(item);
		const decided = this.decide(item, { chains: false, countIn: true }, briefing);
		if (decided.next.role === 'end') {
			this.end(decided.next.reason);
			return Promise.resolve();
		}
		if (briefing) {
			this.brief(item);
			return Promise.resolve();
		}
		this.pending = item;
		this.view.status = 'count-in';
		return this.beginWith(item, generation);
	}

	/** A tapped value, pushed to every source fed by the screen while a round awaits or shows its verdict. */
	answer(value: string): void {
		const { status } = this.view;
		if (status !== 'awaiting' && status !== 'verdict') return;
		for (const source of this.sensors.sources.values()) source.push?.(value);
	}

	contest(): void {
		if (this.view.contest !== 'available') return;
		this.view.contest = 'done';
		const attempt = this.contestRound?.attempt;
		if (attempt) void this.recorder?.contest(attempt as Attempt);
		else this.contestWanted = true;
	}

	/**
	 * « Écouter », while playing: the next round of the exercise under way is heard rather than
	 * played (a heard cycle), where its level gives listening and its content can sound; then play
	 * goes on. The policy decides where it comes (`askListen`).
	 */
	listen(): void {
		const { status } = this.view;
		if (status !== 'count-in' && status !== 'awaiting' && status !== 'verdict') return;
		const item = this.pending ?? this.heard?.item ?? this.round?.item;
		if (item) this.levels.askListen(item.exerciseId, item.scope);
	}

	/**
	 * « Réécouter », from the pause or the breath: the last run as the input heard it, its clicks
	 * put back, over its muted bars too; then on as after a pause. Writes nothing and opens no
	 * round; does nothing elsewhere, before a run was played, or on an instruction.
	 */
	async replay(): Promise<void> {
		if (this.view.briefing) return;
		const take = this.takes.last();
		if (!take) return;
		if (this.view.status !== 'paused') {
			// From the breath, the run just played: play stops first, as at a pause.
			if (!this.inBreath()) return;
			this.pause();
			// The end was decided already: the pause ended the series.
			if (this.view.status === 'finished') return;
		}
		const generation = ++this.generation;
		try {
			await this.takes.play(take, this.runLatencyS);
		} catch (error) {
			// Not heard again, but play goes on as after a pause.
			console.warn('The last run could not be played again', error);
		}
		if (this.generation !== generation || this.view.status !== 'paused') return;
		await this.goOn();
	}

	quit(): void {
		if (this.view.status === 'finished') return;
		this.generation++;
		this.quitting = true;
		const now = this.deps.clock.now();
		this.takes.stop();
		this.cutRun(now, 'interrupted');
		this.closeRound(now);
		this.closeLingering(now);
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
		const [series, settings, sessions, attempts] = await Promise.all([
			this.prepare(sessionId),
			this.deps.repositories.settings.get(),
			this.deps.repositories.sessions.list(),
			this.deps.repositories.attempts.all(),
			// Read again for each series: it starts where the last one left each level.
			this.levels.load()
		]);
		// Another series began meanwhile: it has its own preparation.
		if (this.sessionId !== sessionId) return;
		this.source = series.source;
		this.durationMs = series.durationMs ?? SESSION_MS;
		this.met = new Set(attempts.map((attempt) => attempt.exerciseId));
		this.endedSessions = new Map();
		for (const session of sessions) {
			if (session.endedAt === null || session.exerciseId === undefined) continue;
			const ended = this.endedSessions.get(session.exerciseId) ?? 0;
			this.endedSessions.set(session.exerciseId, ended + 1);
		}
		this.settings = settings;
		this.startedAt = this.epochNow();
	}

	/**
	 * Begins the transport at `item`'s tempo: its exercise's listen-in (none for most), its content
	 * demonstrated over more bars of it the first time the player meets an exercise that can make
	 * it sound, a counted bar unless its run starts without one, then its round. A level its
	 * exercise reached applies here: the transport begins at its tempo.
	 */
	private async beginWith(waiting: PlannedItem, generation: number): Promise<void> {
		// A level reached is told from the listen-in on.
		if (this.applyLevel(waiting)) this.view.announcement = this.announcing;
		const item = this.leveled(waiting);
		this.setMeter(this.meterOf(item));
		const tempo = this.tempoFor(item);
		this.setTempo(tempo);
		this.pending = item;
		const setup = this.runSetupOf(item);
		const met = this.met.has(item.exerciseId) || this.demonstrated.has(item.exerciseId);
		const demonstration = met ? null : contentFigure(this.items.definitionOf(item), item);
		const demoBars = demonstration?.bars ?? 0;
		let playFrom: number;
		try {
			({ playFrom } = await this.transport.begin({
				meter: this.seriesMeter,
				tempo: this.segment(tempo),
				accompaniment: setup.listenIn ?? this.seriesClick,
				listenInBars: setup.listenInBars + demoBars,
				countIn: setup.countIn,
				audible: this.clicksOn(item)
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
		// The places of the map before are not on this one; what the policy decided for this
		// item (`placed`: a remedy, a listen) is, and opens after the count.
		this.heard = null;
		this.demo = null;
		this.breath = null;
		this.listenIn = { from: 0, to: setup.listenInBars };
		if (setup.listenInBars > 0)
			this.wakeAt(Fraction.ZERO, (time) => this.log?.open('listen-in', time));
		if (demonstration) {
			const from = setup.listenInBars;
			this.transport.playFigure(demonstration, 'demo', from);
			this.demo = { from, to: from + demoBars };
			this.demonstrated.add(item.exerciseId);
			// Heard: the next round played carries it.
			this.listened = true;
			this.wakeAt(Fraction.of(from), (time) => this.log?.open('listen', time));
		}
		if (followsBeats(this.items.definitionOf(item))) this.tick(0, 0);
		// Without a counted bar, the last bar before play shows the count, silently.
		this.place(item, playFrom, {
			countBar: playFrom - 1,
			restFrom: null,
			...(!setup.countIn && { shownIn: 'listen-in' as const })
		});
	}

	/**
	 * Lays `item`'s round (or its heard cycle) on bar `at` before it begins, so its first beat is
	 * not already past when it opens: its accompaniment, muted bars silent, and its content when it
	 * sounds (heard, or played along). For a round judged whole and every chained one.
	 */
	private layAhead(item: PlannedItem, plan: RoundPlan, at: Fraction): void {
		if (this.clicksOn(item)) this.accompanyRound(at, plan);
		const placed = this.placed;
		const sound =
			placed?.role === 'listen'
				? 'demo'
				: placed?.role === 'round' && placed.aid === 'play-along'
					? 'play-along'
					: null;
		if (sound) this.playContent(item, plan, at, sound);
	}

	/** `item`'s content sounds over its round on bar `at`, from each loop of its figure that fits. */
	private playContent(
		item: PlannedItem,
		plan: RoundPlan,
		at: Fraction,
		sound: 'demo' | 'play-along'
	): void {
		const figure = contentFigure(this.items.definitionOf(item), item);
		if (!figure) return;
		const bars = plan.length.div(this.transport.barLength).toNumber();
		const first = at.toNumber();
		const fromRunStart = this.fromRunStart(at) ?? 0;
		for (let bar = 0; bar < bars; bar++) {
			if ((fromRunStart + bar) % figure.bars !== 0 || bar + figure.bars > bars) continue;
			this.transport.playFigure(figure, sound, first + bar);
		}
	}

	/** How `item`'s run opens and what plays under it, at the level it plays. */
	private runSetupOf(item: PlannedItem): RunSetup {
		return runSetup(this.items.definitionOf(item), item.exerciseLevel);
	}

	/**
	 * `item`'s round after the counted bar `countBar` (and silent bars from `restFrom`), on the
	 * first place `earliest` (the bar after the count) allows with its prompt still to come: the
	 * bars traced as they begin, the countdown on each beat of the count, the round opened at its
	 * prompt.
	 */
	private place(
		item: PlannedItem,
		earliest: number,
		count: {
			countBar: number | null;
			restFrom: number | null;
			/**
			 * The counted bar is the last of a breath, or of a listen-in with no counted bar after
			 * it: traced and shown as that, the count shown over it.
			 */
			shownIn?: 'breath' | 'listen-in';
		}
	): void {
		this.pending = item;
		// A new run from `earliest`: its accompaniment starts there, its entry bars first.
		const setup = this.runSetupOf(item);
		this.run = {
			origin: earliest,
			accompaniment: setup.accompaniment(earliest) ?? this.seriesClick,
			unmuted: setup.listenIn
		};
		this.countBar = count.countBar;
		const plan = this.planOf(item, this.seriesMeter, setup.entryBars);
		const start = comingStart(
			plan,
			this.seriesMeter,
			Fraction.of(earliest + setup.entryBars),
			this.nowBar()
		);
		this.placedStart = start;
		// The level change, if any, is told with the count.
		const announce = () => (this.view.announcement = this.announcing);
		const promptBeat = this.promptBeatOf(start, plan);
		// The bars between the count and the round clicked now: laid at the prompt, their beats
		// before it would already be past.
		if (this.clicksOn(item)) this.accompanyTo(start);
		// A round judged whole is laid now, its first beat on its start.
		if (roundGiven(this.items.definitionOf(item), item).settleAfter !== null) {
			this.layAhead(item, plan, start);
		}
		this.enterScene(item);
		if (count.shownIn !== 'breath') this.view.status = 'count-in';
		// Not placed before its round opens: the view places it where the count ends. A round
		// settled on screen (its verdict, its drawn miss, its offer) stays until the count starts.
		const settledOnScreen = this.round?.settled === true;
		const showWaiting = () => {
			this.withdrawContest();
			this.showStage(item, null, { ...NOT_PLACED, promptBeat });
		};
		if (!settledOnScreen) showWaiting();
		// The run under way ends with the count (or its rest); the next one is kept from its prompt,
		// or from its first bar when entry bars come before its first round: the run opens there.
		const keepAt = setup.entryBars > 0 ? Fraction.of(earliest) : this.promptOf(start, plan);
		const keepFrom = this.transport.map.toSeconds(keepAt.mul(this.transport.barLength));
		this.runEnding = { keepFrom };
		if (setup.entryBars > 0) {
			this.wakeAt(Fraction.of(earliest), (time) => this.openRun(item, plan, time));
		}
		if (count.restFrom !== null) {
			this.wakeAt(Fraction.of(count.restFrom), (time) => {
				this.endRunIfEnding(time);
				this.log?.open('rest', time);
			});
		}
		const { countBar } = count;
		if (countBar === null) {
			// No counted bar: the run before ends where this one begins.
			this.wakeAt(Fraction.of(earliest), (time) => {
				this.endRunIfEnding(time);
				announce();
				if (settledOnScreen) showWaiting();
			});
			this.openAtPrompt(item, plan, start);
			return;
		}
		this.wakeAt(Fraction.of(countBar), (time) => {
			this.endRunIfEnding(time);
			if (!count.shownIn) this.log?.open('count-in', time);
		});
		const beats = beatPositions(this.seriesMeter).length;
		for (let beat = 0; beat < beats; beat++) {
			this.wakeAt(Fraction.of(countBar).add(Fraction.of(beat, beats)), () => {
				if (beat === 0) announce();
				if (beat === 0 && settledOnScreen) showWaiting();
				this.view.countdown = this.transport.countdownAt(countBar, beat);
			});
		}
		this.wakeAt(Fraction.of(countBar + 1), () => (this.view.countdown = null));
		this.openAtPrompt(item, plan, start);
	}

	/**
	 * `item` after a round without a handover, with no counted bar, on `start` (placed from the end
	 * of that round, or the beat after its answer in free time, never with its prompt already
	 * past): the settled round stays on screen until the item shows, `previewBeats` before its prompt
	 * (D5), or at its prompt.
	 */
	private placeFollowing(item: PlannedItem, plan: RoundPlan, start: Fraction): void {
		this.pending = item;
		// No count: a level change, if any, is told through the breath.
		this.view.announcement = this.announcing;
		if (this.clicksOn(item)) this.accompanyTo(start);
		const { previewBeats } = this.items.flowOf(item);
		if (previewBeats !== null) {
			const preview = this.seriesMeter.unit
				.mul(Fraction.of(previewBeats))
				.div(this.transport.barLength);
			const promptBeat = this.promptBeatOf(start, plan);
			this.wakeAt(this.promptOf(start, plan).sub(preview), () => {
				this.withdrawContest();
				this.showStage(item, null, { ...NOT_PLACED, promptBeat });
			});
		}
		this.openAtPrompt(item, plan, start);
	}

	/**
	 * The plan of `item`'s round in the series' meter (`compilePlan`); `fromRunStart`, where it
	 * starts in whole bars from its run's first bar, when known.
	 */
	private planOf(
		item: PlannedItem,
		meter: Meter = this.seriesMeter,
		fromRunStart: number | null = null
	): RoundPlan {
		return compilePlan(this.items.definitionOf(item), item, meter, {
			previewBeats: this.items.flowOf(item).previewBeats ?? 0,
			fromRunStart
		});
	}

	/** Whole bars from the run's first bar to `at`; null when `at` is not on a bar or no run is under way. */
	private fromRunStart(at: Fraction): number | null {
		if (!this.run) return null;
		const bars = at.sub(Fraction.of(this.run.origin));
		return bars.compare(Fraction.ZERO) >= 0 && Number.isInteger(bars.toNumber())
			? bars.toNumber()
			: null;
	}

	/**
	 * Opens `item`'s round at its prompt, the round starting on bar `start`; or its heard cycle,
	 * when the policy decided a listen comes first.
	 */
	private openAtPrompt(item: PlannedItem, plan: RoundPlan, start: Fraction): void {
		this.wakeAt(this.promptOf(start, plan), (time) => {
			if (this.placed?.role === 'listen') {
				this.openHeard(item, plan, start, time);
				return;
			}
			// In free time the round counts from the instant it opens, not from the beat it was due.
			this.openRound(item, plan, start, null, inFreeTime(plan) ? this.deps.clock.now() : time);
		});
	}

	/**
	 * Opens on bar `at` a cycle of `item`'s content heard rather than played (a listen, laid ahead):
	 * no round, no attempt; the item's round comes after it, as the policy decides a beat before
	 * its end (`afterHeard`). The span of the round before listens on until the next round opens.
	 */
	private openHeard(item: PlannedItem, placed: RoundPlan, at: Fraction, time: number): void {
		const remedy = this.placed?.role === 'listen' && this.placed.remedy;
		this.placed = null;
		this.pending = item;
		this.placedStart = null;
		this.withdrawContest();
		const fromRunStart = this.fromRunStart(at);
		const plan = fromRunStart === null ? placed : this.planOf(item, this.seriesMeter, fromRunStart);
		const end = at.add(plan.length.div(this.transport.barLength));
		const heard: HeardCycle = { item, plan, at, end, fromRunStart };
		this.heard = heard;
		this.listened = true;
		this.openRun(item, plan, time);
		this.log?.open('listen', time);
		this.announcing = null;
		this.view.announcement = remedy ? this.announcementOf('listen-remedy', item) : null;
		this.enterScene(item);
		this.view.countdown = null;
		this.view.status = 'awaiting';
		this.showStage(item, null, { ...NOT_PLACED, plan });
		const ahead = this.seriesMeter.unit
			.mul(Fraction.of(DECIDE_AHEAD_BEATS))
			.div(this.transport.barLength);
		const decideAt = end.sub(ahead).compare(at) > 0 ? end.sub(ahead) : at;
		this.wakeAt(decideAt, () => this.afterHeard(heard));
	}

	/**
	 * A beat before the end of a heard cycle: `item`'s round chained after it (or another heard
	 * cycle), laid now; or a breath, or the end, as the policy decides.
	 */
	private afterHeard(heard: HeardCycle): void {
		if (this.heard !== heard) return;
		const { item, end } = heard;
		const coming = { chains: true, countIn: false };
		const looked = this.decide(item, coming, true);
		if (looked.next.role === 'end') {
			const reason = looked.next.reason;
			this.ending = reason;
			this.wakeAt(end, (time) => {
				this.endRun(time, 'done');
				this.end(reason);
			});
			return;
		}
		if (looked.breath) {
			this.breatheAfter(null, end, item);
			return;
		}
		this.decide(item, coming);
		const fromRunStart = this.fromRunStart(end);
		const plan = this.planOf(item, this.seriesMeter, fromRunStart);
		this.layAhead(item, plan, end);
		this.wakeAt(end, (time) => {
			if (this.placed?.role === 'listen') this.openHeard(item, plan, end, time);
			else this.openRound(item, plan, end, time, time);
		});
	}

	/** The bar of the prompt of a round starting at `start`, in bars. */
	private promptOf(start: Fraction, plan: RoundPlan): Fraction {
		return start.add((plan.prompt ?? Fraction.ZERO).div(this.transport.barLength));
	}

	/**
	 * Opens `item`'s round on bar `at`; `chainedAt`, the handover it opens at without a gap. The
	 * span of the round before closes here.
	 */
	private openRound(
		item: PlannedItem,
		placed: RoundPlan,
		at: Fraction,
		chainedAt: number | null,
		promptTime: number
	): void {
		this.closeSpan();
		this.withdrawContest();
		this.pending = null;
		this.placedStart = null;
		this.heard = null;
		// Helped by the content heard before it, or played along (a remedy, announced as it plays).
		const decided = this.placed;
		this.placed = null;
		const playAlong = decided?.role === 'round' && decided.aid === 'play-along';
		const help = { listened: this.listened, playAlong };
		this.listened = false;
		this.announcing = null;
		this.view.announcement =
			playAlong && decided.remedy ? this.announcementOf('play-along', item) : null;
		const presenter = this.items.presenterOf(item);
		const fromRunStart = this.fromRunStart(at);
		// Compiled where it falls in its run: a cycle's place in the loops of its figure.
		const plan = fromRunStart === null ? placed : this.planOf(item, this.seriesMeter, fromRunStart);
		this.meetSensor(plan);
		const given = roundGiven(this.items.definitionOf(item), item, help);
		const end = at.add(plan.length.div(this.transport.barLength));
		if (this.clicksOn(item)) this.accompanyRound(at, plan);
		const round = {
			item,
			plan,
			execution: this.executionOf(item, plan),
			at,
			end,
			promptTime,
			promptBeat: this.promptBeatOf(at, plan),
			anchorBeat: this.anchorBeatOf(at, plan),
			bands: this.bandsOf(at, plan),
			closed: false,
			settled: false,
			attempt: null,
			segment: null,
			given,
			fromRunStart
		} as Omit<OpenRound, 'runner'> as OpenRound;
		round.runner = new RoundRunner({
			plan,
			item,
			at,
			chained: chainedAt !== null,
			openedAt: promptTime,
			transport: this.transport,
			map: this.transport.map,
			latencyOf: (kind) => sensorLatency(this.settings.latency, kind),
			thresholds: given.thresholds,
			aids: given.aids,
			sources: this.sensors.sources,
			expectation:
				presenter.expectation?.(item.item, { opensAt: promptTime, previous: this.previous }) ?? {},
			// A presenter reads the payloads of its own sensors, not a bare attack heard by another.
			debug: {
				lines: (payload, sensor) =>
					presenter.sensors.includes(sensor)
						? (presenter.debugLines?.(item.item, payload) ?? [])
						: []
			},
			onEvent: (event) => this.onRunnerEvent(round, event)
		});
		this.round = round;
		this.previous = item;
		const handover = round.runner.handoverTime;
		if (handover !== null) {
			const bar = barAtOrAfter(this.transport.map, this.transport.barLength, handover);
			if (given.settleAfter === null) {
				this.wakeAt(bar, () => this.handOver(round));
			} else {
				// It listens on past its handover: what follows is decided a beat before, so the
				// next round's first bar is scheduled before it begins.
				const ahead = this.seriesMeter.unit
					.mul(Fraction.of(DECIDE_AHEAD_BEATS))
					.div(this.transport.barLength);
				const decideAt = bar.sub(ahead).compare(at) > 0 ? bar.sub(ahead) : at;
				this.wakeAt(decideAt, () => this.decideAhead(round));
			}
		}
		this.openRun(item, plan, promptTime);
		round.segment =
			this.log?.open('round', promptTime, {
				exerciseId: item.exerciseId,
				item: this.items.cardKeyOf(item)
			}) ?? null;
		this.enterScene(item);
		this.view.countdown = chainedAt === null ? this.view.countdown : null;
		this.showStage(item, null, round);
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
		this.advance(round, time, round.end);
	}

	/**
	 * A beat before the handover of a round that listens on past it: what follows is decided now
	 * and placed; the round itself goes on to its handover (`lingerOn`).
	 */
	private decideAhead(round: OpenRound): void {
		if (this.round !== round || round.closed) return;
		const time = round.runner.handoverTime as number;
		this.advance(round, time, round.end, true);
	}

	/**
	 * `round` at its handover, listening on: its expectations withdrawn, still taking what it
	 * captured but was heard late, settled `given.settleAfter` after its end (`settleLingering`).
	 */
	private lingerOn(round: OpenRound): void {
		if (round.closed) return;
		const time = round.runner.handoverTime as number;
		round.closed = true;
		round.runner.withdraw();
		this.lingering.push(round);
		this.log?.end(time);
		const after = round.given.settleAfter ?? Fraction.ZERO;
		this.wakeAt(round.end.add(after), (at) => this.settleLingering(round, at));
	}

	/** Settles a round that listened on past its handover; its span closes once the next round opened. */
	private settleLingering(round: OpenRound, now: number): void {
		const index = this.lingering.indexOf(round);
		if (index < 0) return;
		this.lingering.splice(index, 1);
		const outcome = round.runner.close(now);
		if (outcome) this.settle(round, outcome);
		// The round on show keeps its span open until the next one opens (`closeSpan`).
		if (this.round !== round && !round.runner.span.isClosed) round.runner.span.close();
	}

	/** Settles every round still listening past its handover, now (a pause, an instruction, the end). */
	private closeLingering(now: number): void {
		for (const round of [...this.lingering]) this.settleLingering(round, now);
	}

	/**
	 * After `round`: the next item chained at its handover, placed from `earliest` without a
	 * count when `round` has no handover, placed after a count, or the end, as the policy decides
	 * from where the item would go. `ahead`: decided before the handover of a round that listens
	 * on past it, which goes on until then (`lingerOn`); a chained round opens at the handover, an
	 * instruction stops there, and the end comes once the round is settled.
	 */
	private advance(round: OpenRound, time: number, earliest: Fraction, ahead = false): void {
		const handover = round.runner.handoverTime !== null;
		if (ahead) this.wakeAt(round.end, () => this.lingerOn(round));
		const taken = this.takeNext();
		if (!taken) {
			const decided = this.decide(round.item, null);
			this.endAfter(round, ahead, decided.next.role === 'end' ? decided.next.reason : 'complete');
			return;
		}
		const briefing = this.needsBriefing(taken);
		let item = this.leveled(taken);
		let plan = this.planOf(item, this.meterOf(item));
		let placement = placeNext(this.placementContext(item, plan, earliest, handover));
		// A round that does not chain applies the level its exercise reached: placed again at it.
		// An instruction comes first: the level applies when the series goes on after it. Decided
		// ahead, the round before has not settled yet: its level applies after the breath.
		if (!ahead && !briefing && placement.kind !== 'chain' && this.applyLevel(item)) {
			item = this.leveled(taken);
			plan = this.planOf(item, this.meterOf(item));
			placement = placeNext(this.placementContext(item, plan, earliest, handover));
		}
		const coming = {
			chains: placement.kind === 'chain',
			countIn: placement.kind === 'count-in'
		};
		// Decided ahead, or before an instruction that stops play, the policy is only asked: the
		// run and its remedies are taken when the series goes on (after the breath, or the stop).
		let decided = this.decide(item, coming, ahead || briefing);
		if (decided.next.role === 'end') {
			this.endAfter(round, ahead, decided.next.reason);
			return;
		}
		if (briefing) {
			if (ahead) this.wakeAt(round.end, () => this.brief(taken));
			else this.brief(taken);
			return;
		}
		if (ahead && (decided.breath || placement.kind !== 'chain')) {
			this.breatheAfter(round, round.end, taken);
			return;
		}
		// A round chained to it, decided ahead: taken now.
		if (ahead) decided = this.decide(item, coming);
		if (decided.breath && placement.kind !== 'count-in') {
			// A run played out: the next one starts after a counted bar, at the level reached.
			if (placement.kind === 'chain' && this.applyLevel(item)) {
				item = this.leveled(taken);
				plan = this.planOf(item, this.meterOf(item));
			}
			placement = placeNext(this.placementContext(item, plan, earliest, handover, true));
		}
		switch (placement.kind) {
			case 'chain': {
				const heard = this.placed?.role === 'listen';
				if (!ahead) {
					if (heard) this.openHeard(item, plan, round.end, time);
					else this.openRound(item, plan, round.end, time, time);
					return;
				}
				// Its bars scheduled now, before they begin; it opens at the handover.
				this.pending = item;
				const fromRunStart = this.fromRunStart(round.end);
				const chained =
					fromRunStart === null ? plan : this.planOf(item, this.seriesMeter, fromRunStart);
				this.layAhead(item, chained, round.end);
				this.wakeAt(round.end, (at) => {
					if (heard) this.openHeard(item, plan, round.end, at);
					else this.openRound(item, plan, round.end, time, time);
				});
				return;
			}
			case 'after-breath':
			case 'next-beat':
				this.placeFollowing(item, plan, placement.start);
				return;
			case 'count-in':
				this.placeAfter(item, placement);
		}
	}

	/**
	 * The run ends on bar `end`, with `round`, which listens on past its end (or with a heard
	 * cycle: no round): its breath is scheduled now, from its end, at least its exercise's
	 * `pacing.breathMinMs` in whole bars, sounding the run's accompaniment with no bar muted (the
	 * series' click without one), the last bar counted (heard as a count only where the run's
	 * level has a counted bar, else shown), shown with the run's marks; what
	 * follows is decided once `round` has settled, the level it reached applied then.
	 */
	private breatheAfter(round: OpenRound | null, end: Fraction, taken: PlannedItem): void {
		const from = ceilBar(end);
		const played = round?.item ?? taken;
		const { breathMinMs } = pacingAt(this.items.definitionOf(played), played.exerciseLevel);
		// It sounds as the run did, its muted bars heard: the pulse found again, not the silence
		// practised; its last bar counted only where the run's level counts one.
		const setup = this.runSetupOf(played);
		const { to } = this.transport.breath(from, breathMinMs ?? 0, {
			accompaniment: setup.listenIn ?? this.seriesClick,
			countIn: setup.countIn
		});
		this.breath = { from, to };
		this.accompaniedUntil = to;
		this.pending = this.leveled(taken);
		this.wakeAt(Fraction.of(from), (time) => {
			this.endRun(time, 'done');
			this.log?.open('breath', time);
		});
		const after = round?.given.settleAfter ?? Fraction.ZERO;
		this.wakeAt(end.add(after), (now) => {
			if (round) this.settleLingering(round, now);
			this.afterBreath(taken, to);
		});
	}

	/**
	 * After a breath that ends on bar `to`, its last bar counted: the next run, at the level its
	 * exercise reached; at another tempo or meter, opened again with its listen-in and its count.
	 */
	private afterBreath(taken: PlannedItem, to: number): void {
		// A new run, at the level now held.
		this.levels.restartRun(taken.exerciseId, taken.scope);
		// The level reached is told at once, in the breath.
		if (this.applyLevel(taken)) this.view.announcement = this.announcing;
		const item = this.leveled(taken);
		this.pending = item;
		const decided = this.decide(item, { chains: false, countIn: true });
		if (decided.next.role === 'end') {
			this.end(decided.next.reason);
			return;
		}
		const plan = this.planOf(item, this.meterOf(item));
		const placement = placeNext(this.placementContext(item, plan, Fraction.of(to), false, true));
		if (placement.kind === 'count-in' && (placement.tempo !== null || placement.meter !== null)) {
			// The frame keeps the tempo of the run played until the new one begins.
			this.placeAfter(item, placement, true);
			return;
		}
		// The breath's last bar is the count.
		this.place(item, to, { countBar: to - 1, restFrom: null, shownIn: 'breath' });
	}

	/**
	 * What `placeNext` decides `item`'s place from, the series as it stands; `countIn`: a counted
	 * bar asked before it whatever the item says (a breath).
	 */
	private placementContext(
		item: PlannedItem,
		plan: RoundPlan,
		earliest: Fraction,
		handover: boolean,
		countIn = false
	): PlacementContext {
		const coming = this.comingOf(item);
		return {
			earliest,
			handover,
			nowBar: this.nowBar(),
			current: { tempo: this.tempoBpm, meter: this.seriesMeter, scene: this.lastScene },
			coming: countIn ? { ...coming, countIn: true } : coming,
			plan,
			firstAudibleBar: this.audibleBar(Math.max(ceilBar(earliest), this.accompaniedUntil))
		};
	}

	/** What `item`'s round plays at, and what it asks of the count before it. */
	private comingOf(item: PlannedItem): PlacementContext['coming'] {
		return {
			tempo: this.tempoFor(item),
			meter: this.meterOf(item),
			scene: this.items.flowOf(item).scene,
			countIn: !!item.countIn,
			restBars: item.restBars ?? 0
		};
	}

	/** The bar at or after the audio clock now. */
	private nowBar(): Fraction {
		return barAtOrAfter(this.transport.map, this.transport.barLength, this.deps.clock.now());
	}

	/**
	 * `bar`, or the bar after it when it begins sooner than `START_DELAY_S` from now: a count
	 * placed after a round in free time is never heard already late.
	 */
	private audibleBar(bar: number): number {
		const time = this.transport.map.toSeconds(Fraction.of(bar).mul(this.transport.barLength));
		return time < this.deps.clock.now() + START_DELAY_S ? bar + 1 : bar;
	}

	/**
	 * `item` after a counted bar from `count.fromBar`, as `placeNext` decided: the tempo or the
	 * meter changed first when it asks, heard only before a scene that clicks.
	 */
	private placeAfter(
		item: PlannedItem,
		count: Extract<Placement, { kind: 'count-in' }>,
		afterBreath = false
	): void {
		const { fromBar: bar, tempo, meter, restBars } = count;
		const audible = this.clicksOn(item);
		const setup = this.runSetupOf(item);
		// At another tempo or meter, the run opens as at the start: its listen-in, its count.
		const opening = { listenInBars: setup.listenInBars, countIn: setup.countIn, audible };
		const opened = (playFrom: number) => {
			const counted = setup.countIn ? 1 : 0;
			const to = playFrom - counted;
			const from = to - setup.listenInBars;
			this.listenIn = { from, to };
			this.accompaniedUntil = playFrom;
			if (setup.listenInBars > 0) {
				this.wakeAt(Fraction.of(from), (time) => {
					this.endRunIfEnding(time);
					this.log?.open('listen-in', time);
					// A level reached is told from the listen-in on, until the run plays.
					this.view.announcement = this.announcing;
				});
			}
			// Without a counted bar, the last listen-in bar shows the count, silently.
			this.place(item, playFrom, {
				countBar: playFrom - 1,
				restFrom: null,
				...(!setup.countIn && { shownIn: 'listen-in' as const })
			});
		};
		// After a breath the frame shows the new tempo from the bar it begins on.
		const setTempo = (bpm: number) => {
			if (!afterBreath) {
				this.setTempo(bpm);
				return;
			}
			this.tempoBpm = bpm;
			this.wakeAt(Fraction.of(bar), () => (this.view.tempoBpm = bpm));
		};
		if (meter !== null && tempo !== null) {
			// Another meter: its counted bar on the first whole bar of it, at its tempo.
			const unit = this.seriesMeter.unit;
			this.setMeter(meter);
			setTempo(tempo);
			const { playFrom } = this.transport.changeMeter(
				bar,
				meter,
				this.segment(tempo),
				setup.listenIn ?? this.seriesClick,
				opening
			);
			// The targets before stay where they were: their beats counted in the new unit.
			const ratio = unit.div(meter.unit).toNumber();
			this.history = this.history.map((entry) => ({
				...entry,
				beatIndex: entry.beatIndex * ratio
			}));
			opened(playFrom);
			return;
		}
		if (tempo !== null) {
			setTempo(tempo);
			const { playFrom } = this.transport.changeTempo(
				bar,
				this.segment(tempo),
				setup.listenIn ?? this.seriesClick,
				opening
			);
			opened(playFrom);
			return;
		}
		const playFrom = this.transport.countIn(bar, { restBars, audible });
		this.accompaniedUntil = playFrom;
		this.place(item, playFrom, { countBar: playFrom - 1, restFrom: restBars > 0 ? bar : null });
	}

	/**
	 * What the policy decides at the boundary before `item`'s round (`coming`: how it would come;
	 * null, the source has nothing more), over the run of its (exercise, scope): a round (played
	 * along or not) or a heard cycle is what the next place opens (`placed`). `look`: only asked,
	 * nothing taken (the run, its remedies, a listen asked wait for the series to go on).
	 */
	private decide(
		item: PlannedItem,
		coming: Coming | null,
		look = false
	): ReturnType<ExerciseLevels['boundary']> {
		const elapsedMs = this.epochNow() - this.startedAt;
		const decided = this.levels.boundary(item, elapsedMs, this.durationMs, coming, { look });
		const { next } = decided;
		if (!look && (next.role === 'round' || next.role === 'listen')) this.placed = next;
		return decided;
	}

	/**
	 * The series ends for `reason` after `round`: at once, or, decided ahead, once the round has
	 * played to its end (its run done there) and settled; a pause meanwhile ends it at once.
	 */
	private endAfter(round: OpenRound, ahead: boolean, reason: SeriesEnd): void {
		if (!ahead) {
			this.end(reason);
			return;
		}
		this.ending = reason;
		this.wakeAt(round.end, (time) => this.endRun(time, 'done'));
		const after = round.given.settleAfter ?? Fraction.ZERO;
		this.wakeAt(round.end.add(after), () => this.end(reason));
	}

	/** The series ends on its own, for `reason`; « On change d’air » is said. */
	private end(reason: SeriesEnd): void {
		this.ended = reason;
		const item = this.round?.item ?? this.pending;
		if (reason === 'change-of-air' && item) {
			this.view.announcement = this.announcementOf('change-of-air', item);
		}
		void this.finish();
	}

	private takeNext(): PlannedItem | null {
		// What a pause gave back comes first.
		const back = this.givenBack.shift();
		if (back) return back;
		const now = this.epochNow();
		const item =
			this.source?.next({
				now,
				elapsedMs: now - this.startedAt,
				fatigued: this.view.fatigueDetected
			}) ?? null;
		if (item) this.spelling.set(item, this.deps.random());
		return item;
	}

	/**
	 * Stops before `item` to tell its exercise's instruction: nothing sounds nor wakes, the span
	 * before closed; `resume` goes on with a counted bar at the exercise's tempo.
	 */
	private brief(item: PlannedItem): void {
		const now = this.deps.clock.now();
		this.introduced.add(item.exerciseId);
		this.generation++;
		this.cutRun(now, 'done');
		this.stopSounds();
		this.closeLingering(now);
		this.closeSpan();
		this.round = null;
		this.previous = null;
		this.pending = item;
		this.forgetPlaces();
		this.withdrawContest();
		this.view.countdown = null;
		this.view.briefing = { text: this.briefingOf(item) ?? '' };
		this.showStage(item, null, NOT_PLACED);
		this.log?.end(now);
		this.log?.openStop('briefing', now);
		this.view.status = 'paused';
	}

	// ── runs: the trace and the takes ───────────────────────────────────────

	/**
	 * `item`'s round opens at `time`: the run ends first if a count was placed and has not begun
	 * yet, and a run opens with it when none is under way (its take with it).
	 */
	private openRun(item: PlannedItem, plan: RoundPlan, time: number): void {
		this.endRunIfEnding(time);
		const log = this.log;
		if (!log || log.running) return;
		this.runOutcomes = [];
		this.keptRun = this.run;
		// Its take is heard again with the latency of the sensor its rounds listen to.
		this.runLatencyS = this.latencyMsOf(sensorOf(plan)) / 1000;
		this.runSegment = log.openRun(time, {
			exerciseId: item.exerciseId,
			level: item.exerciseLevel
		});
		this.takes.open(time);
	}

	/** Where a placed count begins: the run under way ends, and the next one's input is kept. */
	private endRunIfEnding(time: number): void {
		const ending = this.runEnding;
		if (!ending) return;
		this.runEnding = null;
		this.endRun(time, 'done');
		this.takes.keepFrom(ending.keepFrom);
	}

	/** Ends the run under way at `time` in the trace, its take with it, its muted bars clicked again. */
	private endRun(time: number, ended: 'done' | 'interrupted'): void {
		if (this.runSegment === null) return;
		const run = this.keptRun;
		this.takes.close(time, this.runSegment, (from, to) => this.mutedClicks(run, from, to));
		this.log?.endRun(time, ended);
		this.runSegment = null;
	}

	/**
	 * The clicks `run`'s accompaniment did not sound over its muted bars between `from` and `to`
	 * (audio seconds), to be heard again over its take; none for a run with no muted bar.
	 */
	private mutedClicks(run: RunPlay | null, from: number, to: number): ScheduledSound[] {
		if (!run?.unmuted) return [];
		const { map, barLength } = this.transport;
		const { bars } = run.accompaniment;
		const muted: ScheduledSound[] = [];
		for (let bar = run.origin; map.toSeconds(Fraction.of(bar).mul(barLength)) < to; bar++) {
			if (bars[bar % bars.length] !== 'off') continue;
			const clicks = renderSounds(run.unmuted, map, bar, bar + 1);
			muted.push(...clicks.filter((sound) => sound.time >= from && sound.time < to));
		}
		return muted;
	}

	/** Play stops (a pause, an instruction, the end): the run under way ends, nothing more is kept. */
	private cutRun(time: number, ended: 'done' | 'interrupted'): void {
		this.runEnding = null;
		this.endRun(time, ended);
		this.takes.stopKeeping();
	}

	/** Hands the trace and the takes of the series to the session memory, read when called. */
	private remembering(): () => void {
		const log = this.log;
		if (!log) return () => undefined;
		const sessionId = this.sessionId;
		const takes = this.takes.byRun;
		const latencyS = this.runLatencyS;
		return () => this.deps.memory.remember({ sessionId, trace: log.tree(), takes, latencyS });
	}

	// ── rounds and their attempts ───────────────────────────────────────────

	private onRunnerEvent(round: OpenRound, event: RunnerEvent): void {
		if (this.round !== round || round.closed) return;
		if (event.kind === 'provisional') {
			this.view.status = 'verdict';
			this.offerContest(round, event.outcome);
			// Under a policy that corrects, the miss shows at once while a later answer may still
			// put it right; the settlement replaces it.
			if (round.plan.policy.correction) {
				const value = event.outcome.verdict.value as ResponseValue;
				this.showStage(round.item, { value, success: false }, round);
			}
			return;
		}
		this.settle(round, event.outcome);
		// A round without a handover places the next one once settled: after its end, or on the
		// beat after its answer in free time. Its span listens on until the next round opens.
		if (round.runner.handoverTime === null) {
			const now = this.deps.clock.now();
			round.closed = true;
			round.runner.cancel();
			this.log?.end(now);
			const earliest = inFreeTime(round.plan)
				? nextBeat(this.nowBar(), this.seriesMeter)
				: round.end;
			this.advance(round, now, earliest);
		}
	}

	/** Writes the round's attempt (the recorder tells the source), and shows the settled round. */
	private settle(round: OpenRound, outcome: RoundOutcome): void {
		if (round.settled) return;
		round.settled = true;
		const { item } = round;
		const presenter = this.items.presenterOf(item);
		const definition = this.items.definitionOf(item);
		const value = outcome.verdict.value as ResponseValue;
		const startAudioS = this.transport.map.toSeconds(round.at.mul(this.transport.barLength));
		const attempt = roundAttempt({
			definition,
			item,
			plan: round.plan,
			outcome,
			data: (answered) => presenter.attemptData?.(item.item, answered) ?? null,
			sessionId: this.sessionId,
			execution: round.execution,
			promptedAt: this.deps.clock.toEpochMs(round.promptTime),
			startAudioS,
			cardKey: this.items.cardKeyOf(item),
			fromRunStart: round.fromRunStart
		});
		const recorder = this.recorder;
		if (!recorder) return;
		// The recorder tells the source, before any write.
		const written = recorder.recordResponse(attempt, round.runner.span, item);
		round.attempt = attempt;
		const start = round.at.mul(this.transport.barLength);
		const wholeS =
			this.transport.map.toSeconds(start.add(Fraction.of(1))) - this.transport.map.toSeconds(start);
		void this.levels
			.settle({
				exerciseId: item.exerciseId,
				...(item.scope !== undefined && { scope: item.scope }),
				item: this.items.cardKeyOf(item),
				level: item.exerciseLevel,
				success: outcome.success,
				aided: aidedBeyondLevel(definition, item, outcome.aids),
				// What the anti-blocking reads of it: a cycle's report, and its spot.
				...blockReadingOf(definition, outcome, wholeS)
			})
			// A failed write is reported by the levels (`settled` waits for it); anything else here,
			// reported too: the series goes on.
			.catch((error) => console.error('[neckspert] level settle failed', error));
		const { segment } = round;
		const log = this.log;
		if (segment !== null && log) {
			written.then(
				(attemptId) => log.set(segment, { attemptId }),
				() => undefined
			);
		}
		if (detectFatigue(recorder.sessionAttempts)) this.view.fatigueDetected = true;
		this.runOutcomes = [...this.runOutcomes, outcome];
		// A round in free time has no place on the beat: no tile on the lane; nor has a round
		// with no one answer.
		const verdict = responseVerdictOf(outcome);
		if (!inFreeTime(round.plan) && verdict !== null) {
			this.history = [...this.history, { beatIndex: round.anchorBeat, verdict }];
		}
		this.offerContest(round, outcome);
		if (this.contestRound === round && this.contestWanted) {
			this.contestWanted = false;
			void recorder.contest(attempt as Attempt);
		}
		if (this.round === round && !round.closed) this.view.status = 'verdict';
		if (this.round === round) {
			this.showStage(item, { value, success: outcome.success }, round);
		} else if (followsBeats(definition)) {
			// The run's marks are on show while the next round plays.
			this.showNow();
		}
	}

	/**
	 * Closes the round under way at `now` (pause, quit): settled if it heard enough, else dropped;
	 * one judged whole (it listens past its handover) is dropped before its end, and returned.
	 */
	private closeRound(now: number): OpenRound | null {
		const round = this.round;
		if (!round || round.closed) return null;
		round.closed = true;
		const end = this.transport.map.toSeconds(round.end.mul(this.transport.barLength));
		if (round.given.settleAfter !== null && now < end) {
			// A round that listens past its handover is judged whole: cut short, it is dropped.
			round.runner.cancel();
			return round;
		}
		const outcome = round.runner.close(now);
		if (outcome) this.settle(round, outcome);
		return null;
	}

	/**
	 * Ends the span of the last round: its expectations withdrawn first, so a window a sensor
	 * cuts short reports into it; then its attempt takes the final list (`recordResponse`).
	 */
	private closeSpan(): void {
		const round = this.round;
		// One listening on past its handover closes its span once settled (`settleLingering`).
		if (!round || round.runner.span.isClosed || this.lingering.includes(round)) return;
		round.runner.withdraw();
		round.runner.span.close();
	}

	/** A miss of a contestable mechanic may be contested until the next round, in development only. */
	private offerContest(round: OpenRound, outcome: RoundOutcome): void {
		if (!this.deps.development) return;
		const miss = outcome.correct === false;
		if (!this.items.flowOf(round.item).contestable || !miss) {
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

	/**
	 * The screen model of `item` in the view its exercise names, placed on its prompt, target and
	 * bands: the model every exercise that writes its presentation shares (`promptStage`), else
	 * its presenter's own; `round`, the round placed, null-placed before it opens.
	 */
	private showStage(
		item: PlannedItem,
		settled: { value: ResponseValue; success: boolean } | null,
		round: Omit<StagePlace, 'history'> & { plan?: RoundPlan }
	): void {
		const spelled = this.spelling.get(item) ?? 0;
		const random = () => spelled;
		const definition = this.items.definitionOf(item);
		const place: StagePlace = {
			anchorBeat: round.anchorBeat,
			promptBeat: round.promptBeat,
			history: [...this.history],
			bands: round.bands
		};
		// Before the transport begins (the start screen), in the meter the item will play in.
		const meter = this.meter ?? this.meterOf(item);
		const moment = this.momentNow();
		const model = stageModel({
			definition,
			item,
			presenter: this.items.presenterOf(item),
			plan:
				round.plan ??
				(this.round?.item === item ? this.round.plan : null) ??
				this.planOf(item, meter, moment.fromRunStart),
			settled,
			place,
			beatsPerBar: meter.count,
			chordDiagram: chordDiagramFor(definition, this.settings),
			locale: this.deps.locale(),
			random,
			moment,
			runOutcomes: this.runOutcomes,
			endedSessions: this.endedSessions.get(item.exerciseId) ?? 0,
			played: this.round?.item ?? null
		});
		this.view.stage = model === undefined ? null : { view: playViewOf(definition), model };
	}

	/**
	 * The stage of what plays now, for a screen that follows the beat: the round under way, else
	 * the item waiting for its round; the status with it (counting before a run, playing in it).
	 */
	private showNow(): void {
		const moment = this.momentNow();
		const round = moment.phase === 'round' ? this.round : null;
		const heard = moment.phase === 'listening' ? this.heard : null;
		const item = round?.item ?? heard?.item ?? this.pending ?? this.round?.item;
		if (!item) return;
		const plan = round?.plan ?? heard?.plan;
		this.showStage(item, null, { ...NOT_PLACED, ...(plan && { plan }) });
		const { status } = this.view;
		if (status === 'count-in' || status === 'awaiting' || status === 'verdict') {
			// Counting before a run; playing, hearing or breathing in it.
			const counting = moment.phase === 'listen-in' || moment.phase === 'count-in';
			this.view.status = counting || moment.phase === 'waiting' ? 'count-in' : 'awaiting';
		}
	}

	/** On every beat from `bar`, `beat`: the stage shown again (`followsBeats`), until play stops. */
	private tick(bar: number, beat: number): void {
		const beats = beatPositions(this.seriesMeter);
		const position = Fraction.of(bar).add(beats[beat].div(this.transport.barLength));
		this.wakeAt(position, () => {
			this.showNow();
			if (beat + 1 < beats.length) this.tick(bar, beat + 1);
			else this.tick(bar + 1, 0);
		});
	}

	/** The breath shows now, its run played: the moment to hear it again. */
	private inBreath(): boolean {
		return this.view.status === 'awaiting' && this.momentNow().phase === 'breath';
	}

	/** Where the series stands on the beat now (`SeriesMoment`): waiting before the transport begins. */
	private momentNow(): SeriesMoment {
		const waiting: SeriesMoment = {
			phase: 'waiting',
			barInRound: 0,
			beat: 0,
			fromRunStart: null,
			muted: false
		};
		if (!this.begun || !this.meter) return waiting;
		const length = this.transport.barLength;
		// A wake-up comes at its beat or just after: a hair of time later is still that beat.
		const position = this.transport.map.toPosition(this.deps.clock.now()).div(length).toNumber();
		const bar = Math.floor(position + 1e-9);
		const beats = beatPositions(this.meter).map((at) => at.div(length).toNumber());
		const beat = Math.max(
			0,
			beats.findLastIndex((at) => at <= position - bar + 1e-9)
		);
		const round = this.round;
		if (
			round &&
			!inFreeTime(round.plan) &&
			Fraction.of(bar).compare(round.at) >= 0 &&
			Fraction.of(bar).compare(round.end) < 0
		) {
			const barInRound = Math.floor(Fraction.of(bar).sub(round.at).toNumber());
			const muted = round.plan.mutedBars.includes(barInRound);
			return { phase: 'round', barInRound, beat, fromRunStart: round.fromRunStart, muted };
		}
		const heard = this.heard;
		if (
			heard &&
			Fraction.of(bar).compare(heard.at) >= 0 &&
			Fraction.of(bar).compare(heard.end) < 0
		) {
			const barInRound = Math.floor(Fraction.of(bar).sub(heard.at).toNumber());
			const muted = heard.plan.mutedBars.includes(barInRound);
			return { phase: 'listening', barInRound, beat, fromRunStart: heard.fromRunStart, muted };
		}
		const demo = this.demo;
		if (demo && bar >= demo.from && bar < demo.to) {
			return { ...waiting, phase: 'listening', barInRound: bar - demo.from, beat, fromRunStart: 0 };
		}
		if (this.listenIn && bar >= this.listenIn.from && bar < this.listenIn.to) {
			return { ...waiting, phase: 'listen-in', beat };
		}
		// The breath's last bar is its count: still the breath.
		if (this.breath && bar >= this.breath.from && bar < this.breath.to) {
			return { ...waiting, phase: 'breath', beat };
		}
		if (bar === this.countBar) return { ...waiting, phase: 'count-in', beat };
		const start = this.placedStart;
		if (start && this.run && bar >= this.run.origin && Fraction.of(bar).compare(start) < 0) {
			return {
				phase: 'entry',
				barInRound: Math.floor(Fraction.of(bar).sub(start).toNumber()),
				beat,
				fromRunStart: this.fromRunStart(start),
				muted: false
			};
		}
		return { ...waiting, beat };
	}

	private enterScene(item: PlannedItem): void {
		this.lastScene = this.items.flowOf(item).scene;
	}

	/** The beat of the round's first expectation (its target) on the map. */
	private anchorBeatOf(at: Fraction, plan: RoundPlan): number {
		const target = plan.expectations[0]?.at ?? Fraction.ZERO;
		return at.mul(this.transport.barLength).add(target).div(this.seriesMeter.unit).toNumber();
	}

	/** The round's extended expectations on the map, from their start to their end, in beats. */
	private bandsOf(at: Fraction, plan: RoundPlan): StagePlace['bands'] {
		const origin = at.mul(this.transport.barLength);
		const beat = (position: Fraction) => origin.add(position).div(this.seriesMeter.unit).toNumber();
		return plan.expectations.flatMap(({ at: from, span }) =>
			from === null || span === 'point'
				? []
				: [{ fromBeat: beat(from), untilBeat: beat(span.until) }]
		);
	}

	/** The beat of the round's prompt on the map. */
	private promptBeatOf(at: Fraction, plan: RoundPlan): number {
		return this.promptOf(at, plan)
			.mul(this.transport.barLength)
			.div(this.seriesMeter.unit)
			.toNumber();
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

	/**
	 * Accompanies every bar up to the one `end` falls in: the run's accompaniment, else the
	 * series' click; silent over `silences` (audio seconds).
	 */
	private accompanyTo(end: Fraction, silences: { fromS: number; toS: number }[] = []): void {
		const to = ceilBar(end);
		if (to <= this.accompaniedUntil) return;
		const accompaniment = this.run?.accompaniment ?? this.seriesClick;
		this.transport.accompany(this.accompaniedUntil, to, accompaniment, silences);
		this.accompaniedUntil = to;
	}

	/** Accompanies a round starting on bar `at` to its end, silent over its muted bars. */
	private accompanyRound(at: Fraction, plan: RoundPlan): void {
		const time = (bar: Fraction) => this.transport.map.toSeconds(bar.mul(this.transport.barLength));
		const silences = plan.mutedBars.map((index) => ({
			fromS: time(at.add(Fraction.of(index))),
			toS: time(at.add(Fraction.of(index + 1)))
		}));
		this.accompanyTo(at.add(plan.length.div(this.transport.barLength)), silences);
	}

	private stopSounds(): void {
		this.wakes.forEach((cancel) => cancel());
		this.wakes = [];
		this.transport.stop();
	}

	private segment(bpm: number): TempoSegment {
		return { at: Fraction.ZERO, bpm, unit: this.seriesMeter.unit };
	}

	/** The meter of `item`'s exercise. */
	private meterOf(item: PlannedItem): Meter {
		return this.items.definitionOf(item).meter ?? METER_4_4;
	}

	/** The series plays in `meter` from now on: its click with it. */
	private setMeter(meter: Meter): void {
		this.meter = meter;
		const beats = beatPositions(meter).map((_, i) => i + 1);
		this.click = clickAccompaniment({ meter, beats, accent: [1], bars: ['on'] });
	}

	private get seriesMeter(): Meter {
		if (!this.meter) throw new Error('the series has no meter before its transport begins');
		return this.meter;
	}

	private get seriesClick(): Accompaniment {
		if (!this.click) throw new Error('the series has no meter before its transport begins');
		return this.click;
	}

	/** Whether the click is heard on `item`'s scene. */
	private clicksOn(item: PlannedItem): boolean {
		return SCENE_CLICKS[this.items.flowOf(item).scene];
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
		// Ended on its own, the run is done; a quit has cut it already.
		this.cutRun(now, 'done');
		this.stopSounds();
		this.closeRound(now);
		this.closeLingering(now);
		this.closeSpan();
		this.sensors.close();
		this.withdrawContest();
		this.view.countdown = null;
		this.view.briefing = null;
		this.view.stage = null;
		this.view.status = 'finished';
		const reason = this.quitting ? 'quit' : (this.ended ?? 'time');
		this.log?.close(now, reason, reason === 'change-of-air' ? this.levels.breaking() : null);
		const remember = this.remembering();
		remember();
		this.deps.detector.stop();
		// Taken now: a new series started meanwhile has its own.
		const record = this.sessionRecord(null);
		const opened = this.opened;
		const recorder = this.recorder;
		const { repositories } = this.deps;
		// The levels reached are kept, played or not: the next series starts there.
		await this.levels.settled();
		// The ended session implies its attempts are written with their complete observations.
		await recorder?.settled();
		// Again, with the ids of the attempts written meanwhile.
		remember();
		// A series whose input never opened has no session.
		if (!opened) return;
		await repositories.sessions.put({ ...record, endedAt: this.epochNow() });
	}

	private sessionRecord(endedAt: number | null): SessionRecord {
		const one = this.kind === 'exercise' ? this.sessionItem : null;
		return {
			id: this.sessionId,
			kind: this.kind,
			// A session of one exercise names it, and keeps the level it ended on: its own.
			...(one && {
				exerciseId: one.exerciseId,
				levelReached: this.levels.reached(one.exerciseId, one.scope)
			}),
			startedAt: this.startedAt,
			endedAt,
			fatigueDetected: this.view.fatigueDetected,
			executions: [...this.executions],
			latencyMs: this.latencyMs()
		};
	}

	/**
	 * The latency the session applied to its onsets: that of the first sensor met in the series
	 * with one calibrated (`sensorLatency`, the fallback's when it has none), 0 when none is.
	 */
	private latencyMs(): number {
		return this.sessionLatencyMs ?? 0;
	}

	/** `plan`'s sensor is met: its latency becomes the session's if none was met before. */
	private meetSensor(plan: RoundPlan): void {
		if (this.sessionLatencyMs !== null) return;
		const sensor = sensorOf(plan);
		const latency = sensor === null ? null : sensorLatency(this.settings.latency, sensor);
		if (latency) this.sessionLatencyMs = latency.ms;
	}

	/** The calibrated latency of `sensor` in ms, 0 when uncalibrated or for no sensor. */
	private latencyMsOf(sensor: string | null): number {
		return sensor === null ? 0 : (sensorLatency(this.settings.latency, sensor)?.ms ?? 0);
	}

	// ── data of the items ────────────────────────────────────────────────────

	/**
	 * The tempo an item plays at: its exercise's at the level played; a round in free time keeps
	 * the series' own, which runs on under it.
	 */
	private tempoFor(item: PlannedItem): number {
		const definition = this.items.definitionOf(item);
		if (this.tempoBpm !== null && inFreeTime(this.planOf(item, this.meterOf(item)))) {
			return this.tempoBpm;
		}
		return tempoOf(definition, this.levels.played(item.exerciseId, item.scope));
	}

	/** `item` at the level its exercise plays now; the value spelling it carried over. */
	private leveled(item: PlannedItem): PlannedItem {
		const exerciseLevel = this.levels.played(item.exerciseId, item.scope);
		if (item.exerciseLevel === exerciseLevel) return item;
		// A source whose items depend on the level serves it again at that level.
		const leveled = this.source?.atLevel?.(item, exerciseLevel) ?? { ...item, exerciseLevel };
		const spelled = this.spelling.get(item);
		if (spelled !== undefined) this.spelling.set(leveled, spelled);
		return leveled;
	}

	/**
	 * At a round that does not chain: the level `item`'s exercise reached becomes the one played,
	 * announced with its tempo until the round opens. True when it changed.
	 */
	private applyLevel(item: PlannedItem): boolean {
		const kind = this.levels.apply(item.exerciseId, item.scope);
		if (kind === null) return false;
		this.announcing = this.announcementOf(kind, item);
		return true;
	}

	/** `kind` announced for `item`'s exercise, at the level it plays and that level's tempo. */
	private announcementOf(
		kind: Announcement,
		item: PlannedItem
	): NonNullable<PlayView['announcement']> {
		const definition = this.items.definitionOf(item);
		const level = this.levels.played(item.exerciseId, item.scope);
		return {
			kind,
			level,
			of: levelRange(exerciseLevelsOf(definition)).highest + 1,
			tempoBpm: tempoOf(definition, level)
		};
	}

	/**
	 * The execution `item`'s round belongs to: its exercise and scope at the tempo it plays (null
	 * in free time). The first of each (exercise, scope) is the one the session keeps.
	 */
	private executionOf(item: PlannedItem, plan: RoundPlan): Execution {
		const scope = item.scope;
		const execution: Execution = {
			exerciseId: item.exerciseId,
			...(scope !== undefined && { scope }),
			tempoBpm: inFreeTime(plan) ? null : this.tempoBpm
		};
		const met = this.executions.some(
			(e) => e.exerciseId === execution.exerciseId && (e.scope ?? null) === (scope ?? null)
		);
		if (!met) this.executions.push(execution);
		return execution;
	}

	/** The first item of an exercise with an instruction to tell, in this series. */
	private needsBriefing(item: PlannedItem): boolean {
		return !this.introduced.has(item.exerciseId) && this.briefingOf(item) !== null;
	}

	/**
	 * The instruction of `item`'s exercise, as its flow tells it (`briefing`): in each series, or
	 * only while the player has no attempt of it; null when there is none to tell.
	 */
	private briefingOf(item: PlannedItem): string | null {
		const met = this.met.has(item.exerciseId);
		if (met && this.items.flowOf(item).briefing === 'first-encounter') return null;
		return this.items.howToOf(item, this.deps.locale());
	}

	/** The wall time, readable before the audio clock exists (the start screen, before any gesture). */
	private epochNow(): number {
		return this.deps.clock.epochNow();
	}
}
