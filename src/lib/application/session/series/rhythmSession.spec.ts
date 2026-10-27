import { describe, expect, it } from 'vitest';
import { RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS, RHYTHM_TWO_FOUR } from '$lib/domain/exercise';
import { Fraction, compileCyclePlan, figureFromJson, type CycleReport } from '$lib/domain/time';
import type { CyclePlanRecord, RhythmAttemptData } from '../cycle/recordCycle';
import { SETTLE_AFTER_BARS } from '../cycle/compileCycle';
import {
	ORIGIN,
	barAttacks,
	counted,
	rhythmSeries,
	settled,
	stageOf
} from '$lib/testing/rhythmSeries';

/**
 * The rhythm's cycles on the response series (plan H6, Task 7): the behaviours of
 * `PlanSessionController.svelte.spec.ts` about cycles, their accompaniment and their attempts,
 * played again with the same expected values. Listening, the breath, the levels, the anti-blocking
 * and the replay of the rhythm are Task 8's.
 */

const OFFBEATS_BAR_S = 3; // ♩ = 80 bpm
const TWO_FOUR_BAR_S = 2.4; // ♩ = 100 bpm
const EPOCH = Date.UTC(2026, 0, 1);

/** Epoch ms of bar `bar` of a series that began at clock time 0. */
const epochOfBar = (bar: number, barS: number) => EPOCH + (ORIGIN + bar * barS) * 1000;

describe('the rhythm on the series, a run of offbeats played exactly', () => {
	it('records four passed cycles chained without a gap, each with its verdict and observations', async () => {
		const { controller, stored, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.ready();
		await controller.start();
		expect(controller.timeline.nowBeat()).toBeCloseTo(-ORIGIN / 0.75, 2);
		// listen-in bars 0-1, counted bar 2, cycles on bars 3 to 6
		// (checked a little past a beat: the bars and beats fall between two steps of the clock)
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		const attempts = await stored();
		expect(attempts).toHaveLength(4);
		// One after the other, with no gap: bars 3, 4, 5 and 6.
		expect(attempts.map((a) => a.promptedAt)).toEqual(
			[3, 4, 5, 6].map((bar) => epochOfBar(bar, OFFBEATS_BAR_S))
		);
		for (const attempt of attempts) {
			expect(attempt.success).toBe(true);
			expect(attempt.correct).toBeNull();
			expect(attempt.verdict.relation).toBe('cycle');
			expect(attempt.plan).not.toBeNull();
			expect(attempt.mechanic).toBe('rhythm-figure');
			expect(attempt.observations?.filter((o) => o.fate === 'answer')).toHaveLength(5);
		}
		// The run's cycles, as its breath will show them (Task 8).
		const model = stageOf(controller);
		expect(model.settled).toHaveLength(4);
		expect(model.settled.every((cycle) => cycle.verdict.passed)).toBe(true);
		expect(controller.view.stage?.view).toBe('rhythm-figure');
		controller.quit();
	});

	it('writes each cycle as a hot free attempt of its figure, with its resolved plan', async () => {
		const { controller, stored, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 5.6 * OFFBEATS_BAR_S);
		const [first, second] = await stored();
		expect(first).toMatchObject({
			sessionId: 'series',
			exerciseId: 'rhythm-offbeats',
			mechanic: 'rhythm-figure',
			cardKey: 'rhythm-figure:offbeats-1@0',
			phase: 'free',
			temperature: 'hot',
			// The cursor the level gives.
			aids: ['cursor'],
			tempoBpm: 80,
			leadBeats: null,
			reactionMs: null,
			correct: null,
			success: true,
			verdict: { relation: 'cycle', version: 1, value: { passed: true } }
		});
		expect(first.measures).toHaveProperty('fidelity');
		const plan = first.plan as CyclePlanRecord;
		expect(plan).toMatchObject({
			figureId: 'offbeats-1',
			cycleBars: 1,
			startBar: 0,
			accompaniment: { bars: ['on'] },
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			window: { ms: 80 },
			thresholds: { regularity: 80, holdOffset: 200, holdDrift: 100, precision: 60 }
		});
		expect(plan.startAudioS).toBeCloseTo(ORIGIN + 3 * OFFBEATS_BAR_S, 9);
		const data = first.data as RhythmAttemptData;
		expect(data.item).toEqual({ figureId: 'offbeats-1', level: 0 });
		expect(data.level).toBe(0);
		expect(data.report.expectations).toHaveLength(5);
		// The next cycle of the run, a bar further in the loops of the figure and the click.
		expect((second.plan as CyclePlanRecord).startBar).toBe(1);
		controller.quit();
	});
});

describe('the rhythm on the series, settling a cycle', () => {
	it(`stores a cycle ${SETTLE_AFTER_BARS} of a bar after it ends, with an attack reported late`, async () => {
		const { controller, stored, attacks, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		const bar = (n: number) => ORIGIN + n * OFFBEATS_BAR_S;
		// The first cycle, bar 3: every attack on time but its last, reported only once the
		// next cycle has begun.
		const [last, ...early] = barAttacks(
			RHYTHM_OFFBEATS.figures![0].figure,
			0,
			bar(3),
			OFFBEATS_BAR_S
		).reverse();
		for (const time of early.reverse()) {
			await advance(time, false);
			attacks.emit({ time, strength: 1 });
		}
		await advance(bar(4) + 0.1, false);
		expect(stageOf(controller).barInCycle).toBe(0);
		attacks.emit({ time: last, strength: 1 });
		// Its end is past, its settlement not yet.
		await advance(bar(4) + 0.2 * OFFBEATS_BAR_S, false);
		expect(await stored()).toHaveLength(0);
		await advance(bar(4) + 0.3 * OFFBEATS_BAR_S, false);
		const [first] = await stored();
		expect(first.success).toBe(true);
		expect(first.observations?.filter((o) => o.fate === 'answer')).toHaveLength(5);
		expect(clock.now()).toBeLessThan(bar(5));
		controller.quit();
	});
});

describe('the rhythm on the series, a pause', () => {
	it('drops the cycle under way, keeps the ones over, and opens the run again on resume', async () => {
		const { controller, stored, sounds, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		// cycle 3 settled at 4.25 bars; cycle 4 under way
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		controller.pause();
		expect(controller.view.status).toBe('paused');
		await advance(ORIGIN + 8 * OFFBEATS_BAR_S);
		expect(sounds.emitted()).toEqual([]);
		expect(await stored()).toHaveLength(1);
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

describe('the rhythm on the series, silent bars', () => {
	it('judges the 1 where the click comes back once, in the cycle of the silence', async () => {
		const { controller, stored, advance } = await rhythmSeries(RHYTHM_SILENT_BARS, { met: true });
		await controller.start();
		// listen-in 0-1, count 2, entry 3-5, cycles 6-9 and 10-13
		await advance(ORIGIN + 14.6 * OFFBEATS_BAR_S);
		const attempts = await stored();
		expect(attempts.length).toBeGreaterThanOrEqual(2);
		const wholeMs = OFFBEATS_BAR_S * 1000;
		// Every expectation of every stored plan, at its time.
		const expectations = attempts.flatMap((attempt) => {
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
				ms: attempt.promptedAt + e.at!.toNumber() * wholeMs,
				bar: e.bar,
				muted: compiled.mutedBars
			}));
		});
		// The click comes back on bar 7 (the silence is bar 6).
		const comeBack = epochOfBar(7, OFFBEATS_BAR_S);
		const there = expectations.filter((e) => Math.abs(e.ms - comeBack) < 1);
		expect(there).toHaveLength(1);
		expect(there[0].bar).toBe(1);
		expect(there[0].muted).toEqual([0]);
		// And no position anywhere is judged twice.
		const keys = expectations.map((e) => Math.round(e.ms));
		expect(new Set(keys).size).toBe(keys.length);
		expect(attempts.every((attempt) => attempt.success)).toBe(true);
		controller.quit();
	});

	it('mutes the click on the silent bars, and only there', async () => {
		const { controller, sounds, advance } = await rhythmSeries(RHYTHM_SILENT_BARS, { met: true });
		await controller.start();
		await advance(ORIGIN + 14.6 * OFFBEATS_BAR_S);
		const clickedBars = new Set(
			sounds.emitted().map((sound) => Math.floor((sound.time - ORIGIN) / OFFBEATS_BAR_S + 1e-9))
		);
		// The silence of each cycle: its first bar, 6 and 10.
		for (let bar = 0; bar < 14; bar++) {
			expect([bar, clickedBars.has(bar)]).toEqual([bar, bar !== 6 && bar !== 10]);
		}
		controller.quit();
	});

	it('shows the silence, with no cursor in it', async () => {
		const { controller, advance } = await rhythmSeries(RHYTHM_SILENT_BARS, { met: true });
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

	it('shows the entry before the first silence as the end of a cycle, played', async () => {
		const { controller, advance } = await rhythmSeries(RHYTHM_SILENT_BARS, { met: true });
		await controller.start();
		await advance(ORIGIN + 3.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller)).toMatchObject({
			phase: 'play',
			muted: false,
			barInCycle: 1,
			cycleBars: 4
		});
		expect(controller.view.status).toBe('awaiting');
		await advance(ORIGIN + 5.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).barInCycle).toBe(3);
		controller.quit();
	});
});

describe('the rhythm on the series, its screen', () => {
	it('shows the figure waiting, then the listen-in, the count and the cycles in the rhythm view', async () => {
		const { controller, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.ready();
		expect(controller.view.stage?.view).toBe('rhythm-figure');
		expect(stageOf(controller)).toMatchObject({
			phase: 'listen-in',
			exerciseLabel: 'Contretemps',
			level: { shown: 1, of: 4, aid: false },
			tempo: { bpm: 80, unit: '♩' },
			next: null,
			barInCycle: 0,
			cycleBars: 1,
			cursor: null,
			settled: [],
			listen: 'free',
			feedback: 'every-cycle'
		});
		expect(stageOf(controller).figure).toBe(RHYTHM_OFFBEATS.figures![0].figure);
		await controller.start();
		await advance(ORIGIN + 0.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('listen-in');
		expect(controller.view.status).toBe('count-in');
		expect(controller.view.countdown).toBeNull();
		await advance(ORIGIN + 2.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('count-in');
		expect(controller.view.countdown).toBe(3);
		await advance(ORIGIN + 3.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller)).toMatchObject({
			phase: 'play',
			barInCycle: 0,
			muted: false,
			cursor: Fraction.of(1, 4)
		});
		expect(controller.view.status).toBe('awaiting');
		await advance(ORIGIN + 4.3 * OFFBEATS_BAR_S);
		// The cycle just played, settled while the next one plays, shown with the run's marks.
		const model = stageOf(controller);
		expect(model.settled).toHaveLength(1);
		expect((model.settled[0].report as CycleReport).expectations).toHaveLength(5);
		controller.quit();
	});

	it('tells the how-to on the start screen, and starts without it', async () => {
		const { controller } = await rhythmSeries(RHYTHM_OFFBEATS);
		await controller.ready();
		expect(controller.view.briefing?.text).toBe(RHYTHM_OFFBEATS.howTo?.fr);
		await controller.start();
		expect(controller.view.briefing).toBeNull();
		expect(controller.view.status).toBe('count-in');
		controller.quit();
	});
});

describe('the rhythm on the series, a run with no counted bar', () => {
	it('plays right after the listen-in, at the start and after a pause, with no countdown', async () => {
		const { controller, sounds, clock, advance } = await rhythmSeries(RHYTHM_TWO_FOUR, {
			met: true
		});
		expect(RHYTHM_TWO_FOUR.params.countIn).toBe(false);
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

	it('counts a bar in after the listen-in when the exercise asks it', async () => {
		const { controller, stored, advance } = await rhythmSeries(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// listen-in 0-1, count 2, the line on bars 3 to 6, settled past 7
		await advance(ORIGIN + 7.5 * TWO_FOUR_BAR_S);
		const [line] = await stored();
		expect(line.promptedAt).toBe(epochOfBar(3, TWO_FOUR_BAR_S));
		expect(line).toMatchObject({ cardKey: 'rhythm-figure:line-1@0', success: true });
		controller.quit();
	});
});

describe('the rhythm on the series, the latency of its sensor', () => {
	/** Plays the first cycle of offbeats, pauses in the next one and hears the run again. */
	async function replayed(latencies: Parameters<typeof rhythmSeries>[1]) {
		const bench = await rhythmSeries(RHYTHM_OFFBEATS, { met: true, ...latencies });
		await bench.controller.start();
		await bench.advance(ORIGIN + 4.5 * OFFBEATS_BAR_S);
		bench.controller.pause();
		await bench.controller.replay?.();
		await settled();
		bench.controller.quit();
		await settled();
		return bench;
	}

	it('replays and remembers the run with the attack sensor’s latency, not the note’s', async () => {
		const { takes, memory } = await replayed({
			latency: { ms: 12, provenance: 'system' },
			latencies: { note: { ms: 30, provenance: 'system' } }
		});
		expect(takes.plays).toHaveLength(1);
		expect(takes.plays[0].latencyS).toBeCloseTo(0.012, 9);
		expect(memory.get('series')?.latencyS).toBeCloseTo(0.012, 9);
	});

	it('takes the note’s while the attack sensor has none of its own', async () => {
		const { takes, memory } = await replayed({
			latencies: { note: { ms: 30, provenance: 'system' } }
		});
		expect(takes.plays[0].latencyS).toBeCloseTo(0.03, 9);
		expect(memory.get('series')?.latencyS).toBeCloseTo(0.03, 9);
	});

	it('corrects the attacks by that latency', async () => {
		const { controller, player, stored, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true,
			latencies: { note: { ms: 30, provenance: 'player' } }
		});
		// Heard 30 ms late, as the calibration measured.
		player.offsetS = 0.03;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await stored();
		const report = (first.data as RhythmAttemptData).report;
		expect(report.latency).toEqual({ ms: 30, provenance: 'player' });
		expect(first.success).toBe(true);
		for (const { offsetMs } of report.expectations) expect(Math.abs(offsetMs!)).toBeLessThan(1);
		controller.quit();
	});
});
