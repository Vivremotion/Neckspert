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
import type { Attempt, SensorLatency } from '$lib/domain/types';
import {
	FakeAttackDetector,
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	FakeSoundScheduler,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { attackSensor } from '../sensors';
import type { PlanSessionDeps } from '../SessionDeps';
import { PlanSessionController, RHYTHM_SERIES_MS } from './PlanSessionController.svelte';
import type { CyclePlanRecord, RhythmAttemptData } from './recordCycle';
import type { RhythmStageModel } from './rhythmStage';

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

async function setup(
	exercise: ExerciseDefinition,
	options: { met?: boolean; latency?: SensorLatency; clickBleed?: boolean } = {}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const attacks = new FakeAttackDetector();
	const attempts = new InMemoryAttemptRepository();
	const levels = new InMemoryLevelStateRepository();
	const settings = new InMemorySettingsRepository();
	const sessions = new InMemorySessionRepository();
	if (options.met) await attempts.add(earlier(exercise.id));
	await settings.update({
		latency: options.latency ? { attack: options.latency } : {},
		clickBleed: options.clickBleed ?? false
	});
	let ids = 0;
	/** Wall time gone by beyond the audio clock: a series can be made to run out. */
	const wall = { extraMs: 0 };
	const deps: PlanSessionDeps = {
		clock,
		metronome: new FakeMetronome(clock),
		detector: new FakeNoteDetector(),
		cues: new FakeSoundCues(),
		attempts,
		cards: new InMemoryCardStateRepository(),
		sessions,
		progressions: new InMemoryProgressionRepository(),
		settings,
		now: () => clock.toEpochMs(clock.now()) + wall.extraMs,
		random: () => 0,
		newId: () => `s${++ids}`,
		mechanics: {},
		sensors: { attack: attackSensor(attacks) },
		sounds,
		levels
	};
	const controller = new PlanSessionController({ id: 'series', exerciseId: exercise.id }, deps);
	const player = new Player(controller, attacks, clock);

	/** Moves the clock to `to` seconds by small steps, the player playing along when it plays. */
	async function advance(to: number, playing = true): Promise<void> {
		while (clock.time < to - 1e-9) {
			clock.time = Math.min(to, (Math.floor(clock.time * STEPS_PER_S + 1e-6) + 1) / STEPS_PER_S);
			sounds.flush();
			if (playing) player.step();
		}
		await settled();
	}

	return { clock, sounds, attacks, attempts, levels, sessions, controller, player, advance, wall };
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
					...barAttacks(model.figure, bar - this.playFrom, ORIGIN + bar * barS, barS)
				);
			} else {
				this.playFrom = null;
			}
		}
		const due = this.queue.filter((t) => t <= this.clock.now());
		this.queue = this.queue.filter((t) => t > this.clock.now());
		for (const time of due) this.attacks.emit({ time: time + this.offsetS, strength: 1 });
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
});

describe('PlanSessionController, the end of a series', () => {
	it('ends with the run under way once the series has lasted its time', async () => {
		const { controller, attempts, sessions, sounds, advance, wall } = await setup(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		wall.extraMs = RHYTHM_SERIES_MS;
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		expect(controller.view.status).toBe('finished');
		// The four cycles of the run, and no breath after them.
		expect(await attempts.listBySession('series')).toHaveLength(4);
		const breathAt = ORIGIN + 7 * OFFBEATS_BAR_S;
		expect(sounds.emitted().filter((s) => s.time >= breathAt - 1e-9)).toEqual([]);
		expect((await sessions.get('series'))?.endedAt).not.toBeNull();
	});
});

describe('PlanSessionController, a level at another tempo', () => {
	it('changes the tempo at the breath, with a listen-in and a counted bar at the new one', async () => {
		const { controller, attempts, sounds, advance } = await setup(RHYTHM_TWO_FOUR, { met: true });
		await controller.start();
		// One cycle per run: cycles on bars 3, 9 and 15, each followed by a two-bar breath.
		await advance(ORIGIN + 20.3 * TWO_FOUR_BAR_S);
		const breath = stageOf(controller);
		expect(breath).toMatchObject({ phase: 'breath', announcement: 'level-up' });
		expect(breath.tempo).toEqual({ bpm: 120, unit: '♩' });
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
		const { controller, attempts, sounds, advance } = await setup(RHYTHM_TWO_FOUR, { met: true });
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
});

describe('PlanSessionController, before playing', () => {
	it('asks for headphones when the calibration heard the click', async () => {
		const { controller } = await setup(RHYTHM_OFFBEATS, { met: true, clickBleed: true });
		await controller.ready();
		expect(controller.view.audioError).toBe('bleed');
		expect(controller.view.briefing).toBeNull();
	});
});
