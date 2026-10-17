import { exerciseById, type ExerciseDefinition, type ExerciseId } from '$lib/domain/exercise';
import { rhythmFigureRules, type RhythmItem } from '$lib/domain/mechanics';
import {
	Fraction,
	PlanRound,
	RHYTHM_SENSOR,
	barLength,
	beatPositions,
	compileCyclePlan,
	levelRange,
	nextLevelState,
	renderSounds,
	type CycleReport,
	type CycleVerdict,
	type Figure,
	type LevelParams,
	type LevelState,
	type Meter,
	type ScheduledSound
} from '$lib/domain/time';
import { DEFAULT_SETTINGS, type PlannedItem, type Settings } from '$lib/domain/types';
import { openAudioInput } from '../audioInput';
import { DEFAULT_PLAY_VIEW, type PlaySessionController, type PlayView } from '../contract';
import { ObservationSpan } from '../observationSpan';
import type { Observation } from '../sensors';
import type { PlanSessionDeps } from '../SessionDeps';
import { LISTEN_IN_BARS, Transport, TransportStopped } from '../transport';
import { cycleAids, levelAided, recordCycle, type CycleSetup } from './recordCycle';
import {
	accompanimentFrom,
	figureFor,
	landingBar,
	levelParamsOf,
	rhythmLevels,
	unmuted
} from './rhythmExercise';
import {
	figurePosition,
	levelView,
	tempoView,
	type RhythmPhase,
	type RhythmStageModel,
	type SettledCycle
} from './rhythmStage';

/** How long a series of a rhythm exercise lasts; it ends with the run under way. */
export const RHYTHM_SERIES_MS = 300_000;
/**
 * A cycle is settled this far (in bars) after its last bar ends, so an attack reported a little
 * late (detection, the scheduler's wake-up) still reaches it.
 */
export const SETTLE_AFTER_BARS = Fraction.of(1, 4);
/** The sensor whose latency the attack sensor takes while it has none of its own. */
export const ATTACK_LATENCY_FALLBACK = 'note';

/** A run of cycles between two breaths, at one level. */
interface Run {
	/** Level index (0 = level 1, aid levels negative), fixed for the run. */
	level: number;
	params: LevelParams;
	/** Transport bar where the run's first bar (entry or cycle) falls: bar 0 of its figure and accompaniment. */
	playFrom: number;
	/** Clicked bars played before the first cycle, which starts on the first muted bar. */
	landing: number;
	entryLaid: boolean;
	/** Cycles played (not heard) laid out so far. */
	played: number;
	settled: SettledCycle[];
	/** The figure of the last cycle laid out: the one the breath shows as played. */
	lastFigure: Figure;
}

/** The input of the last run kept by the take buffer, and the sounds to put back over it. */
interface Take {
	run: Run;
	/** Audio time of the run's first bar. */
	from: number;
	/** Audio time the run ended (its breath, or a pause); null while it goes on. */
	to: number | null;
	/** What the run made sound, and the click of its muted bars, in time order. */
	sounds: ScheduledSound[];
}

/** A cycle on the transport: played (judged by its round) or heard (no round, no attempt). */
interface Cycle {
	kind: 'play' | 'listening';
	run: Run;
	setup: CycleSetup;
	fromBar: number;
	toBar: number;
	round: PlanRound | null;
	span: ObservationSpan | null;
	spanOpen: boolean;
	settled: boolean;
	/** The id of its attempt once written. */
	written: Promise<number> | null;
}

/** What one transport bar is, as laid out (one bar ahead) for its sounds and its screen. */
interface Bar {
	phase: RhythmPhase;
	run: Run;
	cycle: Cycle | null;
	figure: Figure;
	/** Bar of the figure loop it plays (taken modulo the figure's bars). */
	figureBar: number;
	barInCycle: number;
	muted: boolean;
	/** The controller schedules its sounds (entry, cycles); the transport did otherwise. */
	own: boolean;
	scheduled: boolean;
}

/**
 * Plays an exercise of figures cycle after cycle (spec 2026-10-14, sections 6 and 7): the
 * listen-in and a counted bar, then runs of `cyclesPerBreath` cycles chained without a gap
 * (the entry first when the click stops on some bars: a cycle lands on the first muted bar),
 * a breath between runs, the level moved by each settled cycle and taken at the next run (its
 * tempo changed at the breath, with a listen-in and a counted bar), a cycle heard rather than
 * played on demand (`listen`). Each played cycle is a `PlanRound` judged when it ends and
 * stored as an attempt with the observations of its span. Sounds go through the transport only.
 *
 * Bars are laid out one ahead, on the wake-up of each beat: the next bar's sounds are scheduled
 * and a cycle's round exists before its capture window opens. An observation goes to the live
 * round whose window holds it; the rest is filed in the span of the cycle under way.
 */
export class PlanSessionController implements PlaySessionController {
	sessionId: string;
	readonly view: PlayView;
	readonly timeline = {
		nowBeat: (): number => {
			if (!this.begun) return 0;
			const position = this.transport.map.toPosition(this.deps.clock.now());
			return position.div(this.meter.unit).toNumber();
		}
	};

	private readonly deps: PlanSessionDeps;
	private readonly exercise: ExerciseDefinition;
	private readonly transport: Transport;
	private readonly meter: Meter;
	private readonly sensor: string;
	private readonly levelKey: { exerciseId: string; scope: string; item: string };

	private settings: Settings = DEFAULT_SETTINGS;
	private levelState: LevelState;
	private prepared = false;
	/** No attempt of the exercise yet: its how-to and a demonstration come first. */
	private firstEncounter = false;
	private startedAt = 0;
	private begun = false;
	/** Bumped by every start, pause and quit: an await that comes back in another run gives up. */
	private generation = 0;
	private starting = false;

	private bars = new Map<number, Bar>();
	/** The run being laid out; null between a breath and the next run. */
	private run: Run | null = null;
	/** Played cycles not settled yet, oldest first. */
	private live: Cycle[] = [];
	/** The played cycle under way: its span takes what no round's window holds. */
	private current: Cycle | null = null;
	/** Cycles played in the series (laid out, not dropped by a pause): the next figure in turn. */
	private playedInSeries = 0;
	/** `listen()` was asked: the next cycle laid out is heard. */
	private listenNext = false;
	/** The figure was just heard: the next played cycle carries it (`cycleAids`). */
	private listened = false;
	/** The series is over: no bar is laid out any more, the last cycles settle and it finishes. */
	private ending = false;
	private shown: { bar: number; beat: number } | null = null;
	private stopObservations: (() => void) | null = null;
	/** The last run, to be heard again from its breath or a pause (`replay`). */
	private take: Take | null = null;
	private readonly writes = new Set<Promise<unknown>>();
	private levelWrite: Promise<void> = Promise.resolve();

	constructor(session: { id: string; exerciseId: ExerciseId }, deps: PlanSessionDeps) {
		this.deps = deps;
		this.sessionId = session.id;
		this.exercise = (deps.exercise ?? exerciseById)(session.exerciseId);
		const { base } = rhythmLevels(this.exercise);
		this.meter = base.accompaniment.figure.meter;
		const sensor = this.exercise.params.sensor;
		this.sensor = typeof sensor === 'string' ? sensor : RHYTHM_SENSOR;
		this.transport = new Transport({ clock: deps.clock, sounds: deps.sounds });
		this.levelKey = { exerciseId: this.exercise.id, scope: '', item: '' };
		this.levelState = { ...this.levelKey, level: 0, successes: 0, failures: 0, resumeAfter: null };
		const first = this.paramsOf(0);
		this.view = $state<PlayView>({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: first.tempo.bpm,
			beatsPerBar: 4,
			promptBeatIndex: null,
			targetBeatIndex: null,
			followUp: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene: 'guitar',
			countdown: null,
			preview: null,
			chordDiagram: DEFAULT_SETTINGS.chordDiagram,
			contest: null,
			audioError: null,
			stage: null,
			briefing: null
		});
	}

	async ready(): Promise<void> {
		if (this.view.status !== 'idle' || this.starting) return;
		await this.prepare();
	}

	async start(): Promise<void> {
		if (this.starting) return;
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.starting = true;
		const generation = ++this.generation;
		try {
			if (this.view.status === 'finished') this.beginNewSeries();
			await this.prepare();
			if (this.generation !== generation) return;
			this.view.briefing = null;
			this.view.audioError = null;
			const { deps } = this;
			await deps.clock.resume();
			if (this.generation !== generation) return;
			deps.detector.setBuiltInGain(this.settings.builtInInputGain);
			try {
				await openAudioInput(deps.detector, deps.settings, this.settings.inputDeviceId);
			} catch {
				if (this.generation !== generation) return;
				this.view.audioError = 'input';
				return;
			}
			if (this.generation !== generation) return;
			// The permission prompt can suspend the context: resume again before any sound.
			await deps.clock.resume();
			if (this.generation !== generation) return;
			this.startedAt = deps.now();
			// A new series: the takes of the one before are not this one's.
			deps.takes.clear();
			// Tracked: a quit meanwhile writes the ended record only after this one.
			const opened = deps.sessions.put(this.sessionRecord(null));
			this.track(opened);
			await opened;
			if (this.generation !== generation) return;
			this.openObservations();
			await this.beginRun(generation, this.firstEncounter);
		} finally {
			if (this.generation === generation) this.starting = false;
		}
	}

	pause(): void {
		if (this.view.status !== 'count-in' && this.view.status !== 'awaiting') return;
		this.generation++;
		this.starting = false;
		this.stopPlaying();
		this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		void this.resumeRun();
	}

	/**
	 * « Réécouter », from the breath or the pause: the last run as the input heard it, with the
	 * click put back, over the muted bars too; then on as after a pause. Does nothing elsewhere,
	 * or before a run was played.
	 */
	async replay(): Promise<void> {
		const take = this.take;
		const to = take?.to ?? null;
		// A run cut before its first bar sounded has nothing to replay.
		if (!take || to === null || to <= take.from) return;
		if (this.view.status !== 'paused') {
			if (!this.inBreath()) return;
			this.pause();
		}
		const { from, sounds } = take;
		const generation = ++this.generation;
		const latencyS = (this.latency()?.ms ?? 0) / 1000;
		try {
			await this.deps.takes.play(from, to, sounds, latencyS);
		} catch (error) {
			// Not heard again, but play goes on as after a pause.
			console.warn('The last run could not be played again', error);
		}
		if (this.generation !== generation || this.view.status !== 'paused') return;
		await this.resumeRun();
	}

	listen(): void {
		if (this.view.status !== 'count-in' && this.view.status !== 'awaiting') return;
		this.listenNext = true;
	}

	/** Nothing to answer on screen: every attack is heard by the sensor. */
	answer(): void {}

	/** Contesting a cycle is a development tool of a later plan. */
	contest(): void {}

	quit(): void {
		if (this.view.status === 'finished') return;
		this.generation++;
		this.starting = false;
		this.deps.takes.stop();
		this.stopPlaying();
		void this.finish();
	}

	// Series -------------------------------------------------------------------------------

	/** Reads the settings, the level and whether the exercise was met, once per series. */
	private async prepare(): Promise<void> {
		if (this.prepared) return;
		const { deps } = this;
		const [settings, stored, attempts] = await Promise.all([
			deps.settings.get(),
			deps.levels.get(this.levelKey),
			deps.attempts.all()
		]);
		this.settings = settings;
		if (stored) {
			const { lowest, highest } = levelRange(rhythmLevels(this.exercise).levels);
			this.levelState = { ...stored, level: Math.min(highest, Math.max(lowest, stored.level)) };
		}
		this.firstEncounter = !attempts.some((attempt) => attempt.exerciseId === this.exercise.id);
		this.prepared = true;
		const howTo = this.exercise.howTo?.[settings.locale];
		this.view.briefing = this.firstEncounter && howTo ? { text: howTo } : null;
		this.view.audioError = settings.clickBleed ? 'bleed' : null;
		this.view.tempoBpm = this.paramsOf(this.levelState.level).tempo.bpm;
		this.view.stage = { view: this.viewName(), model: this.waitingModel() };
	}

	private beginNewSeries(): void {
		this.sessionId = this.deps.newId();
		// Not opened yet: a quit before the input opens writes no session.
		this.startedAt = 0;
		this.view.status = 'idle';
		this.prepared = false;
		this.playedInSeries = 0;
		this.listened = false;
		this.take = null;
		this.view.stage = null;
		this.view.countdown = null;
	}

	/**
	 * Listen-in (with the figure played as a demonstration over extra bars when asked), a counted
	 * bar, then the run: from the start of the series, and again after a pause.
	 */
	private async beginRun(generation: number, demo: boolean): Promise<void> {
		const run = this.newRun(-1);
		const first = figureFor(this.exercise, run.params, this.playedInSeries);
		const demoBars = demo ? first.figure.bars : 0;
		const listenIn = run.params.listenInBars ?? LISTEN_IN_BARS;
		const countIn = run.params.countIn ?? true;
		this.view.status = 'count-in';
		this.view.tempoBpm = run.params.tempo.bpm;
		let playFrom: number;
		try {
			({ playFrom } = await this.transport.begin({
				meter: this.meter,
				tempo: run.params.tempo,
				accompaniment: unmuted(run.params.accompaniment),
				listenInBars: listenIn + demoBars,
				countIn
			}));
		} catch (error) {
			// Paused or quit while the output warmed up: nothing was scheduled.
			if (error instanceof TransportStopped) return;
			throw error;
		}
		if (this.generation !== generation) return;
		this.begun = true;
		if (demo) {
			this.transport.playFigure(first.figure, 'demo', listenIn);
			this.firstEncounter = false;
			this.listened = true;
		}
		run.playFrom = playFrom;
		run.lastFigure = first.figure;
		this.run = run;
		this.keepInputOf(run);
		for (let bar = 0; bar < playFrom; bar++) {
			const heard = bar >= listenIn && bar < listenIn + demoBars;
			this.bars.set(bar, {
				...this.idleBar(run, first.figure, bar < listenIn ? 'listen-in' : 'count-in'),
				...(heard && { phase: 'listening', figureBar: bar - listenIn })
			});
		}
		this.prepareBar(0);
		this.show(0, 0);
	}

	/** On again after a pause or a replay: the listen-in and a counted bar. */
	private resumeRun(): Promise<void> {
		const generation = ++this.generation;
		this.deps.takes.stop();
		return this.beginRun(generation, false);
	}

	private newRun(playFrom: number): Run {
		const level = this.levelState.level;
		const params = this.paramsOf(level);
		return {
			level,
			params,
			playFrom,
			landing: landingBar(params.accompaniment),
			entryLaid: false,
			played: 0,
			settled: [],
			lastFigure: figureFor(this.exercise, params, this.playedInSeries).figure
		};
	}

	/** A bar the transport fills (listen-in, count, breath), shown with the run's figure. */
	private idleBar(run: Run, figure: Figure, phase: RhythmPhase): Bar {
		return {
			phase,
			run,
			cycle: null,
			figure,
			figureBar: 0,
			barInCycle: 0,
			muted: false,
			own: false,
			scheduled: true
		};
	}

	// Bars ---------------------------------------------------------------------------------

	/** Wakes on each beat of `bar`, lays it out if it is not yet, and schedules its sounds. */
	private prepareBar(bar: number): void {
		if (this.ending) return;
		const laid = this.bars.get(bar) ?? this.layout(bar);
		if (!laid) return;
		const beats = beatPositions(this.meter);
		const length = barLength(this.meter);
		beats.forEach((position, beat) => {
			this.transport.at(Fraction.of(bar).add(position.div(length)), () => this.onBeat(bar, beat));
		});
		if (laid.own && !laid.scheduled) this.schedule(bar, laid);
	}

	private onBeat(bar: number, beat: number): void {
		if (this.view.status !== 'count-in' && this.view.status !== 'awaiting') return;
		if (beat === 0) {
			// Before the next bar is laid out: a run of one bar has its breath laid out there.
			this.openTake(bar);
			this.prepareBar(bar + 1);
			this.enterBar(bar);
		}
		this.show(bar, beat);
	}

	private enterBar(bar: number): void {
		const laid = this.bars.get(bar);
		const cycle = laid?.cycle;
		if (cycle && cycle.kind === 'play' && cycle.fromBar === bar) {
			const previous = this.current;
			this.current = cycle;
			if (previous?.settled) this.closeSpan(previous);
		}
		for (const old of this.bars.keys()) if (old < bar - 1) this.bars.delete(old);
	}

	/** The accompaniment of `bar`, and the figure heard from its first bar in a heard cycle. */
	private schedule(bar: number, laid: Bar): void {
		laid.scheduled = true;
		const { run, cycle } = laid;
		this.transport.accompany(
			bar,
			bar + 1,
			accompanimentFrom(run.params.accompaniment, run.playFrom)
		);
		const figure = laid.figure;
		if (
			laid.phase === 'listening' &&
			cycle &&
			laid.figureBar % figure.bars === 0 &&
			bar + figure.bars <= cycle.toBar
		) {
			this.transport.playFigure(figure, 'demo', bar);
		}
	}

	/** Lays out the block that starts at `bar`; returns that bar, or null when the series ends. */
	private layout(bar: number): Bar | null {
		if (!this.run && !this.startRunAt(bar)) return this.bars.get(bar) ?? null;
		const run = this.run;
		if (!run) return null;
		if (!run.entryLaid) {
			run.entryLaid = true;
			if (run.landing > 0) {
				// The clicked bars before the first silence: played, not judged, the end of a cycle before the first.
				const figure = figureFor(this.exercise, run.params, this.playedInSeries).figure;
				for (let i = 0; i < run.landing; i++) {
					this.bars.set(bar + i, {
						phase: 'play',
						run,
						cycle: null,
						figure,
						figureBar: bar + i - run.playFrom,
						barInCycle: run.params.cycleBars - run.landing + i,
						muted: false,
						own: true,
						scheduled: false
					});
				}
				return this.bars.get(bar) ?? null;
			}
		}
		if (run.played >= run.params.cyclesPerBreath) {
			if (this.deps.now() - this.startedAt >= RHYTHM_SERIES_MS) {
				this.ending = true;
				if (this.live.length === 0) void this.finish();
				return null;
			}
			// The next run reads its level when bar `to` is laid out, on beat 0 of bar `to − 1`,
			// and the last cycle settles at `from + SETTLE_AFTER_BARS`: this needs a breath of at
			// least 2 bars, which every catalog exercise gives (pinned by a catalog test).
			const { from, to } = this.transport.breath(bar);
			this.closeTake(this.timeOfBar(from));
			for (let b = from; b < to; b++) this.bars.set(b, this.idleBar(run, run.lastFigure, 'breath'));
			this.run = null;
			return this.bars.get(bar) ?? null;
		}
		const heard = this.listenNext && run.params.listen !== 'none';
		this.listenNext = false;
		this.layCycle(bar, run, heard ? 'listening' : 'play');
		return this.bars.get(bar) ?? null;
	}

	/**
	 * The run after a breath, at the level reached: at a new tempo, the listen-in and a counted
	 * bar first (false: `bar` is a listen-in bar); else it starts at `bar` (true).
	 */
	private startRunAt(bar: number): boolean {
		const run = this.newRun(bar);
		this.run = run;
		const segments = this.transport.map.segments;
		const tempo = segments[segments.length - 1];
		const next = run.params.tempo;
		if (next.bpm === tempo.bpm && next.unit.equals(tempo.unit)) {
			this.keepInputOf(run);
			return true;
		}
		const { playFrom } = this.transport.changeTempo(bar, next, unmuted(run.params.accompaniment), {
			listenInBars: run.params.listenInBars,
			countIn: run.params.countIn
		});
		run.playFrom = playFrom;
		this.keepInputOf(run);
		for (let b = bar; b < playFrom; b++) {
			this.bars.set(
				b,
				this.idleBar(
					run,
					run.lastFigure,
					b < playFrom - (run.params.countIn === false ? 0 : 1) ? 'listen-in' : 'count-in'
				)
			);
		}
		return false;
	}

	private layCycle(bar: number, run: Run, kind: Cycle['kind']): void {
		const { params } = run;
		const startBar = bar - run.playFrom;
		const choice = figureFor(this.exercise, params, this.playedInSeries);
		const setup: CycleSetup = {
			figureId: choice.id,
			figure: choice.figure,
			level: run.level,
			params,
			startBar
		};
		const cycle: Cycle = {
			kind,
			run,
			setup,
			fromBar: bar,
			toBar: bar + params.cycleBars,
			round: null,
			span: null,
			spanOpen: false,
			settled: false,
			written: null
		};
		if (kind === 'play') {
			const aids = cycleAids({ params, aidLevel: run.level < 0, listened: this.listened });
			this.listened = false;
			const plan = compileCyclePlan({
				figure: choice.figure,
				cycleBars: params.cycleBars,
				startBar,
				sensor: this.sensor,
				window: params.window,
				accompanimentBars: params.accompaniment.bars
			});
			cycle.round = new PlanRound({
				plan,
				map: this.transport.map,
				start: Fraction.of(bar).mul(barLength(this.meter)),
				latency: this.latency(),
				thresholds: params.thresholds,
				aids
			});
			cycle.span = new ObservationSpan(cycle.round.startTime, this.plannedItem(setup));
			cycle.spanOpen = true;
			run.played++;
			this.playedInSeries++;
			this.live.push(cycle);
			this.transport.at(Fraction.of(cycle.toBar).add(SETTLE_AFTER_BARS), () =>
				this.settleCycle(cycle)
			);
		} else {
			this.listened = true;
		}
		run.lastFigure = choice.figure;
		const bars = params.accompaniment.bars;
		for (let i = 0; i < params.cycleBars; i++) {
			this.bars.set(bar + i, {
				phase: kind,
				run,
				cycle,
				figure: choice.figure,
				figureBar: startBar + i,
				barInCycle: i,
				muted: bars[(startBar + i) % bars.length] === 'off',
				own: true,
				scheduled: false
			});
		}
	}

	// Cycles -------------------------------------------------------------------------------

	private onObservation(observation: Observation): void {
		if (this.view.status !== 'count-in' && this.view.status !== 'awaiting') return;
		const seen = {
			time: observation.time,
			sensor: this.sensor,
			readable: observation.readable,
			payload: observation.payload
		};
		for (const cycle of this.live) {
			const fate = cycle.round?.observe(seen);
			if (fate && fate !== 'after-capture') {
				if (cycle.spanOpen) cycle.span?.add(this.sensor, observation, fate, null);
				return;
			}
		}
		const current = this.current;
		if (current?.spanOpen) current.span?.add(this.sensor, observation, 'after-capture', null);
	}

	/** Judges a played cycle, stores it, and moves the level when it was played at the level held. */
	private settleCycle(cycle: Cycle): void {
		const round = cycle.round;
		if (cycle.settled || !round) return;
		cycle.settled = true;
		this.live = this.live.filter((c) => c !== cycle);
		const outcome = round.settle();
		cycle.run.settled.push({
			report: outcome.detail as CycleReport,
			verdict: outcome.verdict.value as CycleVerdict
		});
		if (cycle.setup.level === this.levelState.level) {
			const { state } = nextLevelState(this.levelState, rhythmLevels(this.exercise).levels, {
				success: outcome.success,
				aided: levelAided(outcome.aids, cycle.setup.params)
			});
			this.levelState = state;
			// From a recovered promise: one failed write must not stop the later ones.
			this.levelWrite = this.levelWrite
				.catch(() => undefined)
				.then(() => this.deps.levels.put(state));
			this.track(this.levelWrite);
		}
		// A later cycle has begun: this one's span is complete now. Else it stays open (breath).
		const complete = this.current !== cycle;
		let observations = cycle.span?.snapshot() ?? [];
		if (complete && cycle.spanOpen) {
			cycle.spanOpen = false;
			observations = cycle.span?.close() ?? observations;
		}
		const attempt = recordCycle({
			sessionId: this.sessionId,
			exerciseId: this.exercise.id,
			setup: cycle.setup,
			outcome,
			promptedAt: this.deps.clock.toEpochMs(round.startTime),
			observations
		});
		cycle.written = this.deps.attempts.add(attempt);
		this.track(cycle.written);
		if (this.shown) this.show(this.shown.bar, this.shown.beat);
		if (this.ending && this.live.length === 0) void this.finish();
	}

	/** Ends a settled cycle's span; its attempt takes the final list. */
	private closeSpan(cycle: Cycle): void {
		if (!cycle.spanOpen || !cycle.span) return;
		cycle.spanOpen = false;
		const observations = cycle.span.close();
		const written = cycle.written;
		if (written) {
			this.track(written.then((id) => this.deps.attempts.setObservations(id, observations)));
		}
	}

	/**
	 * Stops the sounds and the wake-ups; a cycle already over is settled and stored, one under
	 * way (or laid out ahead) is dropped without an attempt, and its figure comes again next.
	 */
	private stopPlaying(): void {
		// Before the transport stops: stopping empties the journal of the sounds.
		if (this.begun) this.closeTake(this.deps.clock.now());
		// Even with no take, or one already closed: a start asked ahead must not wipe it, and no
		// input is kept while nothing plays.
		this.deps.takes.stopKeeping();
		this.transport.stop();
		this.ending = false;
		const now = this.deps.clock.now();
		for (const cycle of [...this.live]) {
			if (cycle.round && cycle.round.endTime <= now) this.settleCycle(cycle);
		}
		for (const cycle of this.live) {
			cycle.spanOpen = false;
			cycle.span?.close();
			// Counted when laid out: a dropped cycle gives its figure back.
			this.playedInSeries--;
		}
		this.live = [];
		if (this.current) this.closeSpan(this.current);
		this.current = null;
		this.bars.clear();
		this.run = null;
		this.listenNext = false;
		this.shown = null;
		this.begun = false;
		this.view.countdown = null;
	}

	private async finish(): Promise<void> {
		if (this.view.status === 'finished') return;
		// Every cycle is settled by now when the series ran out; quit has stopped already.
		this.stopPlaying();
		this.view.status = 'finished';
		this.stopObservations?.();
		this.stopObservations = null;
		this.deps.detector.stop();
		// The record is taken before the wait: a restart meanwhile gives the next series its own.
		if (!this.startedAt) return;
		const ended = this.sessionRecord(this.deps.now());
		while (this.writes.size > 0) await Promise.allSettled([...this.writes]);
		await this.deps.sessions.put(ended);
	}

	// Take ---------------------------------------------------------------------------------

	/** The input is kept from the run's first bar on, a bar or more ahead of it. */
	private keepInputOf(run: Run): void {
		this.deps.takes.keepFrom(this.timeOfBar(run.playFrom));
	}

	/** The run whose first bar `bar` is becomes the take, the last one forgotten. */
	private openTake(bar: number): void {
		const run = this.bars.get(bar)?.run;
		if (!run || run.playFrom !== bar || this.take?.run === run) return;
		this.take = { run, from: this.timeOfBar(bar), to: null, sounds: [] };
	}

	/**
	 * Ends the take at `to` (its breath, or a pause), with the sounds the run made and the click
	 * of its muted bars; a pause before its breath cuts a take already ended short.
	 */
	private closeTake(to: number): void {
		const take = this.take;
		if (!take) return;
		if (take.to !== null) {
			if (to >= take.to) return;
			take.to = to;
			take.sounds = take.sounds.filter((sound) => sound.time < to);
			this.deps.takes.keepUntil(to);
			return;
		}
		const { run, from } = take;
		const heard = this.deps.sounds.emitted().filter((s) => s.time >= from && s.time < to);
		const { accompaniment } = run.params;
		const n = accompaniment.bars.length;
		const muted: ScheduledSound[] = [];
		for (let bar = run.playFrom; this.timeOfBar(bar) < to; bar++) {
			if (accompaniment.bars[(bar - run.playFrom) % n] !== 'off') continue;
			const clicks = renderSounds(unmuted(accompaniment), this.transport.map, bar, bar + 1);
			muted.push(...clicks.filter((sound) => sound.time < to));
		}
		take.to = to;
		take.sounds = [...heard, ...muted].sort((a, b) => a.time - b.time);
		this.deps.takes.keepUntil(to);
	}

	private inBreath(): boolean {
		if (this.view.status !== 'awaiting' || !this.shown) return false;
		return this.bars.get(this.shown.bar)?.phase === 'breath';
	}

	private timeOfBar(bar: number): number {
		return this.transport.map.toSeconds(Fraction.of(bar).mul(barLength(this.meter)));
	}

	// Screen -------------------------------------------------------------------------------

	private show(bar: number, beat: number): void {
		const laid = this.bars.get(bar);
		if (!laid) return;
		this.shown = { bar, beat };
		const { run } = laid;
		const breath = laid.phase === 'breath';
		// At the breath, the level, tempo and figure of the run to come.
		const level = breath ? this.levelState.level : run.level;
		const params = breath ? this.paramsOf(level) : run.params;
		const cursorShown =
			laid.phase === 'listening' || (laid.phase === 'play' && run.params.cursor && !laid.muted);
		const model: RhythmStageModel = {
			phase: laid.phase,
			exerciseLabel: this.exercise.title?.[this.settings.locale] ?? this.exercise.id,
			level: levelView(rhythmLevels(this.exercise).levels, level),
			tempo: tempoView(params.tempo),
			figure: breath ? run.lastFigure : laid.figure,
			next: breath ? figureFor(this.exercise, params, this.playedInSeries).figure : null,
			barInCycle: laid.barInCycle,
			cycleBars: run.params.cycleBars,
			muted: laid.muted,
			cursor: cursorShown
				? figurePosition({ figure: laid.figure, startBar: laid.figureBar, barInCycle: 0, beat })
				: null,
			feedback: run.params.feedback,
			settled: [...run.settled],
			announcement: breath ? this.announcement(run.level, level) : null,
			listen: params.listen
		};
		this.view.stage = { view: this.viewName(), model };
		this.view.status =
			laid.phase === 'listen-in' || laid.phase === 'count-in' ? 'count-in' : 'awaiting';
		this.view.tempoBpm = laid.phase === 'breath' ? run.params.tempo.bpm : params.tempo.bpm;
		// A breath followed by a new tempo does not count down: the listen-in comes first.
		const recounted = breath && this.bars.get(bar + 1)?.phase === 'listen-in';
		this.view.countdown = recounted ? null : this.transport.countdownAt(bar, beat);
	}

	/** Before the start: the run to come, waiting. */
	private waitingModel(): RhythmStageModel {
		const level = this.levelState.level;
		const params = this.paramsOf(level);
		return {
			phase: 'listen-in',
			exerciseLabel: this.exercise.title?.[this.settings.locale] ?? this.exercise.id,
			level: levelView(rhythmLevels(this.exercise).levels, level),
			tempo: tempoView(params.tempo),
			figure: figureFor(this.exercise, params, this.playedInSeries).figure,
			next: null,
			barInCycle: 0,
			cycleBars: params.cycleBars,
			muted: false,
			cursor: null,
			feedback: params.feedback,
			settled: [],
			announcement: null,
			listen: params.listen
		};
	}

	private announcement(played: number, reached: number): RhythmStageModel['announcement'] {
		if (reached > played) return 'level-up';
		if (reached < played) return 'level-down';
		return null;
	}

	// Helpers ------------------------------------------------------------------------------

	private paramsOf(level: number): LevelParams {
		return levelParamsOf(this.exercise, level);
	}

	private viewName(): string {
		return this.exercise.view ?? DEFAULT_PLAY_VIEW;
	}

	/**
	 * The calibrated latency of the sensor, with its provenance; null when uncalibrated. Until the
	 * attack sensor has its own, it takes the note's (same input, measured on the player's attacks
	 * on the click): provenance `player`, shown, not judged.
	 */
	private latency(): CycleReport['latency'] {
		const own = this.settings.latency[this.sensor];
		if (own) return { ms: own.ms, provenance: own.provenance };
		const fallback =
			this.sensor === RHYTHM_SENSOR ? this.settings.latency[ATTACK_LATENCY_FALLBACK] : undefined;
		return fallback ? { ms: fallback.ms, provenance: 'player' } : null;
	}

	private openObservations(): void {
		this.stopObservations?.();
		const factory = this.deps.sensors[this.sensor];
		if (!factory) throw new Error(`No factory for sensor: ${this.sensor}`);
		const source = factory({
			latencyMs: this.latency()?.ms ?? 0,
			clock: this.deps.clock
		});
		this.stopObservations = source.onObservation((observation) => this.onObservation(observation));
	}

	/** The span of a cycle files its observations under the cycle's item. */
	private plannedItem(setup: CycleSetup): PlannedItem<RhythmItem> {
		return {
			exerciseId: this.exercise.id,
			mechanic: rhythmFigureRules.id,
			item: { figureId: setup.figureId, level: setup.level },
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		};
	}

	private sessionRecord(endedAt: number | null) {
		return {
			id: this.sessionId,
			kind: 'exercise' as const,
			exerciseId: this.exercise.id,
			startedAt: this.startedAt,
			endedAt,
			fatigueDetected: false,
			executions: [
				{
					exerciseId: this.exercise.id,
					tempoBpm: this.paramsOf(this.levelState.level).tempo.bpm
				}
			],
			// The level held now: a summary read later shows this session's, not the latest.
			levelReached: this.levelState.level,
			latencyMs: this.latency()?.ms ?? null
		};
	}

	private track(write: Promise<unknown>): void {
		const tracked = write.catch(() => undefined).finally(() => this.writes.delete(tracked));
		this.writes.add(tracked);
	}
}
