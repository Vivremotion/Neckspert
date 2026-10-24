import { describe, expect, it } from 'vitest';
import { gesturePlan } from '$lib/domain/gesture';
import type { GridChange } from '$lib/domain/grid';
import { triadShapes, type ChordGridItem } from '$lib/domain/mechanics';
import type { StringNumber } from '$lib/domain/music';
import type { ItemSource, SelectorContext } from '$lib/domain/progress';
import { SESSION_MS, type Segment } from '$lib/domain/session';
import { Fraction, METER_4_4, type RoundPlan } from '$lib/domain/time';
import { occurrenceId } from '$lib/domain/triads';
import type { Attempt, Execution, PlannedItem } from '$lib/domain/types';
import type { ChordExpectation, ChordReport } from '$lib/application/ports';
import { GESTURE_PRESENTERS, type GridStageModel } from '$lib/application/mechanics/chordGrid';
import {
	FakeChordVerifier,
	FakeClock,
	FakeSoundScheduler,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { AttemptRecorder } from '../AttemptRecorder';
import { chordSensor } from '../sensors';
import type { ResponseSeriesDeps } from '../SessionDeps';
import { ResponseSeriesController } from './ResponseSeriesController.svelte';

const G_B_E: StringNumber[] = [3, 2, 1];
/** Two changes of one bar each: a passage lasts two bars. */
const CHANGES: GridChange[] = [
	{ at: 0, length: 4, symbol: 'Dm7' },
	{ at: 4, length: 4, symbol: 'G7' }
];
const CHORDS = ['D|min', 'G|maj'];

interface ChangeOptions {
	passage?: string;
	exerciseId?: string;
	scope?: string;
}

/** Change `index` of a passage, as the gesture selector would serve it. */
function change(index: number, options: ChangeOptions = {}): PlannedItem<ChordGridItem> {
	const scope = options.scope ?? 'iohefy-a';
	return {
		exerciseId: options.exerciseId ?? 'gesture-jam',
		mechanic: 'chord-grid',
		item: {
			rule: 'jam',
			element: `jam:${scope}`,
			passageId: options.passage ?? 's:0',
			index,
			changes: CHANGES,
			symbol: CHANGES[index].symbol,
			chord: CHORDS[index],
			sets: [G_B_E],
			previous: null
		},
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		...(index === 0 && { countIn: true }),
		tempoScope: scope
	};
}

/** A whole passage: its first change counted in. */
function passage(options: ChangeOptions & { restBars?: number } = {}): PlannedItem[] {
	const [first, second] = [change(0, options), change(1, options)];
	return [{ ...first, ...(options.restBars && { restBars: options.restBars }) }, second];
}

/** The shape a jam takes as right: any shape of its chord. */
function rightShape(item: PlannedItem): string {
	return occurrenceId(triadShapes(item.item as ChordGridItem)[0]);
}

/** A verifier that may report at once when its expectation is withdrawn (a window cut short). */
class CutShortVerifier extends FakeChordVerifier {
	onWithdraw: (() => void) | null = null;

	override expect(expectation: ChordExpectation | null): void {
		super.expect(expectation);
		if (expectation === null && this.onWithdraw) {
			const report = this.onWithdraw;
			this.onWithdraw = null;
			report();
		}
	}
}

/** Serves its items in order, then nothing; keeps what it was asked and told. */
class ScriptedSource implements ItemSource {
	readonly asked: SelectorContext[] = [];
	readonly recorded: Attempt[] = [];
	constructor(private readonly items: PlannedItem[]) {}
	next(context: SelectorContext): PlannedItem | null {
		this.asked.push(context);
		return this.items.shift() ?? null;
	}
	record(attempt: Attempt): null {
		this.recorded.push(attempt);
		return null;
	}
	cardChanged(): void {}
}

const EXECUTIONS: Execution[] = [
	{ exerciseId: 'gesture-jam', scope: 'iohefy-a', tempoBpm: 120 },
	{ exerciseId: 'gesture-jam', scope: 'blues-f', tempoBpm: 60 },
	{ exerciseId: 'gesture-zone', scope: 'iohefy-a', tempoBpm: 60 }
];

/**
 * ♩ = 120 bpm from 0.1 s: a beat lasts 0.5 s, a bar 2 s. The counted bar is bar 0, the first
 * change falls on bar 1 (2.1 s), its prompt a beat before; a change hands over 200 ms before the
 * next one.
 */
function setup(
	items: PlannedItem[],
	options: { development?: boolean; plans?: ResponseSeriesDeps['plans'] } = {}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const verifier = new CutShortVerifier();
	const source = new ScriptedSource([...items]);
	const repositories = {
		attempts: new InMemoryAttemptRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		progressions: new InMemoryProgressionRepository()
	};
	const recorder = new AttemptRecorder({
		attempts: repositories.attempts,
		cards: new InMemoryCardStateRepository(),
		clock,
		now: () => clock.toEpochMs(clock.now()),
		selector: source,
		sessionId: 'series-1',
		rules: (mechanic) => GESTURE_PRESENTERS[mechanic].rules
	});
	const deps: ResponseSeriesDeps = {
		clock,
		sounds,
		sensors: { chord: chordSensor(verifier) },
		mechanics: GESTURE_PRESENTERS,
		repositories,
		recorder,
		plans: options.plans ?? ((item) => gesturePlan(item.item as ChordGridItem, METER_4_4)),
		locale: () => 'fr',
		development: options.development ?? false
	};
	const prepared: string[] = [];
	const controller = new ResponseSeriesController(
		{ id: 'series-1', kind: 'gesture' },
		async (sessionId) => {
			prepared.push(sessionId);
			return { source, executions: EXECUTIONS };
		},
		deps
	);
	/**
	 * Moves the clock just past `time` by 10 ms steps, the scheduler waking at each: a wake-up
	 * due at `time` has run, whatever the float error of its conversion.
	 */
	const runTo = (time: number) => {
		const until = time + 1e-6;
		while (clock.now() < until - 1e-12) {
			clock.time = Math.min(clock.now() + 0.01, until);
			sounds.flush();
		}
	};
	const report = (time: number, decided: string | null): ChordReport => ({
		time,
		windowMs: 300,
		decided,
		final: true,
		variants: []
	});
	const play = (time: number, decided: string | null) => verifier.emit(report(time, decided));
	/** Bar `bar` (fractions allowed) in audio seconds at ♩ = 120 from 0.1 s. */
	const bar = (n: number) => 0.1 + 2 * n;
	const stored = () => repositories.attempts.listBySession('series-1');
	return {
		clock,
		sounds,
		verifier,
		source,
		repositories,
		controller,
		prepared,
		runTo,
		play,
		report,
		bar,
		stored
	};
}

type Ctx = ReturnType<typeof setup>;

async function drain() {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** The clicks scheduled from `from` to `to` seconds, as their times. */
function clicksBetween(ctx: Ctx, from: number, to: number): number[] {
	return ctx.sounds
		.emitted()
		.filter((s) => s.time >= from - 1e-9 && s.time < to - 1e-9)
		.map((s) => Math.round(s.time * 1000) / 1000);
}

/** The chords told to the verifier (withdrawals left out), with the clock when told. */
function expectationsAsked(ctx: Ctx): ChordExpectation[] {
	return ctx.verifier.expectations.filter((e): e is ChordExpectation => e !== null);
}

function model(ctx: Ctx): GridStageModel {
	return ctx.controller.view.stage?.model as GridStageModel;
}

/** Roles of the trace's segments inside the series, in order. */
function roles(trace: Segment | null): string[] {
	const series = trace?.children.find((s) => s.role === 'series');
	return series?.children.map((s) => s.role) ?? [];
}

describe('ResponseSeriesController', () => {
	describe('start', () => {
		it('tells the first exercise’s instruction on the start screen, before any sound', async () => {
			const ctx = setup(passage());
			await ctx.controller.ready();
			expect(ctx.controller.view.status).toBe('idle');
			expect(ctx.controller.view.briefing?.text).toMatch(/grille/);
			expect(ctx.sounds.emitted()).toEqual([]);
			expect(ctx.prepared).toEqual(['series-1']);
		});

		it('counts a bar at the first tempo, then opens the first change a beat before its target on the next 1', async () => {
			const ctx = setup(passage());
			await ctx.controller.ready();
			await ctx.controller.start();
			// Prepared once: start takes what ready prepared, its instruction already told.
			expect(ctx.prepared).toEqual(['series-1']);
			expect(ctx.controller.view.briefing).toBeNull();
			expect(ctx.controller.view.status).toBe('count-in');
			expect(ctx.controller.view.tempoBpm).toBe(120);
			// The counted bar: four clicks on bar 0.
			expect(clicksBetween(ctx, 0, ctx.bar(1))).toEqual([0.1, 0.6, 1.1, 1.6]);
			ctx.runTo(ctx.bar(0.75) - 0.01);
			expect(expectationsAsked(ctx)).toEqual([]);
			ctx.runTo(ctx.bar(0.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(expectationsAsked(ctx)).toHaveLength(1);
			expect(model(ctx).anchorBeat).toBe(4);
			expect(model(ctx).index).toBe(0);
			// The change is heard on its target.
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			const [attempt] = await ctx.stored();
			expect(attempt.success).toBe(true);
			expect(attempt.tempoBpm).toBe(120);
		});
	});

	describe('chaining', () => {
		it('opens the next change of a passage at the handover, without a gap or a counted bar', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2) - 0.21);
			expect(expectationsAsked(ctx)).toHaveLength(1);
			ctx.runTo(ctx.bar(2) - 0.2);
			// Withdrawn, then the next change asked at once.
			expect(ctx.verifier.expectations.slice(-2)).toEqual([null, expect.anything()]);
			expect(model(ctx).index).toBe(1);
			expect(model(ctx).anchorBeat).toBe(8);
			expect(ctx.controller.view.countdown).toBeNull();
			// The click goes on: bar 1 clicked, then bar 2.
			expect(clicksBetween(ctx, ctx.bar(1), ctx.bar(3))).toEqual([
				2.1, 2.6, 3.1, 3.6, 4.1, 4.6, 5.1, 5.6
			]);
		});

		it('counts a bar after a passage, in silence first when the next one asks for rest bars', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1', restBars: 1 })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			expect(ctx.controller.view.status).toBe('count-in');
			// Bar 3 silent, bar 4 counted, the next passage's first change on bar 5.
			expect(clicksBetween(ctx, ctx.bar(3), ctx.bar(4))).toEqual([]);
			expect(clicksBetween(ctx, ctx.bar(4), ctx.bar(5))).toEqual([8.1, 8.6, 9.1, 9.6]);
			ctx.runTo(ctx.bar(4.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(model(ctx).anchorBeat).toBe(20);
		});

		it('places the next round after a counted bar when a round has no handover, once it settles', async () => {
			// Listening ends at 3.5 beats; nothing hands over.
			const plans = (item: PlannedItem): RoundPlan => {
				const plan: RoundPlan = {
					...gesturePlan(item.item as ChordGridItem, METER_4_4),
					listenUntil: Fraction.of(7, 8)
				};
				delete plan.handover;
				return plan;
			};
			const ctx = setup(passage(), { plans });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1.875));
			expect(ctx.controller.view.status).toBe('count-in');
			expect(await ctx.stored()).toHaveLength(1);
			// Bar 2 counted, the second change on bar 3.
			expect(clicksBetween(ctx, ctx.bar(2), ctx.bar(3))).toEqual([4.1, 4.6, 5.1, 5.6]);
			ctx.runTo(ctx.bar(2.75));
			expect(ctx.controller.view.status).toBe('awaiting');
			expect(model(ctx).anchorBeat).toBe(12);
		});
	});

	describe('tempo scopes', () => {
		it('plays each passage at its scope’s tempo, changing tempo after a counted bar (ballad then blues then ballad)', async () => {
			const ctx = setup([
				...passage(),
				...passage({ passage: 's:1', scope: 'blues-f' }),
				...passage({ passage: 's:2' })
			]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.19);
			expect(ctx.controller.view.tempoBpm).toBe(60);
			// At ♩ = 60 from bar 3 (6.1 s): the counted bar lasts 4 s, its clicks a second apart.
			expect(clicksBetween(ctx, ctx.bar(3), 10.1)).toEqual([6.1, 7.1, 8.1, 9.1]);
			// The blues' first change falls on 10.1 s, its prompt a beat (1 s) before.
			ctx.runTo(9.1);
			expect(ctx.controller.view.status).toBe('awaiting');
			ctx.runTo(10.13);
			ctx.play(10.12, rightShape(change(0)));
			// Two bars at ♩ = 60 (8 s), then the ballad again at ♩ = 120 after a counted bar.
			ctx.runTo(18.1 - 0.19);
			expect(ctx.controller.view.tempoBpm).toBe(120);
			expect(clicksBetween(ctx, 18.1, 20.1)).toEqual([18.1, 18.6, 19.1, 19.6]);
			ctx.runTo(20.1 + 0.03);
			ctx.play(20.12, rightShape(change(0)));
			const attempts = await ctx.stored();
			expect(attempts.map((a) => [a.tempoBpm, a.tempoScope, a.success])).toEqual([
				[120, 'iohefy-a', false],
				[120, 'iohefy-a', false],
				[60, 'blues-f', true],
				[60, 'blues-f', false],
				[120, 'iohefy-a', true]
			]);
		});
	});

	describe('instruction', () => {
		it('stops before the first passage of another exercise: nothing plays until resume, which counts a bar at its tempo', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1', exerciseId: 'gesture-zone' })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			expect(ctx.controller.view.status).toBe('paused');
			expect(ctx.controller.view.briefing?.text).toMatch(/zone/);
			expect(ctx.controller.view.countdown).toBeNull();
			// Nothing scheduled, nothing to wake: the screen may stay on the instruction for ever.
			const before = ctx.sounds.emitted().length;
			ctx.runTo(30);
			expect(ctx.sounds.emitted()).toHaveLength(before);
			expect(ctx.controller.view.status).toBe('paused');
			ctx.controller.resume();
			await drain();
			expect(ctx.controller.view.briefing).toBeNull();
			expect(ctx.controller.view.tempoBpm).toBe(60);
			// A fresh map from 30.1 s at ♩ = 60: the counted bar, then the change on 34.1 s.
			expect(clicksBetween(ctx, 30, 34.1)).toEqual([30.1, 31.1, 32.1, 33.1]);
			ctx.runTo(33.11);
			expect(ctx.controller.view.status).toBe('awaiting');
			expect((model(ctx) as unknown as { cue: { kind: string } }).cue.kind).toBe('jam');
		});
	});

	describe('pause', () => {
		it('mid-passage: cancels the handover, drops a round that heard nothing, and resumes on the next change after a counted bar', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })]);
			await ctx.controller.start();
			// Inside the first change's prompt beat, before its window opens.
			ctx.runTo(ctx.bar(0.8));
			ctx.controller.pause();
			expect(ctx.controller.view.status).toBe('paused');
			expect(ctx.verifier.expectations.at(-1)).toBeNull();
			const asked = expectationsAsked(ctx).length;
			ctx.runTo(10);
			// No handover, no other change.
			expect(expectationsAsked(ctx)).toHaveLength(asked);
			expect(await ctx.stored()).toEqual([]);
			ctx.controller.resume();
			await drain();
			expect(ctx.controller.view.status).toBe('count-in');
			// From 10.1 s: the counted bar, then the passage's second change on 12.1 s.
			expect(clicksBetween(ctx, 10, 12.1)).toEqual([10.1, 10.6, 11.1, 11.6]);
			ctx.runTo(11.61);
			expect(model(ctx).index).toBe(1);
			expect(ctx.controller.view.status).toBe('awaiting');
		});

		it('settles a round that heard an answer when paused, and closes its span', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.5);
			// Another chord than the one asked.
			ctx.play(ctx.bar(1) + 0.02, occurrenceId(triadShapes(change(1).item as ChordGridItem)[0]));
			ctx.controller.pause();
			await drain();
			const [attempt] = await ctx.stored();
			expect(attempt.success).toBe(false);
			expect(attempt.correct).toBe(false);
			expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer']);
		});
	});

	describe('the end', () => {
		it('finishes when the source has nothing more, the passage played to its end', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			expect(await ctx.stored()).toHaveLength(2);
			const [session] = await ctx.repositories.sessions.list();
			expect(session.endedAt).not.toBeNull();
			expect(session.executions).toEqual(EXECUTIONS);
		});

		it('finishes the passage begun once SESSION_MS is spent, and begins no other', async () => {
			const ctx = setup([...passage(), ...passage({ passage: 's:1' })]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1));
			// Wall time runs on: the series has lasted its time in the middle of the passage.
			ctx.clock.epochAtZero += SESSION_MS;
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(model(ctx).index).toBe(1);
			expect(ctx.controller.view.status).toBe('awaiting');
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			expect(ctx.controller.view.briefing ?? null).toBeNull();
			expect(await ctx.stored()).toHaveLength(2);
			expect(ctx.source.asked.at(-1)?.elapsedMs).toBeGreaterThanOrEqual(SESSION_MS);
		});

		it('writes the session and finishes on quit, the round under way settled', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.5);
			ctx.controller.quit();
			await drain();
			expect(ctx.controller.view.status).toBe('finished');
			const attempts = await ctx.stored();
			expect(attempts.map((a) => a.success)).toEqual([false]);
			const [session] = await ctx.repositories.sessions.list();
			expect(session.endedAt).not.toBeNull();
		});
	});

	describe('screen', () => {
		it('counts 4 3 2 1 over the counted bar and follows the transport’s beats', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			const counts: (number | null)[] = [];
			for (let beat = 0; beat <= 4; beat++) {
				ctx.runTo(ctx.bar(beat / 4) + 0.01);
				counts.push(ctx.controller.view.countdown);
			}
			expect(counts).toEqual([4, 3, 2, 1, null]);
			expect(ctx.controller.timeline.nowBeat()).toBeCloseTo(4.02, 2);
		});

		it('names its exercise’s view and places the settled changes in its history', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			expect(ctx.controller.view.stage?.view).toBe('grid-scroll');
			expect(ctx.controller.view.status).toBe('verdict');
			expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'perfect' }]);
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(model(ctx)).toMatchObject({
				index: 1,
				anchorBeat: 8,
				history: [{ beatIndex: 4, verdict: 'perfect' }]
			});
		});
	});

	describe('recording', () => {
		it('writes each settled change, tells the source, and completes its observations when the next change opens', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.03);
			ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
			// After its settlement, still in its span.
			ctx.play(ctx.bar(1) + 1, null);
			expect(ctx.source.recorded).toHaveLength(1);
			expect(ctx.source.recorded[0]).toMatchObject({
				success: true,
				correct: true,
				exerciseId: 'gesture-jam',
				tempoScope: 'iohefy-a'
			});
			await drain();
			expect((await ctx.stored())[0].observations).toHaveLength(1);
			ctx.runTo(ctx.bar(2) - 0.2);
			await drain();
			const [first] = await ctx.stored();
			expect(first.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
			expect(first.verdict.relation).toBe('response');
			expect(first.plan).toMatchObject({ handover: '1' });
		});

		it('files an observation arriving at the handover in the next change, and a window cut short in the change that ends', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2) - 0.25);
			// The window attacked 1.25 bars in reports when it is withdrawn: into the first change.
			ctx.verifier.onWithdraw = () => ctx.play(ctx.bar(1.6), rightShape(change(0)));
			ctx.runTo(ctx.bar(2) - 0.2);
			// Right after the handover: the second change's.
			ctx.play(ctx.bar(2) - 0.2, rightShape(change(1)));
			ctx.runTo(ctx.bar(3) - 0.2);
			await drain();
			const [first, second] = await ctx.stored();
			expect(first.observations?.map((o) => [o.fate, o.correct])).toEqual([['answer', true]]);
			expect(first.success).toBe(false);
			expect(second.observations?.map((o) => [o.fate, o.correct])).toEqual([['answer', true]]);
			expect(second.timingOffsetMs).toBe(-200);
		});
	});

	describe('« Joué juste »', () => {
		it('offers it after a miss in development, until the next change', async () => {
			const ctx = setup(passage(), { development: true });
			await ctx.controller.start();
			ctx.runTo(ctx.bar(1) + 0.5);
			expect(ctx.controller.view.contest).toBe('available');
			ctx.controller.contest();
			expect(ctx.controller.view.contest).toBe('done');
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(ctx.controller.view.contest).toBeNull();
			await drain();
			const [attempt] = await ctx.stored();
			expect(attempt.contested).toBe(true);
		});

		it('never offers it outside development', async () => {
			const ctx = setup(passage());
			await ctx.controller.start();
			ctx.runTo(ctx.bar(2) - 0.2);
			expect(ctx.controller.view.contest).toBeNull();
			ctx.controller.contest();
			await drain();
			expect((await ctx.stored())[0].contested).toBeUndefined();
		});
	});

	describe('trace', () => {
		it('keeps the series, its rests, counted bars, rounds, instructions and pauses', async () => {
			const ctx = setup([
				...passage(),
				...passage({ passage: 's:1', restBars: 1 }),
				...passage({ passage: 's:2', exerciseId: 'gesture-zone' })
			]);
			await ctx.controller.start();
			ctx.runTo(ctx.bar(5.5));
			ctx.controller.pause();
			ctx.controller.resume();
			await drain();
			ctx.runTo(ctx.bar(5.5) + 2 * 2);
			ctx.runTo(30);
			expect(ctx.controller.view.briefing).not.toBeNull();
			ctx.controller.quit();
			await drain();
			expect(roles(ctx.controller.trace)).toEqual([
				'count-in',
				'round',
				'round',
				'rest',
				'count-in',
				'round',
				'pause',
				'count-in',
				'round',
				'briefing'
			]);
			const series = ctx.controller.trace?.children[0];
			expect(series?.role).toBe('series');
			expect(series?.reason).toBe('quit');
		});
	});
});
