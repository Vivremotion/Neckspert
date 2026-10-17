import { describe, expect, it } from 'vitest';
import {
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	type ExerciseDefinition
} from '$lib/domain/exercise';
import {
	Fraction,
	attackPositions,
	barLength,
	compileCyclePlan,
	figureFromJson,
	type CycleReport,
	type Figure
} from '$lib/domain/time';
import type { Attempt, SensorLatency, Settings } from '$lib/domain/types';
import {
	FakeAttackDetector,
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	FakeSoundScheduler,
	FakeTakeBuffer,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { attackSensor } from '../sensors';
import type { PlanSessionDeps } from '../SessionDeps';
import { SESSION_MS, type Segment } from '$lib/domain/session';
import { SessionMemory } from '../sessionMemory';
import { PlanSessionController } from './PlanSessionController.svelte';
import type { CyclePlanRecord, RhythmAttemptData } from './recordCycle';
import { PLAIN_WORDS_SESSIONS, type RhythmStageModel } from './rhythmStage';

/** The transport starts its map this long after `now`; the tests start at clock time 0. */
const ORIGIN = 0.1;
/**
 * Steps of simulated time between two flushes of the sound scheduler: a power of two, so the
 * clock moves exactly and never lands on a bar or a beat (they fall `ORIGIN` past a whole second).
 */
const STEPS_PER_S = 64;

/** An attempt of the exercise from an earlier series: the exercise is no longer met for the first time. */
function earlier(exerciseId: string): Attempt {
	return {
		sessionId: 'old',
		exerciseId,
		mechanic: 'rhythm-figure',
		cardKey: 'rhythm-figure:old@0',
		phase: 'free',
		temperature: 'hot',
		aids: [],
		promptedAt: 0,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: null,
		success: false,
		verdict: { relation: 'cycle', version: 1, value: { passed: false, reasons: ['missed'] } },
		measures: {},
		plan: null,
		data: null,
		observations: null
	};
}

/** The exercise with a counted bar after its listen-in, whatever its catalog start. */
function counted(exercise: ExerciseDefinition): ExerciseDefinition {
	return { ...exercise, base: exercise.base && { ...exercise.base, countIn: true } };
}

async function setup(
	exercise: ExerciseDefinition,
	options: {
		met?: boolean;
		latency?: SensorLatency;
		/** Latencies of other sensors, beside the attack's. */
		latencies?: Settings['latency'];
		clickBleed?: boolean;
	} = {}
) {
	const played = exercise;
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const attacks = new FakeAttackDetector();
	const attempts = new InMemoryAttemptRepository();
	const levels = new InMemoryLevelStateRepository();
	const settings = new InMemorySettingsRepository();
	const sessions = new InMemorySessionRepository();
	const detector = new FakeNoteDetector();
	const takes = new FakeTakeBuffer();
	const memory = new SessionMemory();
	if (options.met) await attempts.add(earlier(exercise.id));
	await settings.update({
		latency: { ...options.latencies, ...(options.latency && { attack: options.latency }) },
		clickBleed: options.clickBleed ?? false
	});
	let ids = 0;
	/** Wall time gone by beyond the audio clock: a series can be made to run out. */
	const wall = { extraMs: 0 };
	const deps: PlanSessionDeps = {
		clock,
		metronome: new FakeMetronome(clock),
		detector,
		cues: new FakeSoundCues(),
		attempts,
		cards: new InMemoryCardStateRepository(),
		sessions,
		progressions: new InMemoryProgressionRepository(),
		settings,
		now: () => clock.toEpochMs(clock.now()) + wall.extraMs,
		random: () => 0,
		newId: () => `s${++ids}`,
		exercise: () => played,
		mechanics: {},
		sensors: { attack: attackSensor(attacks) },
		sounds,
		levels,
		takes,
		memory
	};
	const controller = new PlanSessionController({ id: 'series', exerciseId: exercise.id }, deps);
	const player = new Player(controller, attacks, clock);

	/** Moves the clock to `to` seconds by small steps, the player playing along when it plays. */
	async function advance(to: number, playing = true): Promise<void> {
		while (clock.time < to - 1e-9) {
			clock.time = Math.min(to, (Math.floor(clock.time * STEPS_PER_S + 1e-6) + 1) / STEPS_PER_S);
			sounds.flush();
			takes.hear(clock.time);
			if (playing) player.step();
		}
		await settled();
	}

	return {
		clock,
		sounds,
		attacks,
		attempts,
		levels,
		sessions,
		detector,
		takes,
		memory,
		controller,
		player,
		advance,
		wall
	};
}

/** Lets the writes started by the controller finish. */
async function settled(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function stageOf(controller: PlanSessionController): RhythmStageModel {
	const stage = controller.view.stage;
	if (!stage) throw new Error('no stage on show');
	return stage.model as RhythmStageModel;
}

/**
 * Plays the figure on every bar the stage shows as played, from the bar where play began (the
 * entry starts the figure), each attack `offsetS` off the written time.
 */
class Player {
	offsetS = 0;
	/** Attack `skip` of each bar is not played (the player misreads the same note). */
	skip: number | null = null;
	/** Each attack alternately this early and this late (the player plays unevenly). */
	jitterS = 0;
	private played = 0;
	private bar = -1;
	private playFrom: number | null = null;
	private queue: number[] = [];

	constructor(
		private readonly controller: PlanSessionController,
		private readonly attacks: FakeAttackDetector,
		private readonly clock: FakeClock
	) {}

	step(): void {
		const stage = this.controller.view.stage;
		if (!stage) return;
		const model = stage.model as RhythmStageModel;
		const barS = (60 / model.tempo.bpm) * 4;
		const bar = Math.floor((this.clock.now() - ORIGIN) / barS + 1e-9);
		if (bar !== this.bar) {
			this.bar = bar;
			if (model.phase === 'play') {
				this.playFrom ??= bar;
				this.queue.push(
					...barAttacks(model.figure, bar - this.playFrom, ORIGIN + bar * barS, barS).filter(
						(_, index) => index !== this.skip
					)
				);
			} else {
				this.playFrom = null;
			}
		}
		const due = this.queue.filter((t) => t <= this.clock.now());
		this.queue = this.queue.filter((t) => t > this.clock.now());
		for (const time of due) {
			const jitter = this.jitterS * (this.played++ % 2 === 0 ? -1 : 1);
			this.attacks.emit({ time: time + this.offsetS + jitter, strength: 1 });
		}
	}
}

/** The audio times of the attacks of figure bar `played % bars`, the bar starting at `startS`. */
function barAttacks(figure: Figure, played: number, startS: number, barS: number): number[] {
	const length = barLength(figure.meter);
	const figureBar = played % figure.bars;
	const from = length.mul(Fraction.of(figureBar));
	const to = length.mul(Fraction.of(figureBar + 1));
	return attackPositions(figure)
		.filter((at) => at.compare(from) >= 0 && at.compare(to) < 0)
		.map((at) => startS + at.sub(from).div(length).toNumber() * barS);
}

const OFFBEATS_BAR_S = 3; // ♩ = 80 bpm
const TWO_FOUR_BAR_S = 2.4; // ♩ = 100 bpm

describe('PlanSessionController, a series of offbeats played exactly', () => {
	it('records four passed cycles, then breathes with the four of them', async () => {
		const { controller, attempts, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.ready();
		await controller.start();
		expect(controller.timeline.nowBeat()).toBeCloseTo(-ORIGIN / 0.75, 2);
		// listen-in bars 0-1, counted bar 2, cycles on bars 3 to 6, the breath from bar 7
		// (checked a little past a beat: the bars and beats fall between two steps of the clock)
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		const stored = await attempts.listBySession('series');
		expect(stored).toHaveLength(4);
		for (const attempt of stored) {
			expect(attempt.success).toBe(true);
			expect(attempt.correct).toBeNull();
			expect(attempt.verdict.relation).toBe('cycle');
			expect(attempt.plan).not.toBeNull();
			expect(attempt.mechanic).toBe('rhythm-figure');
			expect(attempt.observations?.filter((o) => o.fate === 'answer')).toHaveLength(5);
		}
		const model = stageOf(controller);
		expect(model.phase).toBe('breath');
		expect(model.settled).toHaveLength(4);
		expect(model.settled.every((cycle) => cycle.verdict.passed)).toBe(true);
		expect(controller.view.stage?.view).toBe('rhythm-figure');
		controller.quit();
	});

	it('moves up a level after three passed cycles and says so at the breath', async () => {
		const { controller, levels, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		expect(stageOf(controller).level).toEqual({ shown: 1, of: 4, aid: false });
		await advance(ORIGIN + 6.6 * OFFBEATS_BAR_S);
		const state = await levels.get({ exerciseId: 'rhythm-offbeats', scope: '', item: '' });
		expect(state?.level).toBe(1);
		// The run goes on at its level: the change shows at the breath, with the figure to come.
		expect(stageOf(controller).announcement).toBeNull();
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		const model = stageOf(controller);
		expect(model.phase).toBe('breath');
		expect(model.announcement).toBe('level-up');
		expect(model.level.shown).toBe(2);
		expect(model.next?.bars).toBe(2);
		controller.quit();
	});

	it('tells the how-to and plays the figure as a demonstration the first time', async () => {
		const { controller, sounds } = await setup(RHYTHM_OFFBEATS);
		await controller.ready();
		expect(controller.view.briefing?.text).toBe(RHYTHM_OFFBEATS.howTo?.fr);
		await controller.start();
		expect(controller.view.briefing).toBeNull();
		const demo = sounds.emitted().filter((s) => s.sound === 'demo');
		// One bar of demonstration after the two listen-in bars, before the counted bar.
		expect(demo).toHaveLength(5);
		expect(demo[0].time).toBeCloseTo(ORIGIN + 2 * OFFBEATS_BAR_S, 9);
		controller.quit();
	});
});

describe('PlanSessionController, the level written', () => {
	it('goes on writing after a write that failed', async () => {
		const { controller, levels, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		const put = levels.put.bind(levels);
		let calls = 0;
		levels.put = async (state) => {
			calls++;
			if (calls === 1) throw new Error('disk full');
			return put(state);
		};
		await controller.start();
		await advance(ORIGIN + 6.6 * OFFBEATS_BAR_S);
		expect(calls).toBeGreaterThan(1);
		const state = await levels.get({ exerciseId: 'rhythm-offbeats', scope: '', item: '' });
		expect(state?.level).toBe(1);
		controller.quit();
	});
});

describe('PlanSessionController, pausing', () => {
	it('drops the cycle under way, keeps the ones over, and counts in again on resume', async () => {
		const { controller, attempts, sounds, clock, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		// cycle 3 settled at 4.25 bars; cycle 4 under way
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		controller.pause();
		expect(controller.view.status).toBe('paused');
		await advance(ORIGIN + 8 * OFFBEATS_BAR_S);
		expect(sounds.emitted()).toEqual([]);
		expect(await attempts.listBySession('series')).toHaveLength(1);
		controller.resume();
		await settled();
		expect(controller.view.status).toBe('count-in');
		expect(stageOf(controller).phase).toBe('listen-in');
		// Listen-in and a counted bar again, from now.
		const resumedAt = clock.now() + ORIGIN;
		expect(sounds.emitted()[0].time).toBeCloseTo(resumedAt, 9);
		controller.quit();
	});
});

describe('PlanSessionController, pausing in « Métronome sur 2 et 4 »', () => {
	/** The lines of the cycles stored, in order. */
	async function lines(attempts: InMemoryAttemptRepository): Promise<string[]> {
		const stored = await attempts.listBySession('series');
		return stored.map((attempt) => (attempt.data as RhythmAttemptData).item.figureId);
	}

	/** Resumes, then lets two cycles be played (unanswered) from the run that follows. */
	async function resumeForTwoCycles(
		controller: PlanSessionController,
		clock: FakeClock,
		advance: (to: number, playing?: boolean) => Promise<void>
	): Promise<void> {
		controller.resume();
		await settled();
		// listen-in 0-1, count 2, cycle 3-6, breath 7-8, cycle 9-12, settled past 13
		await advance(clock.now() + ORIGIN + 13.5 * TWO_FOUR_BAR_S, false);
	}

	it('plays again the line it was reading when paused during its cycle', async () => {
		const { controller, attempts, clock, advance } = await setup(RHYTHM_TWO_FOUR, { met: true });
		await controller.start();
		// The first line's cycle, bars 3 to 6, under way.
		await advance(ORIGIN + 4.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		controller.pause();
		expect(await lines(attempts)).toEqual([]);
		await resumeForTwoCycles(controller, clock, advance);
		expect(await lines(attempts)).toEqual(['line-1', 'line-2']);
		controller.quit();
	});

	it('plays the line laid out a bar ahead when paused just before its cycle', async () => {
		const { controller, attempts, clock, advance } = await setup(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// The counted bar: the first cycle, on bar 3, is laid out already.
		await advance(ORIGIN + 2.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('count-in');
		controller.pause();
		await resumeForTwoCycles(controller, clock, advance);
		expect(await lines(attempts)).toEqual(['line-1', 'line-2']);
		controller.quit();
	});

	it('goes on to the next line after a cycle played to its end', async () => {
		const { controller, attempts, clock, advance } = await setup(RHYTHM_TWO_FOUR, { met: true });
		await controller.start();
		// The first line settled; the breath, bars 7 and 8.
		await advance(ORIGIN + 7.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.pause();
		await resumeForTwoCycles(controller, clock, advance);
		expect(await lines(attempts)).toEqual(['line-1', 'line-2', 'line-3']);
		controller.quit();
	});
});

describe('PlanSessionController, another series', () => {
	it('starts a new series under a new id once the last one finished', async () => {
		const { controller, sessions, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 1.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		await controller.start();
		expect(controller.sessionId).toBe('s1');
		expect(controller.view.status).toBe('count-in');
		expect(await sessions.get('s1')).toMatchObject({ kind: 'exercise', endedAt: null });
		controller.quit();
	});

	it('keeps on its own session the level held when the series ended, whatever a later one does', async () => {
		const { controller, sessions, levels, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect((await sessions.get('series'))?.levelReached).toBe(1);
		// Later the stored level moves on: the first session's own record does not.
		await levels.put({
			exerciseId: 'rhythm-offbeats',
			scope: '',
			item: '',
			level: 3,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		expect((await sessions.get('series'))?.levelReached).toBe(1);
	});

	it('writes no session for a second series whose input never opened', async () => {
		const { controller, sessions, detector, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 1.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		detector.start = () => Promise.reject(new Error('no input'));
		await controller.start();
		expect(controller.view.audioError).toBe('input');
		expect(controller.sessionId).toBe('s1');
		controller.quit();
		await settled();
		expect(await sessions.get('s1')).toBeUndefined();
	});

	it('keeps the start of the series that ends when another starts before its writes are done', async () => {
		const { controller, attempts, sessions, clock, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		const add = attempts.add.bind(attempts);
		attempts.add = async (attempt) => {
			await gate;
			return add(attempt);
		};
		await controller.start();
		const opened = await sessions.get('series');
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		// The first cycle is settled, its write pending: the quit waits for it.
		controller.quit();
		await settled();
		clock.time += 60;
		await controller.start();
		expect(controller.sessionId).toBe('s1');
		release();
		await settled();
		const ended = await sessions.get('series');
		expect(ended?.startedAt).toBe(opened?.startedAt);
		expect(ended?.endedAt).not.toBeNull();
		controller.quit();
	});
});

describe('PlanSessionController, the end of a series', () => {
	it('ends with the run under way once the series has lasted its time', async () => {
		const { controller, attempts, sessions, sounds, advance, wall } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		wall.extraMs = SESSION_MS;
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		expect(controller.view.status).toBe('finished');
		// The four cycles of the run, and no breath after them.
		expect(await attempts.listBySession('series')).toHaveLength(4);
		const breathAt = ORIGIN + 7 * OFFBEATS_BAR_S;
		expect(sounds.emitted().filter((s) => s.time >= breathAt - 1e-9)).toEqual([]);
		expect((await sessions.get('series'))?.endedAt).not.toBeNull();
	});
});

/** The `series` segment of the session the memory holds, and its children's roles. */
function seriesOf(memory: SessionMemory): Segment {
	const playback = memory.get('series');
	if (!playback) throw new Error('no session in memory');
	const series = playback.trace.children.find((segment) => segment.role === 'series');
	if (!series) throw new Error('no series in the trace');
	return series;
}

const roles = (segment: Segment) => segment.children.map((child) => child.role);

describe('PlanSessionController, the trace of a series', () => {
	it('traces a series as it is played', async () => {
		const { controller, memory, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// listen-in 0-1, count 2, cycles 3-6, breath from 7
		await advance(ORIGIN + 8.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const series = seriesOf(memory);
		expect(series.exerciseId).toBe(RHYTHM_OFFBEATS.id);
		expect(roles(series).slice(0, 4)).toEqual(['listen-in', 'count-in', 'run', 'breath']);
		const [listenIn, count, run, breath] = series.children;
		expect(listenIn.startS).toBeCloseTo(ORIGIN, 9);
		expect(count.startS).toBeCloseTo(ORIGIN + 2 * OFFBEATS_BAR_S, 9);
		expect(run).toMatchObject({ level: 0, ended: 'done' });
		expect(run.startS).toBeCloseTo(ORIGIN + 3 * OFFBEATS_BAR_S, 9);
		expect(run.endS).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
		expect(roles(run)).toEqual(['round', 'round', 'round', 'round']);
		expect(run.children.every((round) => typeof round.attemptId === 'number')).toBe(true);
		expect(run.children[1].startS).toBeCloseTo(ORIGIN + 4 * OFFBEATS_BAR_S, 9);
		expect(breath.startS).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
	});

	it('a pause cuts the run and its round', async () => {
		const { controller, memory, clock, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 5.5 * OFFBEATS_BAR_S);
		const pausedAt = clock.now();
		controller.pause();
		controller.resume();
		await settled();
		await advance(ORIGIN + 9 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const series = seriesOf(memory);
		const run = series.children.find((segment) => segment.role === 'run') as Segment;
		expect(run).toMatchObject({ ended: 'interrupted' });
		expect(run.endS).toBeCloseTo(pausedAt, 9);
		expect(run.children.at(-1)).toMatchObject({ role: 'round', ended: 'interrupted' });
		expect(run.children.at(-1)?.endS).toBeCloseTo(pausedAt, 9);
		const after = roles(series).slice(roles(series).indexOf('pause'));
		expect(after.slice(0, 4)).toEqual(['pause', 'listen-in', 'count-in', 'run']);
	});

	it('a heard cycle is a listen segment', async () => {
		const { controller, memory, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 3.5 * OFFBEATS_BAR_S);
		controller.listen();
		await advance(ORIGIN + 6.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const run = seriesOf(memory).children.find((segment) => segment.role === 'run') as Segment;
		const listen = run.children.find((segment) => segment.role === 'listen');
		expect(listen).toBeDefined();
		expect(listen?.attemptId).toBeUndefined();
	});

	it('each run keeps its take', async () => {
		const { controller, memory, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// two runs of four cycles with their breaths
		await advance(ORIGIN + 17.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const playback = memory.get('series');
		const runs = seriesOf(memory).children.filter((segment) => segment.role === 'run');
		expect(runs.length).toBeGreaterThanOrEqual(2);
		for (const run of runs.slice(0, 2)) {
			const take = playback?.takes.get(run.id);
			expect(take?.from).toBeCloseTo(run.startS, 9);
			expect(take?.to).toBeCloseTo(run.endS, 9);
		}
	});

	it('the series ends after SESSION_MS with its run, for its time', async () => {
		const { controller, memory, wall, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		wall.extraMs = SESSION_MS;
		await advance(ORIGIN + 8 * OFFBEATS_BAR_S);
		expect(controller.view.status).toBe('finished');
		await settled();
		const series = seriesOf(memory);
		expect(series.reason).toBe('time');
		const run = series.children.find((segment) => segment.role === 'run') as Segment;
		expect(run).toMatchObject({ ended: 'done' });
		expect(run.endS).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
	});

	it('a pause once the end is decided ends the series, it does not bring it back', async () => {
		const { controller, memory, attempts, wall, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		wall.extraMs = SESSION_MS;
		// The end is decided on beat 1 of bar 6 (bar 7 would be the breath); pause in bar 6.
		await advance(ORIGIN + 6.5 * OFFBEATS_BAR_S);
		controller.pause();
		await settled();
		expect(controller.view.status).toBe('finished');
		controller.resume();
		await advance(ORIGIN + 14 * OFFBEATS_BAR_S, false);
		expect(controller.view.status).toBe('finished');
		expect(seriesOf(memory).reason).toBe('time');
		expect(await attempts.listBySession('series')).toHaveLength(3);
		// Cut by the pause, before the bar it was to end on.
		const run = seriesOf(memory).children.find((segment) => segment.role === 'run') as Segment;
		expect(run.ended).toBe('interrupted');
		expect(run.endS).toBeLessThan(ORIGIN + 7 * OFFBEATS_BAR_S);
	});

	it('quit marks the series', async () => {
		const { controller, memory, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 4.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect(seriesOf(memory).reason).toBe('quit');
	});
});

/** The announcements shown while the clock moves to `to`. */
async function watch(
	controller: PlanSessionController,
	advance: (to: number) => Promise<void>,
	clock: FakeClock,
	to: number
): Promise<Set<string>> {
	const seen = new Set<string>();
	while (clock.time < to - 1e-9) {
		await advance(Math.min(to, clock.time + 0.25));
		const announcement = controller.view.stage
			? (stageOf(controller).announcement as string | null)
			: null;
		if (announcement) seen.add(announcement);
	}
	return seen;
}

describe('PlanSessionController, unblocking', () => {
	it('a reading block is heard, then played along', async () => {
		const { controller, memory, sounds, attempts, player, clock, advance } = await setup(
			RHYTHM_OFFBEATS,
			{ met: true }
		);
		player.skip = 3;
		await controller.start();
		// run 1 on bars 3-6 (all fail), breath 7-8, run 2 from 9: a listen, then a play-along
		const seen = await watch(controller, advance, clock, ORIGIN + 12.5 * OFFBEATS_BAR_S);
		// Read before quitting: stopping empties the journal of the sounds.
		const emitted = sounds.emitted();
		controller.quit();
		await settled();
		expect(seen.has('listen-remedy')).toBe(true);
		expect(seen.has('play-along')).toBe(true);
		const runs = seriesOf(memory).children.filter((segment) => segment.role === 'run');
		expect(roles(runs[1]).slice(0, 2)).toEqual(['listen', 'round']);
		const along = (await attempts.listBySession('series')).find(
			(a) => a.id === runs[1].children[1].attemptId
		);
		expect(along?.aids).toContain('play-along');
		const alongFrom = runs[1].children[1].startS;
		expect(
			emitted.some((s) => s.sound === 'play-along' && Math.abs(s.time - alongFrom) < 0.6)
		).toBe(true);
	});

	it('an execution block takes the aid level at the breath', async () => {
		const { controller, memory, attempts, player, clock, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		player.jitterS = 0.1;
		await controller.start();
		// the aid level is at ♩ = 70 bpm: a listen-in and a counted bar after the breath
		const seen = await watch(controller, advance, clock, ORIGIN + 16 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect(seen.has('aid-level')).toBe(true);
		const runs = seriesOf(memory).children.filter((segment) => segment.role === 'run');
		expect(runs[1].level).toBe(-1);
		const first = (await attempts.listBySession('series')).find(
			(a) => a.id === runs[1].children[0].attemptId
		);
		expect(first?.aids).toContain('aid-level');
	});

	it('a change of air never plays the cycle laid out ahead', async () => {
		// Eight cycles a run: when the third settles, the fifth is already laid out.
		const long = {
			...RHYTHM_OFFBEATS,
			base: RHYTHM_OFFBEATS.base && { ...RHYTHM_OFFBEATS.base, cyclesPerBreath: 8 }
		};
		const { controller, memory, attempts, levels, player, advance } = await setup(long, {
			met: true
		});
		await levels.put({
			exerciseId: RHYTHM_OFFBEATS.id,
			scope: '',
			item: '',
			level: -1,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		player.jitterS = 0.1;
		await controller.start();
		const barS = (60 / 70) * 4;
		await advance(ORIGIN + 12 * barS);
		expect(controller.view.status).toBe('finished');
		await settled();
		// cycles on bars 3, 4, 5 fail; the third settles a quarter into bar 6, under way: judged;
		// bar 7, laid out ahead, is never played.
		expect(await attempts.listBySession('series')).toHaveLength(4);
		const series = seriesOf(memory);
		expect(series.reason).toBe('change-of-air');
		const run = series.children.find((segment) => segment.role === 'run') as Segment;
		expect(run).toMatchObject({ ended: 'done' });
		expect(run.children).toHaveLength(4);
		expect(run.endS).toBeCloseTo(ORIGIN + 7 * barS, 9);
	});

	it('the lowest aid level that blocks changes the air', async () => {
		const { controller, memory, attempts, levels, player, advance, clock } = await setup(
			RHYTHM_OFFBEATS,
			{ met: true }
		);
		await levels.put({
			exerciseId: RHYTHM_OFFBEATS.id,
			scope: '',
			item: '',
			level: -1,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		player.jitterS = 0.1;
		await controller.start();
		// ♩ = 70 bpm at the aid level: bars of 60 / 70 * 4 s; run 1 on bars 3-6.
		const barS = (60 / 70) * 4;
		await advance(ORIGIN + 9 * barS);
		expect(controller.view.status).toBe('finished');
		await settled();
		const series = seriesOf(memory);
		expect(series.reason).toBe('change-of-air');
		expect(series.breaking).toBe('regularity');
		expect(await attempts.listBySession('series')).toHaveLength(4);
		const state = await levels.get({ exerciseId: RHYTHM_OFFBEATS.id, scope: '', item: '' });
		expect(state?.resumeAfter).toBeGreaterThan(clock.toEpochMs(0));
		expect(state?.failures).toBe(0);
	});
});

describe('PlanSessionController, plain words', () => {
	async function plainWordsAfter(ended: number): Promise<boolean> {
		const { controller, sessions } = await setup(RHYTHM_OFFBEATS, { met: true });
		for (let i = 0; i < ended; i++) {
			await sessions.put({
				id: `old-${i}`,
				kind: 'exercise',
				exerciseId: RHYTHM_OFFBEATS.id,
				startedAt: i,
				endedAt: i + 1,
				fatigueDetected: false,
				executions: [],
				latencyMs: null
			});
		}
		await controller.ready();
		return stageOf(controller).plainWords;
	}

	it('tells the feedback in plain words until the exercise has PLAIN_WORDS_SESSIONS ended sessions', async () => {
		expect(PLAIN_WORDS_SESSIONS).toBe(3);
		expect(await plainWordsAfter(2)).toBe(true);
		expect(await plainWordsAfter(3)).toBe(false);
	});
});

describe('PlanSessionController, a series with no counted bar', () => {
	it('plays right after the listen-in, at the start and after a pause, with no countdown', async () => {
		const { controller, sounds, clock, advance } = await setup(RHYTHM_TWO_FOUR, { met: true });
		expect(RHYTHM_TWO_FOUR.base?.countIn).toBe(false);
		await controller.start();
		// listen-in 0-1, the first cycle on bar 2: bar 2 is already the line, not a count
		await advance(ORIGIN + 2.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.countdown).toBeNull();
		// the click on 2 and 4 only: no count clicks on beats 1 and 3
		const atStart = sounds.emitted().filter((s) => s.sound === 'click-accent');
		expect(atStart).toHaveLength(0);
		controller.pause();
		controller.resume();
		await settled();
		const resumedAt = clock.now() + ORIGIN;
		await advance(resumedAt + 2.5 * TWO_FOUR_BAR_S, false);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.countdown).toBeNull();
		const again = sounds.emitted().filter((s) => s.time >= resumedAt - 1e-9);
		expect(again.some((s) => s.sound === 'click-accent')).toBe(false);
		controller.quit();
	});
});

describe('PlanSessionController, a level at another tempo', () => {
	it('changes the tempo at the breath, with a listen-in and a counted bar at the new one', async () => {
		const { controller, attempts, sounds, advance } = await setup(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// One cycle per run: cycles on bars 3, 9 and 15, each followed by a two-bar breath.
		await advance(ORIGIN + 20.3 * TWO_FOUR_BAR_S);
		const breath = stageOf(controller);
		expect(breath).toMatchObject({ phase: 'breath', announcement: 'level-up' });
		expect(breath.tempo).toEqual({ bpm: 120, unit: '♩' });
		// The frame keeps the tempo the run was played at: the view scales its marks by it.
		expect(controller.view.tempoBpm).toBe(100);
		// The breath's last bar does not count down: a listen-in at the new tempo comes first.
		expect(controller.view.countdown).toBeNull();
		const changeAt = ORIGIN + 21 * TWO_FOUR_BAR_S;
		await advance(changeAt + 0.6, false);
		expect(stageOf(controller).phase).toBe('listen-in');
		expect(controller.view.status).toBe('count-in');
		const after = sounds
			.emitted()
			.filter((s) => s.time >= changeAt - 1e-9)
			.map((s) => s.time - changeAt);
		// The click on 2 and 4 at ♩ = 120 bpm for two bars, then four clicks counted.
		const expected = [0.5, 1.5, 2.5, 3.5, 4, 4.5, 5, 5.5];
		expect(after.slice(0, expected.length)).toHaveLength(expected.length);
		after.slice(0, expected.length).forEach((t, i) => expect(t).toBeCloseTo(expected[i], 9));
		// The next cycle, from bar 24, runs at the new tempo and on the new level.
		await advance(changeAt + 6 + 8 + 0.6, false);
		const stored = await attempts.listBySession('series');
		expect(stored).toHaveLength(4);
		expect(stored.slice(0, 3).every((a) => a.tempoBpm === 100 && a.success)).toBe(true);
		expect(stored[3]).toMatchObject({ tempoBpm: 120, cardKey: 'rhythm-figure:line-4@1' });
		controller.quit();
	});
});

describe('PlanSessionController, silent bars', () => {
	it('judges the 1 where the click comes back once, in the cycle of the silence', async () => {
		const { controller, attempts, advance } = await setup(RHYTHM_SILENT_BARS, { met: true });
		await controller.start();
		// listen-in 0-1, count 2, entry 3-5, cycles 6-9 and 10-13
		await advance(ORIGIN + 14.6 * OFFBEATS_BAR_S);
		const stored = await attempts.listBySession('series');
		expect(stored.length).toBeGreaterThanOrEqual(2);
		const wholeMs = OFFBEATS_BAR_S * 1000;
		// Every expectation of every stored plan, at its time.
		const expectations = stored.flatMap((attempt) => {
			const plan = attempt.plan as CyclePlanRecord;
			const compiled = compileCyclePlan({
				figure: figureFromJson(plan.figure),
				cycleBars: plan.cycleBars,
				startBar: plan.startBar,
				sensor: 'attack',
				window: { ms: 80 },
				accompanimentBars: plan.accompaniment.bars
			});
			return compiled.expectations.map((e) => ({
				ms: attempt.promptedAt + e.at.toNumber() * wholeMs,
				bar: e.bar,
				muted: compiled.mutedBars
			}));
		});
		const epoch = Date.UTC(2026, 0, 1);
		// The click comes back on bar 7 (the silence is bar 6).
		const comeBack = epoch + (ORIGIN + 7 * OFFBEATS_BAR_S) * 1000;
		const there = expectations.filter((e) => Math.abs(e.ms - comeBack) < 1);
		expect(there).toHaveLength(1);
		expect(there[0].bar).toBe(1);
		expect(there[0].muted).toEqual([0]);
		// And no position anywhere is judged twice.
		const keys = expectations.map((e) => Math.round(e.ms));
		expect(new Set(keys).size).toBe(keys.length);
		expect(stored.every((attempt) => attempt.success)).toBe(true);
		controller.quit();
	});

	it('shows the silence, with no cursor in it', async () => {
		const { controller, advance } = await setup(RHYTHM_SILENT_BARS, { met: true });
		await controller.start();
		await advance(ORIGIN + 6.3 * OFFBEATS_BAR_S);
		const silence = stageOf(controller);
		expect(silence).toMatchObject({ phase: 'play', muted: true, barInCycle: 0, cursor: null });
		await advance(ORIGIN + 7.3 * OFFBEATS_BAR_S);
		const back = stageOf(controller);
		expect(back).toMatchObject({ phase: 'play', muted: false, barInCycle: 1 });
		expect(back.cursor).toEqual(Fraction.of(1, 4));
		controller.quit();
	});
});

describe('PlanSessionController, listening to the figure', () => {
	it('turns the next cycle into one heard, then marks the cycle after it as helped', async () => {
		const { controller, attempts, sounds, advance } = await setup(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// listen-in 0-1, count 2, cycle 3-6, breath 7-8, then the cycle asked for is heard: 9-12
		await advance(ORIGIN + 3.6 * TWO_FOUR_BAR_S);
		controller.listen();
		await advance(ORIGIN + 10.1 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('listening');
		const demo = sounds
			.emitted()
			.filter((s) => s.sound === 'demo')
			.map((s) => s.time);
		expect(demo.length).toBeGreaterThan(0);
		expect(Math.min(...demo)).toBeCloseTo(ORIGIN + 9 * TWO_FOUR_BAR_S, 9);
		// the played cycle 13-16, settled during the breath that follows
		await advance(ORIGIN + 17.6 * TWO_FOUR_BAR_S);
		const stored = await attempts.listBySession('series');
		expect(stored).toHaveLength(2);
		const epoch = Date.UTC(2026, 0, 1);
		const startsAt = (bar: number) => epoch + (ORIGIN + bar * TWO_FOUR_BAR_S) * 1000;
		expect(stored.map((a) => a.promptedAt)).toEqual([startsAt(3), startsAt(13)].map((ms) => ms));
		expect(stored[0].aids).not.toContain('listen');
		expect(stored[1].aids).toContain('listen');
		expect(stored.every((a) => a.success)).toBe(true);
		controller.quit();
	});
});

describe('PlanSessionController, quitting', () => {
	it('stops every sound when quit during the counted bar, with nothing recorded', async () => {
		const { controller, sounds, attempts, sessions, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 2.6 * OFFBEATS_BAR_S);
		expect(controller.view.status).toBe('count-in');
		expect(controller.view.countdown).toBe(2);
		controller.quit();
		await settled();
		const heard = sounds.emitted().length;
		await advance(ORIGIN + 10.1 * OFFBEATS_BAR_S);
		expect(sounds.emitted()).toHaveLength(heard);
		expect(await attempts.listBySession('series')).toEqual([]);
		expect(controller.view.status).toBe('finished');
		const record = await sessions.get('series');
		expect(record).toMatchObject({ kind: 'exercise', exerciseId: 'rhythm-offbeats' });
		expect(record?.endedAt).not.toBeNull();
	});

	it('stops every sound when quit during a breath, every attempt with its verdict', async () => {
		const { controller, sounds, attempts, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 7.2 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.quit();
		await settled();
		const heard = sounds.emitted().length;
		await advance(ORIGIN + 14.1 * OFFBEATS_BAR_S);
		expect(sounds.emitted()).toHaveLength(heard);
		const stored = await attempts.listBySession('series');
		expect(stored).toHaveLength(4);
		expect(stored.every((a) => a.verdict.relation === 'cycle')).toBe(true);
	});

	it('is silent when quit while the audio output warms up', async () => {
		const { controller, sounds, clock } = await setup(RHYTHM_OFFBEATS, { met: true });
		let release: () => void = () => {};
		clock.settle = () => new Promise<void>((resolve) => (release = resolve));
		const starting = controller.start();
		await settled();
		controller.quit();
		release();
		await expect(starting).resolves.toBeUndefined();
		expect(sounds.emitted()).toEqual([]);
		expect(controller.view.status).toBe('finished');
	});
});

describe('PlanSessionController, latency', () => {
	it('plays without a calibrated latency, and precision then judges nothing', async () => {
		const { controller, attempts, player, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await attempts.listBySession('series');
		const report = (first.data as RhythmAttemptData).report as CycleReport;
		expect(report.latency).toBeNull();
		expect(first.measures.precision?.value).toBeCloseTo(70, 0);
		expect(first.success).toBe(true);
		controller.quit();
	});

	it('lets precision judge with a latency measured without the player', async () => {
		const { controller, attempts, player, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true,
			latency: { ms: 0, provenance: 'system' }
		});
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await attempts.listBySession('series');
		expect(first.success).toBe(false);
		expect(first.verdict.value).toEqual({ passed: false, reasons: ['precision'] });
		controller.quit();
	});

	it('a calibrated note latency corrects attacks until the attack sensor has its own', async () => {
		const { controller, attempts, player, takes, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true,
			latencies: { note: { ms: 70, provenance: 'system' } }
		});
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await attempts.listBySession('series');
		const report = (first.data as RhythmAttemptData).report as CycleReport;
		// Measured on the player's attacks: shown, not judged.
		expect(report.latency).toEqual({ ms: 70, provenance: 'player' });
		expect(first.measures.precision?.value).toBeCloseTo(0, 0);
		expect(first.success).toBe(true);
		controller.pause();
		await controller.replay();
		expect(takes.plays[0].latencyS).toBeCloseTo(0.07, 9);
		controller.quit();
	});

	it("takes the attack sensor's own latency over the note's", async () => {
		const { controller, attempts, player, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true,
			latency: { ms: 0, provenance: 'system' },
			latencies: { note: { ms: 70, provenance: 'system' } }
		});
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await attempts.listBySession('series');
		const report = (first.data as RhythmAttemptData).report as CycleReport;
		expect(report.latency).toEqual({ ms: 0, provenance: 'system' });
		expect(first.verdict.value).toEqual({ passed: false, reasons: ['precision'] });
		controller.quit();
	});
});

describe('PlanSessionController, hearing the last run again', () => {
	const SILENT_BAR_S = 3; // ♩ = 80 bpm

	it('replays the run from the breath with the click on every beat, the silent bars included, then counts in', async () => {
		const { controller, takes, sounds, clock, advance } = await setup(RHYTHM_SILENT_BARS, {
			met: true
		});
		await controller.start();
		// listen-in 0-1, count 2, entry 3-5, cycles 6-9, 10-13, 14-17, 18-21 (bars 6, 10, 14, 18
		// silent), the breath from bar 22
		await advance(ORIGIN + 22.3 * SILENT_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		const runFrom = ORIGIN + 3 * SILENT_BAR_S;
		const runTo = ORIGIN + 22 * SILENT_BAR_S;
		expect(takes.kept[0].method).toBe('keepFrom');
		expect(takes.kept[0].time).toBeCloseTo(runFrom, 9);
		const until = takes.kept.find((k) => k.method === 'keepUntil');
		expect(until?.time).toBeCloseTo(runTo, 9);
		await controller.replay();
		expect(takes.plays).toHaveLength(1);
		const [take] = takes.plays;
		expect(take.from).toBeCloseTo(runFrom, 9);
		expect(take.to).toBeCloseTo(runTo, 9);
		expect(take.latencyS).toBe(0);
		expect(take.whole).toBe(true);
		// Every beat of the 19 bars clicked, the accent on 1, the muted bars as the others.
		expect(take.sounds).toHaveLength(19 * 4);
		take.sounds.forEach((sound, i) => {
			expect(sound.time).toBeCloseTo(runFrom + i * 0.75, 9);
			expect(sound.sound).toBe(i % 4 === 0 ? 'click-accent' : 'click');
		});
		// Then on as after a pause: the listen-in and a counted bar, from now.
		expect(controller.view.status).toBe('count-in');
		expect(stageOf(controller).phase).toBe('listen-in');
		const resumedAt = clock.now() + ORIGIN;
		expect(sounds.emitted()[0].time).toBeCloseTo(resumedAt, 9);
		await advance(resumedAt + 2.1 * SILENT_BAR_S, false);
		expect(controller.view.countdown).toBe(4);
		controller.quit();
	});

	it('replays from the pause what was played, shifted by the calibrated latency', async () => {
		const { controller, takes, sounds, clock, advance } = await setup(RHYTHM_OFFBEATS, {
			met: true,
			latency: { ms: 30, provenance: 'system' }
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const runFrom = ORIGIN + 3 * OFFBEATS_BAR_S;
		const pausedAt = clock.now();
		const heard = sounds.emitted().filter((s) => s.time >= runFrom && s.time < pausedAt);
		controller.pause();
		expect(takes.kept.slice(-2)).toEqual([
			{ method: 'keepUntil', time: pausedAt },
			{ method: 'stopKeeping', time: null }
		]);
		await controller.replay();
		expect(takes.plays).toHaveLength(1);
		const [take] = takes.plays;
		expect(take.from).toBeCloseTo(runFrom, 9);
		expect(take.to).toBe(pausedAt);
		expect(take.latencyS).toBeCloseTo(0.03, 9);
		expect(take.whole).toBe(true);
		expect(heard.length).toBeGreaterThan(0);
		expect(take.sounds).toEqual(heard);
		expect(controller.view.status).toBe('count-in');
		controller.quit();
	});

	it('does nothing while a cycle is played, nor before a run was played', async () => {
		const { controller, takes, clock, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 1.6 * OFFBEATS_BAR_S);
		controller.pause();
		await controller.replay();
		expect(takes.plays).toEqual([]);
		expect(controller.view.status).toBe('paused');
		controller.resume();
		await settled();
		// A cycle of the run that follows the listen-in and the counted bar.
		await advance(clock.now() + 4.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		await controller.replay();
		expect(takes.plays).toEqual([]);
		expect(controller.view.status).toBe('awaiting');
		controller.quit();
	});

	it('stops the replay on resume, and counts in once', async () => {
		const { controller, takes, clock, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		controller.pause();
		takes.hold = true;
		let begins = 0;
		clock.settle = async () => {
			begins++;
		};
		const replaying = controller.replay();
		await settled();
		expect(takes.plays).toHaveLength(1);
		expect(controller.view.status).toBe('paused');
		controller.resume();
		expect(takes.stops).toBeGreaterThan(0);
		await replaying;
		await settled();
		expect(controller.view.status).toBe('count-in');
		expect(begins).toBe(1);
		controller.quit();
	});

	it('keeps the run playable through a pause in the last bar of its breath', async () => {
		const { controller, takes, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// cycles 3-6, the breath 7-8; the next run, at the same tempo, asks for bar 9 from bar 8
		await advance(ORIGIN + 8.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.pause();
		expect(takes.keeping).toBe(false);
		// The input goes on well past the start the next run had asked for.
		await advance(ORIGIN + 14 * OFFBEATS_BAR_S);
		await controller.replay();
		expect(takes.plays).toHaveLength(1);
		const [take] = takes.plays;
		expect(take.from).toBeCloseTo(ORIGIN + 3 * OFFBEATS_BAR_S, 9);
		expect(take.to).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
		expect(take.whole).toBe(true);
		controller.quit();
	});

	it('replays the same run again from a pause in the listen-in that follows a replay', async () => {
		const { controller, takes, clock, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 7.5 * OFFBEATS_BAR_S);
		await controller.replay();
		expect(controller.view.status).toBe('count-in');
		await settled();
		// Paused in the listen-in, then well past the start the resumed run had asked for.
		await advance(clock.now() + 1.5 * OFFBEATS_BAR_S, false);
		controller.pause();
		await advance(clock.now() + 6 * OFFBEATS_BAR_S, false);
		await controller.replay();
		expect(takes.plays).toHaveLength(2);
		const [first, second] = takes.plays;
		expect(second.from).toBe(first.from);
		expect(second.to).toBe(first.to);
		expect(second.whole).toBe(true);
		controller.quit();
	});

	it('forgets the takes of an earlier session when a series starts', async () => {
		const { controller, takes } = await setup(RHYTHM_OFFBEATS, { met: true });
		takes.keepFrom(-10);
		takes.hear(-5);
		expect(takes.spans).toHaveLength(1);
		await controller.start();
		expect(takes.spans).toEqual([]);
		controller.quit();
	});

	it('keeps no input once the series is quit, even with a start asked ahead', async () => {
		const { controller, takes, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 1.5 * OFFBEATS_BAR_S);
		controller.quit();
		expect(takes.keeping).toBe(false);
		await advance(ORIGIN + 10 * OFFBEATS_BAR_S, false);
		expect(takes.spans).toEqual([]);
	});

	it('does nothing when the run was cut before its first bar sounded', async () => {
		const { controller, takes, sounds, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		// Every wake-up 50 ms early: the run's first bar is entered before it sounds.
		const at = sounds.at.bind(sounds);
		sounds.at = (time, callback) => at(time - 0.05, callback);
		await controller.start();
		await advance(ORIGIN + 3 * OFFBEATS_BAR_S - 0.03, false);
		controller.pause();
		await controller.replay();
		expect(takes.plays).toEqual([]);
		expect(controller.view.status).toBe('paused');
		controller.quit();
	});

	it('stops the replay on quit', async () => {
		const { controller, takes, advance } = await setup(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		controller.pause();
		takes.hold = true;
		const replaying = controller.replay();
		await settled();
		controller.quit();
		await replaying;
		await settled();
		expect(takes.stops).toBeGreaterThan(0);
		expect(controller.view.status).toBe('finished');
	});
});

describe('PlanSessionController, before playing', () => {
	it('asks for headphones when the calibration heard the click', async () => {
		const { controller } = await setup(RHYTHM_OFFBEATS, { met: true, clickBleed: true });
		await controller.ready();
		expect(controller.view.audioError).toBe('bleed');
		expect(controller.view.briefing).toBeNull();
	});
});
