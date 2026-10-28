import { describe, expect, it, vi } from 'vitest';
import {
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	type ExerciseDefinition
} from '$lib/domain/exercise';
import { SESSION_MS, type Segment } from '$lib/domain/session';
import { Fraction, compileCyclePlan, figureFromJson, type CycleReport } from '$lib/domain/time';
import type { CyclePlanRecord, RhythmAttemptData } from '../cycle/recordCycle';
import { SETTLE_AFTER_BARS } from '../cycle/compileCycle';
import { PLAIN_WORDS_SESSIONS } from '../cycle/rhythmStage';
import { summarizeExercise } from '../cycle/exerciseSummary';
import type { SessionMemory } from '../sessionMemory';
import type { SessionController } from '../SessionController.svelte';
import {
	ORIGIN,
	barAttacks,
	counted,
	rhythmSeries,
	settled,
	stageOf
} from '$lib/testing/rhythmSeries';

/**
 * The rhythm's cycles on the session controller (plan H6, Tasks 7 and 8): every behaviour the
 * rhythm's own controller was specified by, played again with the same expected values: cycles,
 * their accompaniment and their attempts, the listen-in and its demonstration, listening, the
 * breath and its marks, the levels and their announcements, the anti-blocking, the replay, pause
 * and quit at every phase, the summary.
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
		// The breath, from bar 7, with the run's four cycles.
		const model = stageOf(controller);
		expect(model.phase).toBe('breath');
		expect(controller.view.status).toBe('awaiting');
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

	it('tells nothing on the start screen once the exercise was played', async () => {
		for (const exercise of [RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS, RHYTHM_TWO_FOUR]) {
			expect(exercise.flow?.briefing).toBe('first-encounter');
		}
		const { controller } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.ready();
		expect(controller.view.briefing).toBeNull();
		await controller.start();
		expect(controller.view.status).toBe('count-in');
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

describe('the rhythm on the series, a level reached on the run’s last cycle', () => {
	it('plays the next run at the new level, after the breath', async () => {
		const { controller, stored, levels, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		// The first cycle (bar 3) not played: the three after it pass, the last one of the run
		// (bar 6, settled at 7.25) reaching level 2.
		await advance(ORIGIN + 4 * OFFBEATS_BAR_S, false);
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		const state = await levels.get({ exerciseId: 'rhythm-offbeats', scope: '', item: '' });
		expect(state?.level).toBe(1);
		// The breath, bars 7 and 8; the next run from bar 9, its cycles of two bars.
		await advance(ORIGIN + 11.6 * OFFBEATS_BAR_S);
		const attempts = await stored();
		expect(attempts.map((a) => [a.cardKey, a.success])).toEqual([
			['rhythm-figure:offbeats-1@0', false],
			['rhythm-figure:offbeats-1@0', true],
			['rhythm-figure:offbeats-1@0', true],
			['rhythm-figure:offbeats-1@0', true],
			['rhythm-figure:offbeats-2@1', true]
		]);
		expect(attempts[4].promptedAt).toBe(epochOfBar(9, OFFBEATS_BAR_S));
		controller.quit();
	});

	it('changes the tempo at the breath, with a listen-in and a counted bar at the new one', async () => {
		const { controller, stored, sounds, advance } = await rhythmSeries(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// One cycle per run: cycles on bars 3, 9 and 15, each followed by a two-bar breath; the
		// third, the last of its run, reaches level 2.
		await advance(ORIGIN + 20.3 * TWO_FOUR_BAR_S);
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
		const attempts = await stored();
		expect(attempts).toHaveLength(4);
		expect(attempts.slice(0, 3).every((a) => a.tempoBpm === 100 && a.success)).toBe(true);
		expect(attempts[3]).toMatchObject({ tempoBpm: 120, cardKey: 'rhythm-figure:line-4@1' });
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

describe('the rhythm on the series, the breath sounds as the exercise', () => {
	/** The sounds whose time falls in bar `bar`, as [beat from 0, sound], bars of `barS` from `fromS`. */
	function soundsOfBar(
		sounds: { emitted(): readonly { time: number; sound: string }[] },
		bar: number,
		barS: number,
		fromS = ORIGIN
	): [number, string][] {
		const start = fromS + bar * barS;
		return sounds
			.emitted()
			.filter((s) => s.time >= start - 1e-9 && s.time < start + barS - 1e-9)
			.map((s) => [Math.round(((s.time - start) / barS) * 4), s.sound]);
	}

	/** The countdown shown just after each beat of bar `bar` (bars of `barS` from `fromS`). */
	async function countdownOver(
		controller: SessionController,
		advance: (to: number, playing?: boolean) => Promise<void>,
		bar: number,
		barS: number,
		fromS = ORIGIN
	): Promise<(number | null)[]> {
		const shown: (number | null)[] = [];
		for (let beat = 0; beat < 4; beat++) {
			await advance(fromS + (bar + beat / 4 + 0.05) * barS, false);
			shown.push(controller.view.countdown);
		}
		return shown;
	}

	it('clicks a two-four breath on 2 and 4', async () => {
		const { controller, sounds, advance } = await rhythmSeries(RHYTHM_TWO_FOUR, { met: true });
		await controller.start();
		// listen-in 0-1, the line on bars 2 to 5, the breath on bars 6 and 7, the next line from 8
		await advance(ORIGIN + 6.3 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		// The run's own clicks: on 2 and 4, as during the line.
		const run = soundsOfBar(sounds, 3, TWO_FOUR_BAR_S);
		expect(run).toEqual([
			[1, 'click'],
			[3, 'click']
		]);
		expect(soundsOfBar(sounds, 6, TWO_FOUR_BAR_S)).toEqual(run);
		// Its last bar: the same clicks, the count shown, not heard.
		expect(await countdownOver(controller, advance, 7, TWO_FOUR_BAR_S)).toEqual([4, 3, 2, 1]);
		expect(soundsOfBar(sounds, 7, TWO_FOUR_BAR_S)).toEqual(run);
		await advance(ORIGIN + 8.3 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.countdown).toBeNull();
		controller.quit();
	});

	it('clicks a silent-bars breath with its muted bars switched on', async () => {
		const { controller, sounds, advance } = await rhythmSeries(RHYTHM_SILENT_BARS, { met: true });
		await controller.start();
		// listen-in 0-1, count 2, entry 3-5, four cycles 6-21 (silent on 6, 10, 14, 18 and, in
		// the run's accompaniment, 22), the breath on bars 22 and 23
		await advance(ORIGIN + 22.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		const everyBeat: [number, string][] = [
			[0, 'click-accent'],
			[1, 'click'],
			[2, 'click'],
			[3, 'click']
		];
		expect(soundsOfBar(sounds, 22, OFFBEATS_BAR_S)).toEqual(everyBeat);
		// The last bar counted.
		expect(await countdownOver(controller, advance, 23, OFFBEATS_BAR_S)).toEqual([4, 3, 2, 1]);
		expect(soundsOfBar(sounds, 23, OFFBEATS_BAR_S)).toEqual(everyBeat);
		controller.quit();
	});
});

describe('the rhythm on the series, a new tempo told until play', () => {
	/** Bars of « Métronome sur 2 et 4 » at ♩ = 120, its level 2. */
	const NEW_BAR_S = 2;
	/** Its third line (bars 14-17) reaches level 2; the breath 18-19; ♩ = 120 from bar 20. */
	const changeAt = ORIGIN + 20 * TWO_FOUR_BAR_S;

	it('keeps the announcement of a new tempo until the new run plays', async () => {
		const { controller, advance } = await rhythmSeries(RHYTHM_TWO_FOUR, { met: true });
		await controller.start();
		await advance(ORIGIN + 18.6 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		const announced = { kind: 'level-up', level: 1, tempoBpm: 120 };
		expect(controller.view.announcement).toMatchObject(announced);
		// Through the rest of the breath and every beat of the listen-in at the new tempo.
		for (let at = 18.8 * TWO_FOUR_BAR_S; at < 20 * TWO_FOUR_BAR_S; at += 0.6) {
			await advance(ORIGIN + at, false);
			expect(controller.view.announcement).toMatchObject(announced);
		}
		for (let beat = 0; beat < 8; beat++) {
			await advance(changeAt + beat * (NEW_BAR_S / 4) + 0.05, false);
			expect(stageOf(controller).phase).toBe('listen-in');
			expect(controller.view.announcement).toMatchObject(announced);
		}
		// The first line of the new run opens: told no more.
		await advance(changeAt + 2 * NEW_BAR_S + 0.3, false);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.announcement).toBeNull();
		controller.quit();
	});

	it('keeps it through a pause in the breath or the listen-in, until the run plays', async () => {
		for (const [pausedAt, phase] of [
			[ORIGIN + 18.6 * TWO_FOUR_BAR_S, 'breath'],
			[changeAt + 0.3, 'listen-in']
		] as const) {
			const { controller, clock, advance } = await rhythmSeries(RHYTHM_TWO_FOUR, { met: true });
			await controller.start();
			await advance(pausedAt);
			expect(stageOf(controller).phase).toBe(phase);
			controller.pause();
			controller.resume();
			await settled();
			const resumedAt = clock.now() + ORIGIN;
			const announced = { kind: 'level-up', level: 1, tempoBpm: 120 };
			// listen-in 0-1 at ♩ = 120, the line from bar 2.
			for (let beat = 0; beat < 8; beat++) {
				await advance(resumedAt + beat * (NEW_BAR_S / 4) + 0.05, false);
				expect(controller.view.announcement).toMatchObject(announced);
			}
			await advance(resumedAt + 2 * NEW_BAR_S + 0.3, false);
			expect(stageOf(controller).phase).toBe('play');
			expect(controller.view.announcement).toBeNull();
			controller.quit();
		}
	});

	it('shows the countdown silently over the bar before a run without a counted bar', async () => {
		const { controller, sounds, advance } = await rhythmSeries(RHYTHM_TWO_FOUR, { met: true });
		await controller.start();
		// At the start: the second listen-in bar counts down, unheard.
		expect(await countdownOverBar(1, ORIGIN, TWO_FOUR_BAR_S)).toEqual([4, 3, 2, 1]);
		// After the tempo change: the first listen-in bar does not, the second does.
		await advance(changeAt - 0.3);
		expect(await countdownOverBar(0, changeAt, NEW_BAR_S)).toEqual([null, null, null, null]);
		expect(await countdownOverBar(1, changeAt, NEW_BAR_S)).toEqual([4, 3, 2, 1]);
		const clicks = (bar: number) =>
			sounds
				.emitted()
				.filter(
					(s) =>
						s.time >= changeAt + bar * NEW_BAR_S - 1e-9 &&
						s.time < changeAt + (bar + 1) * NEW_BAR_S - 1e-9
				)
				.map((s) => [Math.round((s.time - changeAt - bar * NEW_BAR_S) / (NEW_BAR_S / 4)), s.sound]);
		// Nothing beyond the accompaniment: the click on 2 and 4.
		for (const bar of [0, 1]) {
			expect(clicks(bar)).toEqual([
				[1, 'click'],
				[3, 'click']
			]);
		}
		await advance(changeAt + 2 * NEW_BAR_S + 0.3, false);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.countdown).toBeNull();
		controller.quit();

		async function countdownOverBar(bar: number, fromS: number, barS: number) {
			const shown: (number | null)[] = [];
			for (let beat = 0; beat < 4; beat++) {
				await advance(fromS + (bar + beat / 4 + 0.05) * barS);
				shown.push(controller.view.countdown);
			}
			return shown;
		}
	});
});

describe('the rhythm on the series, the latency of its sensor', () => {
	it('stores the latency applied to the onsets with the session, zero when none is calibrated', async () => {
		const plain = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await plain.controller.start();
		plain.controller.quit();
		await settled();
		expect((await plain.sessions.get('series'))?.latencyMs).toBe(0);

		const calibrated = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true,
			latency: { ms: 42, provenance: 'system' },
			latencies: { note: { ms: 30, provenance: 'system' } }
		});
		await calibrated.controller.start();
		calibrated.controller.quit();
		await settled();
		expect((await calibrated.sessions.get('series'))?.latencyMs).toBe(42);
	});

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

/** The `series` segment of the session the memory holds. */
function seriesOf(memory: SessionMemory, sessionId = 'series'): Segment {
	const playback = memory.get(sessionId);
	if (!playback) throw new Error('no session in memory');
	const series = playback.trace.children.find((segment) => segment.role === 'series');
	if (!series) throw new Error('no series in the trace');
	return series;
}

const roles = (segment: Segment) => segment.children.map((child) => child.role);

const runsOf = (memory: SessionMemory) =>
	seriesOf(memory).children.filter((segment) => segment.role === 'run');

/** The announcements the frame shows while the clock moves to `to`. */
async function watch(
	controller: SessionController,
	advance: (to: number) => Promise<void>,
	clock: { time: number },
	to: number
): Promise<Set<string>> {
	const seen = new Set<string>();
	while (clock.time < to - 1e-9) {
		await advance(Math.min(to, clock.time + 0.25));
		const kind = controller.view.announcement?.kind;
		if (kind) seen.add(kind);
	}
	return seen;
}

/** Offbeats from the aid level: its stored level. */
const AID_STATE = {
	exerciseId: RHYTHM_OFFBEATS.id,
	scope: '',
	item: '',
	level: -1,
	successes: 0,
	failures: 0,
	resumeAfter: null
};

describe('the rhythm on the series, the breath and the levels', () => {
	it('moves up a level after three passed cycles and says so at the breath', async () => {
		const { controller, levels, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		expect(stageOf(controller).level).toEqual({ shown: 1, of: 4, aid: false });
		await advance(ORIGIN + 6.6 * OFFBEATS_BAR_S);
		const state = await levels.get({ exerciseId: 'rhythm-offbeats', scope: '', item: '' });
		expect(state?.level).toBe(1);
		// The run goes on at its level: the change shows at the breath, with the figure to come.
		expect(controller.view.announcement).toBeNull();
		expect(stageOf(controller).level.shown).toBe(1);
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		const model = stageOf(controller);
		expect(model.phase).toBe('breath');
		expect(controller.view.announcement).toEqual({
			kind: 'level-up',
			level: 1,
			of: 4,
			tempoBpm: 80
		});
		expect(model.level.shown).toBe(2);
		expect(model.next?.bars).toBe(2);
		// The figure just played, with its marks.
		expect(model.figure.bars).toBe(1);
		expect(model.settled).toHaveLength(4);
		// The announcement goes with the next run's first cycle.
		await advance(ORIGIN + 9.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.announcement).toBeNull();
		controller.quit();
	});

	it('reports a level write that failed, plays on and goes on writing the level', async () => {
		const { controller, levels, stored, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		const put = levels.put.bind(levels);
		let calls = 0;
		const failure = new Error('disk full');
		levels.put = async (state) => {
			calls++;
			if (calls === 1) throw failure;
			return put(state);
		};
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await controller.start();
			await advance(ORIGIN + 6.6 * OFFBEATS_BAR_S);
			// Told, not swallowed.
			expect(errors).toHaveBeenCalledWith('[neckspert] level write failed', failure);
			expect(calls).toBeGreaterThan(1);
			const state = await levels.get({ exerciseId: 'rhythm-offbeats', scope: '', item: '' });
			expect(state?.level).toBe(1);
			// The series goes on: the breath reached, the run's four cycles stored.
			await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
			expect(stageOf(controller).phase).toBe('breath');
			expect(await stored()).toHaveLength(4);
		} finally {
			errors.mockRestore();
			controller.quit();
		}
	});

	it('shows the breath with its last bar counted, then the next run', async () => {
		const { controller, sounds, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 8.3 * OFFBEATS_BAR_S);
		// The first beat of each run is heard: laid before the run begins.
		for (const bar of [3, 9]) {
			const downbeat = ORIGIN + bar * OFFBEATS_BAR_S;
			expect(
				sounds
					.emitted()
					.some((s) => s.sound === 'click-accent' && Math.abs(s.time - downbeat) < 1e-9)
			).toBe(true);
		}
		expect(stageOf(controller).phase).toBe('breath');
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.countdown).toBe(3);
		await advance(ORIGIN + 9.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		expect(controller.view.countdown).toBeNull();
		controller.quit();
	});

	it('shows the breath of a run that moves to another tempo at its own, with no count', async () => {
		const { controller, advance } = await rhythmSeries(counted(RHYTHM_TWO_FOUR), { met: true });
		await controller.start();
		// One cycle per run: cycles on bars 3, 9 and 15, each followed by a two-bar breath.
		await advance(ORIGIN + 20.3 * TWO_FOUR_BAR_S);
		const breath = stageOf(controller);
		expect(breath.phase).toBe('breath');
		expect(controller.view.announcement?.kind).toBe('level-up');
		expect(controller.view.announcement?.tempoBpm).toBe(120);
		expect(breath.tempo).toEqual({ bpm: 120, unit: '♩' });
		// The frame keeps the tempo the run was played at: the view scales its marks by it.
		expect(controller.view.tempoBpm).toBe(100);
		// The breath's last bar does not count down: a listen-in at the new tempo comes first.
		expect(controller.view.countdown).toBeNull();
		await advance(ORIGIN + 21.3 * TWO_FOUR_BAR_S);
		expect(controller.view.tempoBpm).toBe(120);
		controller.quit();
	});

	it('resumes a pause in the breath with the runs of the level reached', async () => {
		// Level 2 plays runs of two cycles.
		const exercise: ExerciseDefinition = {
			...RHYTHM_OFFBEATS,
			levels: RHYTHM_OFFBEATS.levels?.map((level, i) =>
				i === 2 ? { ...level, params: { ...level.params, 'pacing.roundsPerBreath': 2 } } : level
			)
		};
		const { controller, stored, clock, advance } = await rhythmSeries(exercise, { met: true });
		await controller.start();
		await advance(ORIGIN + 7.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.pause();
		controller.resume();
		await settled();
		const resumedAt = clock.now() + ORIGIN;
		// listen-in 0-1, count 2, two cycles of two bars 3-6, the breath from 7.
		await advance(resumedAt + 7.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		const attempts = await stored();
		expect(attempts.map((a) => a.cardKey)).toEqual([
			...Array(4).fill('rhythm-figure:offbeats-1@0'),
			'rhythm-figure:offbeats-2@1',
			'rhythm-figure:offbeats-2@1'
		]);
		controller.quit();
	});
});

describe('the rhythm on the series, a first encounter', () => {
	it('tells the how-to and plays the figure as a demonstration over a longer listen-in', async () => {
		const { controller, sounds, advance } = await rhythmSeries(RHYTHM_OFFBEATS);
		await controller.ready();
		expect(controller.view.briefing?.text).toBe(RHYTHM_OFFBEATS.howTo?.fr);
		await controller.start();
		expect(controller.view.briefing).toBeNull();
		const demo = sounds.emitted().filter((s) => s.sound === 'demo');
		// One bar of demonstration after the two listen-in bars, before the counted bar.
		expect(demo).toHaveLength(5);
		expect(demo[0].time).toBeCloseTo(ORIGIN + 2 * OFFBEATS_BAR_S, 9);
		await advance(ORIGIN + 2.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('listening');
		await advance(ORIGIN + 3.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('count-in');
		expect(controller.view.countdown).toBe(3);
		controller.quit();
	});

	it('demonstrates the figure once: not again after a pause', async () => {
		const { controller, sounds, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS);
		await controller.start();
		await advance(ORIGIN + 1.5 * OFFBEATS_BAR_S, false);
		controller.pause();
		controller.resume();
		await settled();
		const resumedAt = clock.now();
		await advance(resumedAt + 4 * OFFBEATS_BAR_S, false);
		expect(sounds.emitted().filter((s) => s.sound === 'demo' && s.time >= resumedAt)).toEqual([]);
		controller.quit();
	});

	it('asks for headphones when the calibration heard the click, the how-to still told', async () => {
		const met = await rhythmSeries(RHYTHM_OFFBEATS, { met: true, clickBleed: true });
		await met.controller.ready();
		expect(met.controller.view.audioError).toBe('bleed');
		expect(met.controller.view.briefing).toBeNull();
		const first = await rhythmSeries(RHYTHM_OFFBEATS, { clickBleed: true });
		await first.controller.ready();
		expect(first.controller.view.audioError).toBe('bleed');
		expect(first.controller.view.briefing?.text).toBe(RHYTHM_OFFBEATS.howTo?.fr);
		// Not refused: the series starts.
		await first.controller.start();
		expect(first.controller.view.status).toBe('count-in');
		first.controller.quit();
	});
});

describe('the rhythm on the series, plain words', () => {
	async function plainWordsAfter(ended: number): Promise<boolean> {
		const { controller, sessions } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
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

describe('the rhythm on the series, listening to the figure', () => {
	it('turns the next cycle into one heard, then marks the cycle after it as helped', async () => {
		const { controller, stored, sounds, memory, advance } = await rhythmSeries(
			counted(RHYTHM_TWO_FOUR),
			{ met: true }
		);
		await controller.start();
		// listen-in 0-1, count 2, cycle 3-6, breath 7-8, then the cycle asked for is heard: 9-12
		await advance(ORIGIN + 3.6 * TWO_FOUR_BAR_S);
		controller.listen?.();
		await advance(ORIGIN + 10.1 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('listening');
		expect(controller.view.status).toBe('awaiting');
		const demo = sounds
			.emitted()
			.filter((s) => s.sound === 'demo')
			.map((s) => s.time);
		expect(demo.length).toBeGreaterThan(0);
		expect(Math.min(...demo)).toBeCloseTo(ORIGIN + 9 * TWO_FOUR_BAR_S, 9);
		// the played cycle 13-16, settled during the breath that follows
		await advance(ORIGIN + 17.6 * TWO_FOUR_BAR_S);
		const attempts = await stored();
		expect(attempts).toHaveLength(2);
		expect(attempts.map((a) => a.promptedAt)).toEqual([
			epochOfBar(3, TWO_FOUR_BAR_S),
			epochOfBar(13, TWO_FOUR_BAR_S)
		]);
		expect(attempts[0].aids).not.toContain('listen');
		expect(attempts[1].aids).toContain('listen');
		expect(attempts.every((a) => a.success)).toBe(true);
		controller.quit();
		await settled();
		// The heard cycle opens the second run, before its round.
		expect(roles(runsOf(memory)[1])).toEqual(['listen', 'round']);
	});

	it('does nothing where the level gives no listening, nor before play', async () => {
		const exercise: ExerciseDefinition = {
			...RHYTHM_OFFBEATS,
			params: { ...RHYTHM_OFFBEATS.params, listen: 'none' }
		};
		const { controller, stored, advance } = await rhythmSeries(exercise, { met: true });
		controller.listen?.();
		await controller.start();
		await advance(ORIGIN + 3.6 * OFFBEATS_BAR_S);
		controller.listen?.();
		await advance(ORIGIN + 6.6 * OFFBEATS_BAR_S);
		expect(await stored()).toHaveLength(3);
		controller.quit();
	});
});

describe('the rhythm on the series, the anti-blocking', () => {
	it('a reading block is heard, then played along, both announced', async () => {
		const { controller, memory, sounds, stored, player, clock, advance } = await rhythmSeries(
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
		const runs = runsOf(memory);
		expect(roles(runs[1]).slice(0, 2)).toEqual(['listen', 'round']);
		const along = (await stored()).find((a) => a.id === runs[1].children[1].attemptId);
		expect(along?.aids).toContain('play-along');
		const alongFrom = runs[1].children[1].startS;
		expect(
			emitted.some((s) => s.sound === 'play-along' && Math.abs(s.time - alongFrom) < 0.6)
		).toBe(true);
	});

	it('keeps the remedies of a reading block through a pause, and plays them on resume', async () => {
		const { controller, memory, stored, player, clock, advance } = await rhythmSeries(
			RHYTHM_OFFBEATS,
			{ met: true }
		);
		player.skip = 3;
		await controller.start();
		// cycles 3, 4, 5 fail: the third settles a quarter into bar 6, the remedies queued; pause
		// in the cycle of bar 6.
		await advance(ORIGIN + 6.5 * OFFBEATS_BAR_S);
		controller.pause();
		controller.resume();
		await settled();
		const resumedAt = clock.now();
		// listen-in 0-1, count 2, the listen on bar 3, the cycle played along on bar 4
		const seen = await watch(controller, advance, clock, resumedAt + ORIGIN + 5.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect(seen.has('listen-remedy')).toBe(true);
		expect(seen.has('play-along')).toBe(true);
		const resumed = runsOf(memory).at(-1) as Segment;
		expect(roles(resumed).slice(0, 2)).toEqual(['listen', 'round']);
		const along = (await stored()).find((a) => a.id === resumed.children[1].attemptId);
		expect(along?.aids).toContain('play-along');
	});

	it('an execution block takes the aid level at the breath', async () => {
		const { controller, memory, stored, player, clock, advance } = await rhythmSeries(
			RHYTHM_OFFBEATS,
			{ met: true }
		);
		player.jitterS = 0.1;
		await controller.start();
		// the aid level is at ♩ = 70 bpm: a listen-in and a counted bar after the breath
		const seen = await watch(controller, advance, clock, ORIGIN + 16 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect(seen.has('aid-level')).toBe(true);
		expect(seen.has('level-down')).toBe(false);
		const runs = runsOf(memory);
		expect(runs[1].level).toBe(-1);
		const first = (await stored()).find((a) => a.id === runs[1].children[0].attemptId);
		expect(first?.aids).toContain('aid-level');
	});

	it('announces a deeper aid level as an aid level', async () => {
		// Two aid levels below level 1.
		const exercise: ExerciseDefinition = {
			...RHYTHM_OFFBEATS,
			levels: [{ aid: true, params: { tempo: 60 } }, ...(RHYTHM_OFFBEATS.levels ?? [])]
		};
		const { controller, levels, player, clock, advance } = await rhythmSeries(exercise, {
			met: true
		});
		await levels.put(AID_STATE);
		player.jitterS = 0.1;
		await controller.start();
		// ♩ = 70 bpm: run 1 on bars 3-6 blocks, the breath 7-8, at ♩ = 60 after it
		const seen = await watch(controller, advance, clock, ORIGIN + 9 * (60 / 70) * 4);
		controller.quit();
		await settled();
		expect((await levels.get({ exerciseId: exercise.id, scope: '', item: '' }))?.level).toBe(-2);
		expect([...seen]).toEqual(['aid-level']);
	});

	it('a change of air never plays the cycle laid out ahead', async () => {
		// Eight cycles a run: the third failure settles while the fourth plays.
		const long: ExerciseDefinition = {
			...RHYTHM_OFFBEATS,
			params: {
				...RHYTHM_OFFBEATS.params,
				pacing: { ...(RHYTHM_OFFBEATS.params.pacing as object), roundsPerBreath: 8 }
			}
		};
		const { controller, memory, stored, levels, player, advance } = await rhythmSeries(long, {
			met: true
		});
		await levels.put(AID_STATE);
		player.jitterS = 0.1;
		await controller.start();
		const barS = (60 / 70) * 4;
		await advance(ORIGIN + 12 * barS);
		expect(controller.view.status).toBe('finished');
		await settled();
		// cycles on bars 3, 4, 5 fail; the third settles a quarter into bar 6, under way: judged;
		// bar 7 is never played.
		expect(await stored()).toHaveLength(4);
		const series = seriesOf(memory);
		expect(series.reason).toBe('change-of-air');
		const [run] = runsOf(memory);
		expect(run).toMatchObject({ ended: 'done' });
		expect(run.children).toHaveLength(4);
		expect(run.endS).toBeCloseTo(ORIGIN + 7 * barS, 9);
	});

	it('the lowest aid level that blocks changes the air, and the exercise rests', async () => {
		const { controller, memory, stored, levels, player, advance, clock } = await rhythmSeries(
			RHYTHM_OFFBEATS,
			{ met: true }
		);
		await levels.put(AID_STATE);
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
		expect(await stored()).toHaveLength(4);
		const state = await levels.get({ exerciseId: RHYTHM_OFFBEATS.id, scope: '', item: '' });
		expect(state?.resumeAfter).toBeGreaterThan(clock.toEpochMs(0));
		expect(state?.failures).toBe(0);
		expect(controller.view.announcement?.kind).toBe('change-of-air');
		// Played again: the new series does not say it.
		await controller.start();
		expect(controller.view.status).toBe('count-in');
		expect(controller.view.announcement).toBeNull();
		controller.quit();
	});
});

describe('the rhythm on the series, pausing in « Métronome sur 2 et 4 »', () => {
	/** The lines of the cycles stored, in order. */
	async function lines(stored: () => Promise<{ data: unknown }[]>): Promise<string[]> {
		return (await stored()).map((attempt) => (attempt.data as RhythmAttemptData).item.figureId);
	}

	/** Resumes, then lets two cycles be played (unanswered) from the run that follows. */
	async function resumeForTwoCycles(
		controller: SessionController,
		clock: { now(): number },
		advance: (to: number, playing?: boolean) => Promise<void>
	): Promise<void> {
		controller.resume();
		await settled();
		// listen-in 0-1, count 2, cycle 3-6, breath 7-8, cycle 9-12, settled past 13
		await advance(clock.now() + ORIGIN + 13.5 * TWO_FOUR_BAR_S, false);
	}

	it('plays again the line it was reading when paused during its cycle', async () => {
		const { controller, stored, clock, advance } = await rhythmSeries(RHYTHM_TWO_FOUR, {
			met: true
		});
		await controller.start();
		// The first line's cycle, bars 2 to 5, under way.
		await advance(ORIGIN + 3.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		controller.pause();
		expect(await lines(stored)).toEqual([]);
		await resumeForTwoCycles(controller, clock, advance);
		expect(await lines(stored)).toEqual(['line-1', 'line-2']);
		controller.quit();
	});

	it('plays the line laid out ahead when paused just before its cycle', async () => {
		const { controller, stored, clock, advance } = await rhythmSeries(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// The counted bar: the first cycle, on bar 3, is placed already.
		await advance(ORIGIN + 2.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('count-in');
		controller.pause();
		await resumeForTwoCycles(controller, clock, advance);
		expect(await lines(stored)).toEqual(['line-1', 'line-2']);
		controller.quit();
	});

	it('goes on to the next line after a cycle played to its end', async () => {
		const { controller, stored, clock, advance } = await rhythmSeries(counted(RHYTHM_TWO_FOUR), {
			met: true
		});
		await controller.start();
		// The first line settled; the breath, bars 7 and 8.
		await advance(ORIGIN + 7.5 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.pause();
		await resumeForTwoCycles(controller, clock, advance);
		expect(await lines(stored)).toEqual(['line-1', 'line-2', 'line-3']);
		controller.quit();
	});

	it('plays again the cycle cut by a pause after the next one was decided', async () => {
		// Runs of two lines, chained: the second is decided a beat before the first ends.
		const exercise: ExerciseDefinition = {
			...counted(RHYTHM_TWO_FOUR),
			params: {
				...counted(RHYTHM_TWO_FOUR).params,
				pacing: { ...(RHYTHM_TWO_FOUR.params.pacing as object), roundsPerBreath: 2 }
			}
		};
		const { controller, stored, clock, advance } = await rhythmSeries(exercise, { met: true });
		await controller.start();
		// The first line on bars 3-6, the second decided on beat 4 of bar 6.
		await advance(ORIGIN + 6.9 * TWO_FOUR_BAR_S, false);
		controller.pause();
		controller.resume();
		await settled();
		// listen-in 0-1, count 2, the two lines on 3-6 and 7-10, settled past 11
		await advance(clock.now() + ORIGIN + 11.5 * TWO_FOUR_BAR_S, false);
		expect(await lines(stored)).toEqual(['line-1', 'line-2']);
		controller.quit();
	});
});

describe('the rhythm on the series, another series', () => {
	it('starts a new series under a new id once the last one finished', async () => {
		const { controller, sessions, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 1.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		await controller.start();
		expect(controller.sessionId).toBe('s1');
		expect(controller.view.status).toBe('count-in');
		expect(controller.view.announcement).toBeNull();
		expect(await sessions.get('s1')).toMatchObject({
			kind: 'exercise',
			exerciseId: 'rhythm-offbeats',
			endedAt: null
		});
		controller.quit();
	});

	it('keeps on its own session the level held when the series ended, whatever a later one does', async () => {
		const { controller, sessions, levels, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect((await sessions.get('series'))?.levelReached).toBe(1);
		// Later the stored level moves on: the first session's own record does not.
		await levels.put({ ...AID_STATE, level: 3 });
		expect((await sessions.get('series'))?.levelReached).toBe(1);
	});

	it('sums the session up with the level it reached', async () => {
		const { controller, sessions, stored, levels, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const record = await sessions.get('series');
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: await stored(),
			levelReached: record?.levelReached,
			state: await levels.get({ exerciseId: RHYTHM_OFFBEATS.id, scope: '', item: '' })
		});
		expect(summary).toMatchObject({
			exerciseId: RHYTHM_OFFBEATS.id,
			levelReached: { shown: 2, of: 4, aid: false },
			cycles: 4,
			successes: 4,
			aided: 0
		});
	});

	it('keeps the level reached when the series ends in the middle of a run', async () => {
		const { controller, sessions, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// Level 2 reached on the third cycle, the run still at level 1.
		await advance(ORIGIN + 6.6 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect((await sessions.get('series'))?.levelReached).toBe(1);
	});

	it('writes no session for a second series whose input never opened', async () => {
		const { controller, sessions, detector, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
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
		const { controller, attempts, sessions, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
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

describe('the rhythm on the series, its end', () => {
	it('ends with the run under way once the series has lasted its time', async () => {
		const { controller, stored, sessions, sounds, clock, advance } = await rhythmSeries(
			RHYTHM_OFFBEATS,
			{ met: true }
		);
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		clock.epochAtZero += SESSION_MS;
		await advance(ORIGIN + 7.6 * OFFBEATS_BAR_S);
		expect(controller.view.status).toBe('finished');
		// The four cycles of the run, and no breath after them.
		expect(await stored()).toHaveLength(4);
		const breathAt = ORIGIN + 7 * OFFBEATS_BAR_S;
		expect(sounds.emitted().filter((s) => s.time >= breathAt - 1e-9)).toEqual([]);
		expect((await sessions.get('series'))?.endedAt).not.toBeNull();
	});
});

describe('the rhythm on the series, its trace', () => {
	it('traces a series as it is played', async () => {
		const { controller, memory, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// listen-in 0-1, count 2, cycles 3-6, breath from 7
		await advance(ORIGIN + 8.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const series = seriesOf(memory);
		expect(roles(series).slice(0, 4)).toEqual(['listen-in', 'count-in', 'run', 'breath']);
		const [listenIn, count, run, breath] = series.children;
		expect(listenIn.startS).toBeCloseTo(ORIGIN, 9);
		expect(count.startS).toBeCloseTo(ORIGIN + 2 * OFFBEATS_BAR_S, 9);
		expect(run).toMatchObject({ exerciseId: RHYTHM_OFFBEATS.id, level: 0, ended: 'done' });
		expect(run.startS).toBeCloseTo(ORIGIN + 3 * OFFBEATS_BAR_S, 9);
		expect(run.endS).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
		expect(roles(run)).toEqual(['round', 'round', 'round', 'round']);
		expect(run.children.every((round) => typeof round.attemptId === 'number')).toBe(true);
		expect(run.children[1].startS).toBeCloseTo(ORIGIN + 4 * OFFBEATS_BAR_S, 9);
		expect(breath.startS).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
	});

	it('a pause cuts the run and its round', async () => {
		const { controller, memory, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
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
		const [run] = runsOf(memory);
		expect(run).toMatchObject({ ended: 'interrupted' });
		expect(run.endS).toBeCloseTo(pausedAt, 9);
		expect(run.children.at(-1)).toMatchObject({ role: 'round', ended: 'interrupted' });
		expect(run.children.at(-1)?.endS).toBeCloseTo(pausedAt, 9);
		const after = roles(series).slice(roles(series).indexOf('pause'));
		expect(after.slice(0, 4)).toEqual(['pause', 'listen-in', 'count-in', 'run']);
	});

	it('a heard cycle is a listen segment, with no attempt', async () => {
		const { controller, memory, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 3.5 * OFFBEATS_BAR_S);
		controller.listen?.();
		await advance(ORIGIN + 6.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const [run] = runsOf(memory);
		const listen = run.children.find((segment) => segment.role === 'listen');
		expect(listen).toBeDefined();
		expect(listen?.attemptId).toBeUndefined();
	});

	it('each run keeps its take', async () => {
		const { controller, memory, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// two runs with their breaths
		await advance(ORIGIN + 17.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		const playback = memory.get('series');
		const runs = runsOf(memory);
		expect(runs.length).toBeGreaterThanOrEqual(2);
		for (const run of runs.slice(0, 2)) {
			const take = playback?.takes.get(run.id);
			expect(take?.from).toBeCloseTo(run.startS, 9);
			expect(take?.to).toBeCloseTo(run.endS, 9);
		}
	});

	it('the series ends after SESSION_MS with its run, for its time', async () => {
		const { controller, memory, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		clock.epochAtZero += SESSION_MS;
		await advance(ORIGIN + 8 * OFFBEATS_BAR_S);
		expect(controller.view.status).toBe('finished');
		await settled();
		expect(seriesOf(memory).reason).toBe('time');
		const [run] = runsOf(memory);
		expect(run).toMatchObject({ ended: 'done' });
		expect(run.endS).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
	});

	it('a pause once the end is decided ends the series, it does not bring it back', async () => {
		const { controller, memory, stored, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		clock.epochAtZero += SESSION_MS;
		// The end is decided on beat 4 of bar 6 (bar 7 would be the breath); pause after it.
		await advance(ORIGIN + 6.8 * OFFBEATS_BAR_S);
		controller.pause();
		await settled();
		expect(controller.view.status).toBe('finished');
		controller.resume();
		await advance(ORIGIN + 14 * OFFBEATS_BAR_S, false);
		expect(controller.view.status).toBe('finished');
		expect(seriesOf(memory).reason).toBe('time');
		expect(await stored()).toHaveLength(3);
		// Cut by the pause, before the bar it was to end on.
		const [run] = runsOf(memory);
		expect(run.ended).toBe('interrupted');
		expect(run.endS).toBeLessThan(ORIGIN + 7 * OFFBEATS_BAR_S);
	});

	it('quit marks the series', async () => {
		const { controller, memory, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 4.5 * OFFBEATS_BAR_S);
		controller.quit();
		await settled();
		expect(seriesOf(memory).reason).toBe('quit');
	});
});

describe('the rhythm on the series, quitting', () => {
	it('stops every sound when quit during the counted bar, with nothing recorded', async () => {
		const { controller, sounds, stored, sessions, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
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
		expect(await stored()).toEqual([]);
		expect(controller.view.status).toBe('finished');
		const record = await sessions.get('series');
		expect(record).toMatchObject({ kind: 'exercise', exerciseId: 'rhythm-offbeats' });
		expect(record?.endedAt).not.toBeNull();
	});

	it('stops every sound when quit during a breath, every attempt with its verdict', async () => {
		const { controller, sounds, stored, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 7.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.quit();
		await settled();
		const heard = sounds.emitted().length;
		await advance(ORIGIN + 14.1 * OFFBEATS_BAR_S);
		expect(sounds.emitted()).toHaveLength(heard);
		const attempts = await stored();
		expect(attempts).toHaveLength(4);
		expect(attempts.every((a) => a.verdict.relation === 'cycle')).toBe(true);
	});

	it('stops every sound when quit during a heard cycle', async () => {
		const { controller, sounds, stored, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 3.5 * OFFBEATS_BAR_S);
		controller.listen?.();
		await advance(ORIGIN + 4.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('listening');
		controller.quit();
		await settled();
		const heard = sounds.emitted().length;
		await advance(ORIGIN + 10 * OFFBEATS_BAR_S);
		expect(sounds.emitted()).toHaveLength(heard);
		expect(await stored()).toHaveLength(1);
		expect(controller.view.status).toBe('finished');
	});

	it('is silent when quit while the audio output warms up', async () => {
		const { controller, sounds, clock } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
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

describe('the rhythm on the series, a latency', () => {
	it('plays without a calibrated latency, and precision then judges nothing', async () => {
		const { controller, stored, player, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await stored();
		const report = (first.data as RhythmAttemptData).report as CycleReport;
		expect(report.latency).toBeNull();
		expect(first.measures.precision?.value).toBeCloseTo(70, 0);
		expect(first.success).toBe(true);
		controller.quit();
	});

	it('lets precision judge with a latency measured without the player', async () => {
		const { controller, stored, player, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true,
			latency: { ms: 0, provenance: 'system' }
		});
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await stored();
		expect(first.success).toBe(false);
		expect(first.verdict.value).toEqual({ passed: false, reasons: ['precision'] });
		controller.quit();
	});

	it("takes the attack sensor's own latency over the note's", async () => {
		const { controller, stored, player, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true,
			latency: { ms: 0, provenance: 'system' },
			latencies: { note: { ms: 70, provenance: 'system' } }
		});
		player.offsetS = 0.07;
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		const [first] = await stored();
		const report = (first.data as RhythmAttemptData).report as CycleReport;
		expect(report.latency).toEqual({ ms: 0, provenance: 'system' });
		expect(first.verdict.value).toEqual({ passed: false, reasons: ['precision'] });
		controller.quit();
	});
});

describe('the rhythm on the series, hearing the last run again', () => {
	it('replays the run from the breath with the click on every beat, the silent bars included, then counts in', async () => {
		const { controller, takes, sounds, clock, advance } = await rhythmSeries(RHYTHM_SILENT_BARS, {
			met: true
		});
		await controller.start();
		// listen-in 0-1, count 2, entry 3-5, cycles 6-9, 10-13, 14-17, 18-21 (bars 6, 10, 14, 18
		// silent), the breath from bar 22
		await advance(ORIGIN + 22.3 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		const runFrom = ORIGIN + 3 * OFFBEATS_BAR_S;
		const runTo = ORIGIN + 22 * OFFBEATS_BAR_S;
		expect(takes.kept[0].method).toBe('keepFrom');
		expect(takes.kept[0].time).toBeCloseTo(runFrom, 9);
		const until = takes.kept.find((k) => k.method === 'keepUntil');
		expect(until?.time).toBeCloseTo(runTo, 9);
		await controller.replay?.();
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
		await advance(resumedAt + 2.1 * OFFBEATS_BAR_S, false);
		expect(controller.view.countdown).toBe(4);
		controller.quit();
	});

	it('replays from the pause what was played, shifted by the calibrated latency', async () => {
		const { controller, takes, sounds, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
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
		await controller.replay?.();
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
		const { controller, takes, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 1.6 * OFFBEATS_BAR_S);
		controller.pause();
		await controller.replay?.();
		expect(takes.plays).toEqual([]);
		expect(controller.view.status).toBe('paused');
		controller.resume();
		await settled();
		// A cycle of the run that follows the listen-in and the counted bar.
		await advance(clock.now() + 4.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('play');
		await controller.replay?.();
		expect(takes.plays).toEqual([]);
		expect(controller.view.status).toBe('awaiting');
		controller.quit();
	});

	it('stops the replay on resume, and counts in once', async () => {
		const { controller, takes, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		controller.pause();
		takes.hold = true;
		let begins = 0;
		clock.settle = async () => {
			begins++;
		};
		const replaying = controller.replay?.();
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
		const { controller, takes, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		// cycles 3-6, the breath 7-8; the next run, at the same tempo, asks for bar 9 from bar 8
		await advance(ORIGIN + 8.5 * OFFBEATS_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		controller.pause();
		expect(takes.keeping).toBe(false);
		// The input goes on well past the start the next run had asked for.
		await advance(ORIGIN + 14 * OFFBEATS_BAR_S);
		await controller.replay?.();
		expect(takes.plays).toHaveLength(1);
		const [take] = takes.plays;
		expect(take.from).toBeCloseTo(ORIGIN + 3 * OFFBEATS_BAR_S, 9);
		expect(take.to).toBeCloseTo(ORIGIN + 7 * OFFBEATS_BAR_S, 9);
		expect(take.whole).toBe(true);
		controller.quit();
	});

	it('replays the same run again from a pause in the listen-in that follows a replay', async () => {
		const { controller, takes, clock, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		await controller.start();
		await advance(ORIGIN + 7.5 * OFFBEATS_BAR_S);
		await controller.replay?.();
		expect(controller.view.status).toBe('count-in');
		await settled();
		// Paused in the listen-in, then well past the start the resumed run had asked for.
		await advance(clock.now() + 1.5 * OFFBEATS_BAR_S, false);
		controller.pause();
		await advance(clock.now() + 6 * OFFBEATS_BAR_S, false);
		await controller.replay?.();
		expect(takes.plays).toHaveLength(2);
		const [first, second] = takes.plays;
		expect(second.from).toBe(first.from);
		expect(second.to).toBe(first.to);
		expect(second.whole).toBe(true);
		controller.quit();
	});

	it('replays the last run at its tempo, then counts the next run at the new one', async () => {
		const { controller, takes, sounds, stored, clock, advance } = await rhythmSeries(
			counted(RHYTHM_TWO_FOUR),
			{ met: true }
		);
		await controller.start();
		// One cycle per run: cycles on bars 3, 9 and 15; the third reaches level 2, at ♩ = 120,
		// and its breath (19-20) tells it.
		await advance(ORIGIN + 20.3 * TWO_FOUR_BAR_S);
		expect(stageOf(controller).phase).toBe('breath');
		await controller.replay?.();
		const [take] = takes.plays;
		// The third line as it was played: four bars at ♩ = 100, its clicks on 2 and 4.
		expect(take.from).toBeCloseTo(ORIGIN + 15 * TWO_FOUR_BAR_S, 9);
		expect(take.to).toBeCloseTo(ORIGIN + 19 * TWO_FOUR_BAR_S, 9);
		expect(take.sounds).toHaveLength(8);
		take.sounds.forEach((sound, i) => expect(sound.time - take.from).toBeCloseTo(0.6 + i * 1.2, 9));
		// Then the listen-in at ♩ = 120, the click on 2 and 4, and four clicks counted.
		const resumedAt = clock.now() + ORIGIN;
		const after = sounds.emitted().map((s) => s.time - resumedAt);
		const expected = [0.5, 1.5, 2.5, 3.5, 4, 4.5, 5, 5.5];
		expect(after.slice(0, expected.length)).toHaveLength(expected.length);
		after.slice(0, expected.length).forEach((t, i) => expect(t).toBeCloseTo(expected[i], 9));
		expect(controller.view.announcement?.kind).toBe('level-up');
		expect(controller.view.tempoBpm).toBe(120);
		// The next line, after the count, at the new tempo and level.
		await advance(resumedAt + 6 + 8 + 0.6, false);
		const attempts = await stored();
		expect(attempts).toHaveLength(4);
		expect(attempts[3]).toMatchObject({ tempoBpm: 120, cardKey: 'rhythm-figure:line-4@1' });
		controller.quit();
	});

	it('forgets the takes of an earlier session when a series starts', async () => {
		const { controller, takes } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		takes.keepFrom(-10);
		takes.hear(-5);
		expect(takes.spans).toHaveLength(1);
		await controller.start();
		expect(takes.spans).toEqual([]);
		controller.quit();
	});

	it('keeps no input once the series is quit, even with a start asked ahead', async () => {
		const { controller, takes, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 1.5 * OFFBEATS_BAR_S);
		controller.quit();
		expect(takes.keeping).toBe(false);
		await advance(ORIGIN + 10 * OFFBEATS_BAR_S, false);
		expect(takes.spans).toEqual([]);
	});

	it('does nothing when the run was cut before its first bar sounded', async () => {
		const { controller, takes, sounds, advance } = await rhythmSeries(RHYTHM_OFFBEATS, {
			met: true
		});
		// Every wake-up 50 ms early: the run's first bar is entered before it sounds.
		const at = sounds.at.bind(sounds);
		sounds.at = (time, callback) => at(time - 0.05, callback);
		await controller.start();
		await advance(ORIGIN + 3 * OFFBEATS_BAR_S - 0.03, false);
		controller.pause();
		await controller.replay?.();
		expect(takes.plays).toEqual([]);
		expect(controller.view.status).toBe('paused');
		controller.quit();
	});

	it('stops the replay on quit', async () => {
		const { controller, takes, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.start();
		await advance(ORIGIN + 4.6 * OFFBEATS_BAR_S);
		controller.pause();
		takes.hold = true;
		const replaying = controller.replay?.();
		await settled();
		controller.quit();
		await replaying;
		await settled();
		expect(takes.stops).toBeGreaterThan(0);
		expect(controller.view.status).toBe('finished');
	});
});
