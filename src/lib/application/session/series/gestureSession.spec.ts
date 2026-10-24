import { describe, expect, it, vi } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import type { ChordGridData, ChordGridItem } from '$lib/domain/mechanics';
import type { PlannedItem } from '$lib/domain/types';
import {
	responseVerdictOf,
	type Attempt,
	type BackupFile,
	type CardState
} from '$lib/domain/types';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	ChordExpectation
} from '$lib/application/ports';
import { GESTURE_PRESENTERS, NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { chordGridPresenter } from '$lib/application/mechanics/chordGrid';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import { createAppServices } from '$lib/application/services/createAppServices';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import type { PlaySessionController } from '$lib/application/session/contract';
import type { Observation, SensorFactory } from '$lib/application/session/sensors';
import { chordSensor, noteSensor, tapSensor } from '$lib/application/session/sensors';
import {
	FakeChordVerifier,
	FakeClock,
	FakeDiagnostics,
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
import {
	EXECUTIONS,
	change,
	clicksBetween,
	drain,
	expectationsAsked,
	gestureSeries,
	model,
	passage,
	rightShape,
	type Ctx
} from '$lib/testing/gestureSeries';
import { shapeId, triadCards } from '$lib/testing/shapes';
import { ResponseSeriesController } from './ResponseSeriesController.svelte';

/**
 * The gesture's scenarios of the old controller (`gestureEndToEnd`, `chainedRounds`, `countdown`,
 * `briefing`, `tempoScope`, `twoSensors`), played on the response series: the acceptance test of
 * the switch (plan H3, Task 8). The first part runs the real wiring (`createAppServices`, the
 * gesture selector); the others serve scripted changes to the real presenter and plans (♩ = 120
 * from 0.1 s: a bar lasts 2 s, a change one bar, the first one on bar 1).
 */

const G_B_E = [3, 2, 1] as const;

// ── the real wiring ────────────────────────────────────────────────────────

class FakeBackup implements BackupPort {
	async exportAll(): Promise<BackupFile> {
		throw new Error('not used');
	}
	async importAll(): Promise<void> {}
}

class FakeCalibration implements CalibrationPort {
	async run(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	async runOnClick(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	cancel(): void {}
}

/** The app's services on fakes, `cards` acquired; a gesture session started from them. */
async function appSession(cards: CardState[]) {
	const clock = new FakeClock();
	const detector = new FakeNoteDetector();
	const chords = new FakeChordVerifier();
	const sounds = new FakeSoundScheduler(clock);
	const deps = {
		clock,
		metronome: new FakeMetronome(clock),
		detector,
		cues: new FakeSoundCues(),
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		progressions: new InMemoryProgressionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => 'gesture-session',
		mechanics: { ...NECK_PRESENTERS, ...TRIAD_PRESENTERS, ...GESTURE_PRESENTERS },
		sensors: { note: noteSensor(detector), tap: tapSensor(), chord: chordSensor(chords) },
		sounds,
		takes: new FakeTakeBuffer(),
		memory: new SessionMemory(),
		levels: new InMemoryLevelStateRepository()
	};
	await deps.cards.putMany(cards);
	const services = createAppServices({
		...deps,
		backup: new FakeBackup(),
		calibration: new FakeCalibration(),
		diagnostics: new FakeDiagnostics()
	});
	const controller = await services.startSession('gesture');
	expect(controller).toBeInstanceOf(ResponseSeriesController);
	await controller.ready?.();
	await controller.start();
	return { services, deps, clock, sounds, chords, controller, briefings: [] as string[] };
}

type App = Awaited<ReturnType<typeof appSession>>;

/** A change as the fake verifier met it: what it was told, and the shape it reported. */
interface Played {
	expectation: ChordExpectation;
	decided: string | null;
}

/** The change on screen: where its target falls on the map, and its index in the passage. */
function placeOf(controller: PlaySessionController): { anchorBeat: number | null } {
	return (
		(controller.view.stage?.model as { anchorBeat: number | null } | undefined) ?? {
			anchorBeat: null
		}
	);
}

/**
 * Plays changes until `changes` were played: at each round opened (a new expectation told), the
 * verifier reports the shape `choose` dictates, 20 ms after its target, once the clock gets there.
 * An exercise met for the first time stops on its instruction: « C'est parti ».
 */
async function play(
	app: App,
	changes: number,
	choose: (expectation: ChordExpectation, n: number) => string | null
): Promise<Played[]> {
	const { clock, sounds, chords, controller } = app;
	const played: Played[] = [];
	let told = chords.expectations.length;
	let due: { time: number; expectation: ChordExpectation } | null = null;
	for (let step = 0; step < 100_000 && played.length < changes; step++) {
		clock.advance(0.01);
		sounds.flush();
		if (controller.view.status === 'paused' && controller.view.briefing) {
			app.briefings.push(controller.view.briefing.text);
			controller.resume();
		}
		if (chords.expectations.length > told) {
			told = chords.expectations.length;
			const expectation = chords.expectations.at(-1);
			const { anchorBeat } = placeOf(controller);
			if (expectation && anchorBeat !== null) {
				const beatS = 60 / controller.view.tempoBpm;
				const target = clock.now() + (anchorBeat - controller.timeline.nowBeat()) * beatS;
				due = { time: target + 0.02, expectation };
			}
		}
		if (due && clock.now() >= due.time) {
			const decided = choose(due.expectation, played.length);
			chords.emit({ time: due.time, windowMs: 250, decided, final: true, variants: [] });
			played.push({ expectation: due.expectation, decided });
			due = null;
		}
		if (step % 50 === 0) await Promise.resolve();
	}
	return played;
}

/** Until the round in course settles at its handover, then quits and lets the writes end. */
async function finish(app: App) {
	for (let i = 0; i < 400; i++) {
		app.clock.advance(0.01);
		app.sounds.flush();
	}
	app.controller.quit();
	for (let i = 0; i < 50; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

const right = (expectation: ChordExpectation) => expectation.expected[0];
const dataOf = (attempt: Attempt) => attempt.data as ChordGridData;

describe('a gesture session on the response series, end to end', () => {
	it('links D on G-B-E right: seven changes, no card, the passage won, never aided', async () => {
		const cards = triadCards('triad-anchor', 'D', 'maj', G_B_E);
		const app = await appSession(cards);
		const played = await play(app, 14, right);
		await finish(app);

		expect(played.slice(0, 7).map((p) => p.decided)).toEqual(
			['2-3-2', '7-7-5', '11-10-10', '14-15-14', '11-10-10', '7-7-5', '2-3-2'].map((frets) =>
				shapeId('D', 'maj', G_B_E, frets)
			)
		);
		const attempts = await app.deps.attempts.all();
		expect(attempts.slice(0, 14).every((a) => a.correct && a.mechanic === 'chord-grid')).toBe(true);
		expect(attempts.slice(0, 14).every((a) => a.success && a.tempoBpm === 80)).toBe(true);
		const passages = new Set(attempts.map((a) => dataOf(a).item.passageId));
		expect(passages.size).toBeGreaterThanOrEqual(2);
		expect(attempts.slice(0, 14).every((a) => a.aids.length === 0)).toBe(true);
		expect(await app.deps.cards.all()).toEqual(cards);
		expect(await app.deps.progressions.get('gesture-link')).toMatchObject({ tempoBpm: 85 });

		const summary = await app.services.sessionSummary(app.controller.sessionId);
		expect(summary.gesture?.exercises[0]).toMatchObject({
			exerciseId: 'gesture-link',
			passagesSucceeded: 2,
			tempoBpm: 80,
			nextTempoBpm: 85
		});
	});

	it('climbs iohefy-a, refuses a shape that does not climb, and jams it', async () => {
		const triads = [
			['D', 'min'],
			['G', 'maj'],
			['C', 'maj'],
			['F', 'maj'],
			['E', 'min'],
			['Eb', 'min'],
			['Ab', 'maj']
		] as const;
		const cards = triads.flatMap(([root, quality]) =>
			triadCards('triad-anchor', root, quality, G_B_E)
		);
		const app = await appSession(cards);
		// Link (7), then the climb (9), then the jam (9). In the climb's third change (Dm7), a Dm
		// lower than the G just heard.
		const low = shapeId('D', 'min', G_B_E, '2-3-1');
		const played = await play(app, 25, (expectation, n) => (n === 9 ? low : right(expectation)));
		await finish(app);

		const attempts = await app.deps.attempts.all();
		const exercises = attempts.map((a) => a.exerciseId);
		// The link came first, told on the start screen; the climb and the jam each stopped once.
		expect(app.briefings).toEqual([
			expect.stringMatching(/^Joue la grille sur le groupe/),
			expect.stringMatching(/^Joue la grille comme tu veux/)
		]);
		expect(exercises.slice(0, 7).every((id) => id === 'gesture-link')).toBe(true);
		expect(exercises.slice(7, 16).every((id) => id === 'gesture-climb')).toBe(true);
		expect(exercises.slice(16, 25).every((id) => id === 'gesture-jam')).toBe(true);
		expect(attempts.slice(7, 25).map((a) => a.tempoScope)).toEqual(Array(18).fill('iohefy-a'));

		const missed = attempts[9];
		expect(dataOf(missed).item).toMatchObject({ rule: 'climb', symbol: 'Dm7', direction: 'up' });
		expect(missed).toMatchObject({
			correct: false,
			success: false,
			verdict: { relation: 'response' }
		});
		expect(responseVerdictOf(missed)).toBe('wrong');
		expect(dataOf(missed).confusion).toEqual({ kind: 'not-higher', part: 'chord' });
		// The G still ringing was never a candidate of that change.
		const ringing = dataOf(missed).item.previous;
		expect(ringing).toBe(played[8].decided);
		expect(played[9].expectation.candidates.map((c) => c.id)).not.toContain(ringing);
		expect(attempts.filter((a) => a.exerciseId === 'gesture-climb' && !a.correct)).toHaveLength(1);
		expect(attempts.slice(16, 25).every((a) => a.correct)).toBe(true);

		const summary = await app.services.sessionSummary(app.controller.sessionId);
		expect(summary.gesture?.exercises.map((e) => e.exerciseId)).toEqual([
			'gesture-link',
			'gesture-climb',
			'gesture-jam'
		]);
		expect(summary.gesture?.misses).toEqual([
			expect.objectContaining({ exerciseId: 'gesture-climb', symbol: 'Dm7', heard: '2-3-1' })
		]);
	});

	it('plays a failed link tour again at once, chained, aided after two misses in the tour', async () => {
		const app = await appSession(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		// Nothing right in the first tour (7 changes), then right.
		await play(app, 14, (expectation, n) => (n < 7 ? null : right(expectation)));
		await finish(app);
		const attempts = await app.deps.attempts.all();
		const first = attempts.slice(0, 7);
		const replayed = dataOf(attempts[7]).item.passageId;
		// The tour played again leaves out its lowest shape, just played: six changes.
		const second = attempts.filter((a) => dataOf(a).item.passageId === replayed);
		expect(second).toHaveLength(6);
		expect(first.every((a) => !a.success)).toBe(true);
		expect(second.every((a) => dataOf(a).item.continued === true)).toBe(true);
		// Chained: its first change opened at the handover of the last one, no counted bar.
		expect(second[0].promptedAt - first[6].promptedAt).toBeCloseTo(4 * 750, -1);
		// Aided from LINK_AID_AFTER_MISSES misses in the tour, until a tour succeeds.
		expect(first.map((a) => a.aids.length > 0)).toEqual([
			false,
			false,
			true,
			true,
			true,
			true,
			true
		]);
		expect(second.every((a) => a.aids.length > 0)).toBe(true);
		expect(second.every((a) => a.success)).toBe(true);
	});
});

// ── scripted changes ─────────────────────────────────────────────────────────

/** Moves the clock until the transport is `beat` beats in (plus 10 ms), the scheduler waking. */
function runToBeat(ctx: Ctx, beat: number) {
	while (ctx.controller.timeline.nowBeat() < beat + 0.02) ctx.runTo(ctx.clock.now() + 0.01);
}

/** The countdown and the change's target on each beat from `from` to `to`, read just after it. */
function countsOn(ctx: Ctx, from: number, to: number) {
	const seen: [number, number | null, number | null][] = [];
	for (let beat = from; beat <= to; beat++) {
		runToBeat(ctx, beat);
		seen.push([beat, ctx.controller.view.countdown, model(ctx)?.anchorBeat ?? null]);
	}
	return seen;
}

/**
 * Plays every change right, 20 ms after its target, until the series ends; an instruction is
 * resumed at once. Returns the tempo each change was played at.
 */
async function playAllRight(ctx: Ctx): Promise<number[]> {
	const tempos: number[] = [];
	let told = ctx.verifier.expectations.length;
	let due: { time: number; shape: string } | null = null;
	for (let step = 0; step < 50_000 && ctx.controller.view.status !== 'finished'; step++) {
		ctx.runTo(ctx.clock.now() + 0.01);
		if (ctx.controller.view.status === 'paused') ctx.controller.resume();
		if (ctx.verifier.expectations.length > told) {
			told = ctx.verifier.expectations.length;
			const expectation = ctx.verifier.expectations.at(-1);
			const anchorBeat = model(ctx)?.anchorBeat ?? null;
			if (expectation && anchorBeat !== null) {
				const beatS = 60 / ctx.controller.view.tempoBpm;
				const target = ctx.clock.now() + (anchorBeat - ctx.controller.timeline.nowBeat()) * beatS;
				due = { time: target + 0.02, shape: expectation.expected[0] };
				tempos.push(ctx.controller.view.tempoBpm);
			}
		}
		if (due && ctx.clock.now() >= due.time) {
			ctx.play(due.time, due.shape);
			due = null;
		}
		if (step % 20 === 0) await drain();
	}
	await drain();
	await new Promise((resolve) => setTimeout(resolve, 0));
	return tempos;
}

// Attempts carry the response envelope (H1): its value holds the verdict, beside the measures.
describe('rounds handing over without a gap (chainedRounds)', () => {
	it('opens each change at the handover of the one before, with no moment without a change', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		const targets: (number | null)[] = [];
		for (let t = 0.2; t < ctx.bar(3) - 0.25; t += 0.05) {
			ctx.runTo(t);
			const target = model(ctx)?.anchorBeat ?? null;
			if (target !== targets.at(-1)) targets.push(target);
		}
		expect(targets).toEqual([null, 4, 8]);
		ctx.runTo(ctx.bar(3));
		await drain();
		const attempts = await ctx.stored();
		expect(attempts).toHaveLength(2);
		// The second change shows at the first one's handover: its target minus 200 ms.
		expect(attempts[1].promptedAt).toBeCloseTo(ctx.clock.toEpochMs(ctx.bar(2) - 0.2), 0);
	});

	it('takes an attack 100 ms before a change as its early answer', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1));
		ctx.play(ctx.bar(1), rightShape(change(0)));
		ctx.runTo(ctx.bar(2) - 0.1);
		ctx.play(ctx.bar(2) - 0.1, rightShape(change(1)));
		ctx.runTo(ctx.bar(3) - 0.1);
		await drain();
		const [first, second] = await ctx.stored();
		expect(first).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'perfect' } },
			correct: true,
			success: true
		});
		expect(second).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'early' } },
			timingOffsetMs: -100,
			correct: true,
			success: true
		});
	});

	it('leaves an attack 300 ms before a change in the round before', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(2) - 0.3);
		ctx.play(ctx.bar(2) - 0.3, rightShape(change(1)));
		ctx.runTo(ctx.bar(3) - 0.1);
		await drain();
		const [first, second] = await ctx.stored();
		// The first change took it as its answer, the wrong chord, late.
		expect(first).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'wrong' } },
			success: false,
			data: { answer: { decided: rightShape(change(1)) } }
		});
		expect(second).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'wrong' } },
			data: { answer: null }
		});
		expect(second.observations).toEqual([]);
	});

	it('withdraws the expectation before settling: a window cut short reports into the round that ends', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(2) - 0.25);
		const handover = ctx.bar(2) - 0.2;
		const before = ctx.verifier.expectations.length;
		// The sensor's window, attacked 1.5 beats after the first change, is cut by the handover.
		ctx.verifier.onWithdraw = () => ctx.play(ctx.bar(1.375), rightShape(change(0)));
		ctx.runTo(handover + 0.03);
		await drain();
		const told = ctx.verifier.expectations.slice(before);
		expect(told[0]).toBeNull();
		expect(told.at(-1)?.expected).toContain(rightShape(change(1)));
		const [first] = await ctx.stored();
		expect(first).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'offbeat' } },
			success: false,
			data: { answer: { decided: rightShape(change(0)) } }
		});
		ctx.runTo(ctx.bar(3));
		await drain();
		const [, second] = await ctx.stored();
		expect(second.observations).toEqual([]);
	});

	it('stores a change left unanswered as wrong at its handover', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(2) - 0.21);
		await drain();
		expect(await ctx.stored()).toHaveLength(0);
		ctx.runTo(ctx.bar(2) - 0.17);
		await drain();
		const [first] = await ctx.stored();
		expect(first).toMatchObject({
			verdict: { relation: 'response', value: { verdict: 'wrong' } },
			correct: false,
			success: false,
			data: { answer: null }
		});
	});

	it('cancels the handover on pause, and resumes on the next change after a counted bar', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1' })]);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1));
		ctx.play(ctx.bar(1), rightShape(change(0)));
		ctx.runTo(ctx.bar(2) + 0.1);
		ctx.controller.pause();
		const asked = expectationsAsked(ctx).length;
		ctx.runTo(ctx.bar(5));
		await drain();
		// The second change, paused in its window unanswered, is dropped; nothing handed over.
		expect(await ctx.stored()).toHaveLength(1);
		expect(expectationsAsked(ctx)).toHaveLength(asked);

		ctx.controller.resume();
		await drain();
		ctx.runTo(ctx.clock.now() + 0.2);
		expect(ctx.controller.view.status).toBe('count-in');
		expect(model(ctx).anchorBeat).toBeNull();
		// A counted bar, then the next passage's first change on the 1 after its prompt beat.
		runToBeat(ctx, 3);
		expect(model(ctx)).toMatchObject({ index: 0, anchorBeat: 4 });
		expect(ctx.controller.view.status).toBe('awaiting');
	});

	it('changes tempo for the next passage after a counted bar, then finishes', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1', scope: 'blues-f' })]);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(3) - 0.25);
		expect(ctx.controller.view.tempoBpm).toBe(120);
		ctx.runTo(ctx.bar(3) - 0.15);
		expect(ctx.controller.view.status).toBe('count-in');
		expect(ctx.controller.view.tempoBpm).toBe(60);
		// A counted bar at ♩ = 60 from bar 3 (6.1 s), its countdown shown, then the change on 10.1 s.
		ctx.runTo(7.11);
		expect(ctx.controller.view.countdown).toBe(3);
		ctx.runTo(9.11);
		expect(model(ctx).anchorBeat).not.toBeNull();
		expect(ctx.controller.view.status).toBe('awaiting');
		ctx.runTo(18.2);
		await drain();
		expect(ctx.controller.view.status).toBe('finished');
		expect((await ctx.stored()).map((a) => a.tempoBpm)).toEqual([120, 120, 60, 60]);
	});
});

describe('the counted bar before a chord change (countdown)', () => {
	it('counts 4 3 2 1 on the four beats before the first change, which falls on the next 1', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		expect(countsOn(ctx, 0, 5)).toEqual([
			[0, 4, null],
			[1, 3, null],
			[2, 2, null],
			// The round opens a beat before its change: an early attack counts.
			[3, 1, 4],
			[4, null, 4],
			[5, null, 4]
		]);
	});

	it('counts one bar only after a resume', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1' })]);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.1);
		ctx.controller.pause();
		ctx.controller.resume();
		await drain();
		// Accepted difference: a resume begins a new tempo map, its beats from 0 again.
		expect(countsOn(ctx, 0, 4).map(([, countdown]) => countdown)).toEqual([4, 3, 2, 1, null]);
		expect(model(ctx).anchorBeat).toBe(4);
	});

	it('rests restBars in silence before the counted bar, then counts as usual', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1', restBars: 1 })]);
		await ctx.controller.start();
		// The passage over bars 1 and 2 (beats 4 to 11); silence over 12 to 15; the count over
		// 16 to 19; the next passage on 20. The last change (on 8) stays shown until the count.
		expect(countsOn(ctx, 12, 20)).toEqual([
			[12, null, 8],
			[13, null, 8],
			[14, null, 8],
			[15, null, 8],
			[16, 4, null],
			[17, 3, null],
			[18, 2, null],
			[19, 1, 20],
			[20, null, 20]
		]);
		const clicked = (beat: number) =>
			clicksBetween(ctx, ctx.bar(beat / 4), ctx.bar(beat / 4) + 0.01);
		expect([...Array(10)].map((_, i) => clicked(11 + i).length > 0)).toEqual([
			true,
			false,
			false,
			false,
			false,
			true,
			true,
			true,
			true,
			true
		]);
	});

	it('clicks again after a pause in the rest', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1', restBars: 1 })]);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(3.25) + 0.01);
		expect(clicksBetween(ctx, ctx.bar(3), ctx.bar(4))).toEqual([]);
		ctx.controller.pause();
		ctx.controller.resume();
		await drain();
		const now = ctx.clock.now();
		expect(clicksBetween(ctx, now, now + 2.11)).toHaveLength(4);
	});

	it('counts one bar between two passages, the next change on the downbeat after it', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1' })]);
		await ctx.controller.start();
		expect(countsOn(ctx, 12, 16)).toEqual([
			[12, 4, null],
			[13, 3, null],
			[14, 2, null],
			[15, 1, 16],
			[16, null, 16]
		]);
	});
});

describe('the instruction of an exercise met for the first time (briefing)', () => {
	const JAM = exerciseById('gesture-jam').howTo?.fr;
	const ZONE = exerciseById('gesture-zone').howTo?.fr;

	it('shows the first exercise instruction on the start screen, without a second stop', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.ready();
		expect(ctx.controller.view).toMatchObject({ status: 'idle', briefing: { text: JAM } });
		await ctx.controller.start();
		expect(ctx.controller.view.briefing).toBeNull();
		ctx.runTo(ctx.bar(1) + 0.05);
		expect(ctx.controller.view.status).toBe('awaiting');
		expect(model(ctx).index).toBe(0);
	});

	it('stops before the first passage of another exercise, then counts one bar at its tempo', async () => {
		const ctx = gestureSeries([
			...passage(),
			...passage({ passage: 's:1', exerciseId: 'gesture-zone' })
		]);
		const begins = vi.spyOn(ctx.clock, 'settle');
		await ctx.controller.start();
		ctx.runTo(ctx.bar(3) - 0.15);
		expect(ctx.controller.view).toMatchObject({ status: 'paused', briefing: { text: ZONE } });
		const sounded = ctx.sounds.emitted().length;
		ctx.runTo(ctx.clock.now() + 3);
		expect(ctx.controller.view.status).toBe('paused');
		expect(ctx.sounds.emitted()).toHaveLength(sounded);

		ctx.controller.resume();
		await drain();
		expect(ctx.controller.view.briefing).toBeNull();
		expect(ctx.controller.view.tempoBpm).toBe(60);
		// Accepted difference: after the instruction a new tempo map, its beats from 0 again.
		expect(countsOn(ctx, 0, 4).map(([, countdown]) => countdown)).toEqual([4, 3, 2, 1, null]);
		expect(model(ctx).index).toBe(0);
		// Begun for the series, then once after the instruction: no restart for the tempo.
		expect(begins).toHaveBeenCalledTimes(2);
	});

	it('does not stop again for an exercise already met, nor for one without an instruction', async () => {
		const exercise = (id: string) => {
			const definition = exerciseById(id);
			return id === 'gesture-zone' ? { ...definition, howTo: undefined } : definition;
		};
		const ctx = gestureSeries(
			[
				...passage(),
				...passage({ passage: 's:1', exerciseId: 'gesture-zone' }),
				...passage({ passage: 's:2' })
			],
			{ exercise }
		);
		await ctx.controller.start();
		let stopped = false;
		while (ctx.controller.view.status !== 'finished' && ctx.clock.now() < 60) {
			ctx.runTo(ctx.clock.now() + 0.05);
			if (ctx.controller.view.briefing) stopped = true;
			await drain();
		}
		expect(stopped).toBe(false);
		expect((await ctx.stored()).map((a) => a.exerciseId)).toEqual([
			'gesture-jam',
			'gesture-jam',
			'gesture-zone',
			'gesture-zone',
			'gesture-jam',
			'gesture-jam'
		]);
	});
});

describe('a tempo per exercise and scope (tempoScope)', () => {
	it('plays each change at the tempo of its scope, the transport changing tempo between scopes', async () => {
		const ctx = gestureSeries([
			...passage(),
			...passage({ passage: 's:1', scope: 'blues-f' }),
			...passage({ passage: 's:2' })
		]);
		await ctx.controller.start();
		expect(await playAllRight(ctx)).toEqual([120, 120, 60, 60, 120, 120]);
		const attempts = await ctx.stored();
		expect(attempts.map((a) => [a.tempoBpm, a.tempoScope, a.success])).toEqual([
			[120, 'iohefy-a', true],
			[120, 'iohefy-a', true],
			[60, 'blues-f', true],
			[60, 'blues-f', true],
			[120, 'iohefy-a', true],
			[120, 'iohefy-a', true]
		]);
	});

	it('moves the tempo of a scope on its own attempts only', async () => {
		const ballad = [0, 1, 2, 3, 4].flatMap((n) => passage({ passage: `s:${n}` }));
		const ctx = gestureSeries([...ballad, change(0, { passage: 'b:0', scope: 'blues-f' })]);
		await ctx.controller.start();
		await playAllRight(ctx);
		expect(await ctx.repositories.progressions.get('gesture-jam', 'iohefy-a')).toMatchObject({
			exerciseId: 'gesture-jam',
			scope: 'iohefy-a',
			mechanic: 'chord-grid',
			tempoBpm: 125
		});
		expect(await ctx.repositories.progressions.get('gesture-jam', 'blues-f')).toBeUndefined();
		expect(await ctx.repositories.progressions.get('gesture-jam')).toBeUndefined();
	});
});

describe('the chord sensor of a change (twoSensors)', () => {
	/** A sensor the gesture does not listen to, open because another mechanic of the series does. */
	function noteOnTheSide() {
		const told: unknown[] = [];
		let listener: ((observation: Observation) => void) | null = null;
		const note: SensorFactory = () => ({
			onObservation: (callback) => {
				listener = callback;
				return () => (listener = null);
			},
			expect: (expectation) => told.push(expectation)
		});
		const other: MechanicPresenter = {
			...chordGridPresenter,
			sensors: ['note']
		} as MechanicPresenter;
		return {
			told,
			emit: (time: number) => listener?.({ time, payload: { midi: 62 }, readable: true }),
			options: { mechanics: { ...GESTURE_PRESENTERS, other }, sensors: { note } }
		};
	}

	it('gives the chord sensor its expectation, and nothing to a sensor it does not listen to', async () => {
		const side = noteOnTheSide();
		const ctx = gestureSeries(passage(), side.options);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(0.75));
		expect(ctx.verifier.expectations.at(-1)?.expected).toContain(rightShape(change(0)));
		expect(side.told.at(-1)).toBeNull();
	});

	it('files an observation of a sensor it does not listen to as another sensor', async () => {
		const side = noteOnTheSide();
		const ctx = gestureSeries(passage(), side.options);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1));
		side.emit(ctx.bar(1) - 0.05);
		ctx.play(ctx.bar(1), rightShape(change(0)));
		ctx.runTo(ctx.bar(2));
		await drain();
		const [attempt] = await ctx.stored();
		expect(attempt.observations?.map((o) => [o.sensor, o.fate, o.correct])).toEqual([
			['note', 'other-sensor', null],
			['chord', 'answer', true]
		]);
	});

	/** The gesture's presenter, the change before each expectation noted. */
	function noting() {
		const rounds: [number, number | null][] = [];
		const presenter: MechanicPresenter = {
			...chordGridPresenter,
			expectation: (item, round) => {
				const previous = round.previous?.item as ChordGridItem | undefined;
				rounds.push([(item as ChordGridItem).index, previous?.index ?? null]);
				return chordGridPresenter.expectation!(item as ChordGridItem, round);
			}
		} as MechanicPresenter;
		return { rounds, options: { mechanics: { 'chord-grid': presenter } } };
	}

	it('tells the expectation the change before it', async () => {
		const noted = noting();
		const ctx = gestureSeries(passage(), noted.options);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(2));
		expect(noted.rounds).toEqual([
			[0, null],
			[1, 0]
		]);
	});

	it('tells no change before the first one after a pause: nothing rings any more', async () => {
		const noted = noting();
		const ctx = gestureSeries(passage(), noted.options);
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1));
		ctx.controller.pause();
		ctx.controller.resume();
		await drain();
		runToBeat(ctx, 3);
		expect(noted.rounds).toEqual([
			[0, null],
			[1, null]
		]);
	});

	it('shows a miss at once, settled on the first chord: a later right one changes nothing', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(1)));
		expect(ctx.controller.view.status).toBe('verdict');
		expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'wrong' }]);
		ctx.runTo(ctx.bar(1) + 0.3);
		ctx.play(ctx.bar(1) + 0.3, rightShape(change(0)));
		expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'wrong' }]);
		ctx.runTo(ctx.bar(2));
		await drain();
		const [attempt] = await ctx.stored();
		expect([responseVerdictOf(attempt), attempt.correct, attempt.success]).toEqual([
			'wrong',
			false,
			false
		]);
		expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
	});

	it('draws a wrong chord in the change it settles, in the player’s style, until the next change', async () => {
		const ctx = gestureSeries(passage());
		await ctx.repositories.settings.update({ chordDiagram: 'grid' });
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(1)));
		expect(model(ctx).miss).toEqual({
			heard: { notes: expect.any(Array) },
			expected: { notes: expect.any(Array) },
			gap: expect.any(String),
			style: 'grid'
		});
		ctx.runTo(ctx.bar(2) - 0.2);
		expect(model(ctx)).toMatchObject({ index: 1, miss: null });
	});

	it('draws nothing after a right chord', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
		expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'perfect' }]);
		expect(model(ctx).miss).toBeNull();
	});

	it('draws chords as the player chose, unless the exercise says', async () => {
		const chosen = gestureSeries(passage());
		await chosen.repositories.settings.update({ chordDiagram: 'grid' });
		await chosen.controller.start();
		chosen.runTo(chosen.bar(1));
		expect(chosen.controller.view.chordDiagram).toBe('grid');

		const exercise = (id: string) => ({ ...exerciseById(id), chordDiagram: 'strings' as const });
		const imposed = gestureSeries(passage(), { exercise });
		await imposed.repositories.settings.update({ chordDiagram: 'grid' });
		await imposed.controller.start();
		imposed.runTo(imposed.bar(1));
		expect(imposed.controller.view.chordDiagram).toBe('strings');
	});
});

describe('the miss of a passage’s last change (shown until the count starts)', () => {
	const LINK_SHAPES = ['2-3-2', '7-7-5'].map((frets) => shapeId('D', 'maj', G_B_E, frets));

	/** A link tour of two changes, D on G-B-E, at ♩ = 120 like the jam. */
	function linkTour(id: string, restBars?: number): PlannedItem[] {
		return [0, 1].map((index) => {
			const { tempoScope: _scope, ...base } = change(index, {
				passage: id,
				exerciseId: 'gesture-link'
			});
			const item: ChordGridItem = {
				...(base.item as ChordGridItem),
				rule: 'link',
				element: 'link:D|maj:3,2,1',
				chord: 'D|maj',
				symbol: 'D',
				changes: [
					{ at: 0, length: 4, symbol: 'D' },
					{ at: 4, length: 4, symbol: 'D' }
				],
				shape: LINK_SHAPES[index]
			};
			return { ...base, item, ...(index === 0 && restBars && { restBars }) };
		});
	}

	const LINK_EXECUTIONS = [...EXECUTIONS, { exerciseId: 'gesture-link', tempoBpm: 120 }];

	/** The drawn miss, the contest offer and the change shown, read at `time`. */
	function at(ctx: Ctx, time: number) {
		ctx.runTo(time);
		const shown = model(ctx) as unknown as {
			miss: unknown;
			anchorBeat: number | null;
		};
		return {
			miss: shown.miss !== null,
			anchored: shown.anchorBeat !== null,
			contest: ctx.controller.view.contest
		};
	}

	it('draws a grid’s last change missed with no chord through the rest bar, until the count starts', async () => {
		const ctx = gestureSeries([...passage(), ...passage({ passage: 's:1', restBars: 1 })], {
			development: true
		});
		await ctx.controller.start();
		ctx.runTo(ctx.bar(2) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
		// Nothing heard on the last change: it settles wrong at its handover (bar 3 − 0.2 s).
		expect(at(ctx, ctx.bar(3) - 0.15)).toEqual({
			miss: true,
			anchored: true,
			contest: 'available'
		});
		// Bar 3 rests in silence: the miss and its offer stay.
		expect(at(ctx, ctx.bar(4) - 0.05)).toEqual({
			miss: true,
			anchored: true,
			contest: 'available'
		});
		expect(model(ctx)).toMatchObject({ index: 1, history: [expect.anything(), expect.anything()] });
		// Bar 4 counts: the next passage's first change waits there, not yet placed.
		expect(at(ctx, ctx.bar(4) + 0.05)).toEqual({ miss: false, anchored: false, contest: null });
		expect(model(ctx)).toMatchObject({ index: 0 });
		expect(ctx.controller.view.countdown).toBe(4);
	});

	it('draws a link tour’s last shape missed until the count starts', async () => {
		const ctx = gestureSeries([...linkTour('s:0'), ...linkTour('s:1', 1)], {
			executions: LINK_EXECUTIONS
		});
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, LINK_SHAPES[0]);
		ctx.runTo(ctx.bar(2) + 0.02);
		// The lowest shape played again where the next one is asked.
		ctx.play(ctx.bar(2) + 0.02, LINK_SHAPES[0]);
		expect(ctx.controller.view.stage?.view).toBe('link-lane');
		expect(at(ctx, ctx.bar(3) - 0.15)).toMatchObject({ miss: true, anchored: true });
		expect(at(ctx, ctx.bar(4) - 0.05)).toMatchObject({ miss: true, anchored: true });
		expect(at(ctx, ctx.bar(4) + 0.05)).toMatchObject({ miss: false, anchored: false });
		const attempts = await ctx.stored();
		expect(attempts.map((a) => responseVerdictOf(a))).toEqual(['perfect', 'wrong']);
	});
});

describe('« Joué juste » on a change', () => {
	/** A wrong chord on the first change, in development or not. */
	async function missed(development: boolean) {
		const ctx = gestureSeries(passage(), { development });
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(1)));
		await drain();
		return ctx;
	}

	it('offers to contest a miss in development, and labels its attempt', async () => {
		const ctx = await missed(true);
		expect(ctx.controller.view.contest).toBe('available');
		ctx.controller.contest();
		expect(ctx.controller.view.contest).toBe('done');
		await drain();
		expect((await ctx.stored())[0].contested).toBe(true);
	});

	// Accepted difference: « Joué juste » is a development tool now (docs/vision.md).
	it('never offers it outside development', async () => {
		const ctx = await missed(false);
		expect(ctx.controller.view.contest).toBeNull();
		ctx.controller.contest();
		await drain();
		expect((await ctx.stored())[0].contested).toBeUndefined();
	});

	it('offers nothing after a success', async () => {
		const ctx = gestureSeries(passage(), { development: true });
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
		await drain();
		expect(ctx.controller.view.contest).toBeNull();
		ctx.controller.contest();
		expect(ctx.controller.view.contest).toBeNull();
	});

	it('withdraws the offer when the next change comes, or on pause', async () => {
		const ctx = await missed(true);
		ctx.runTo(ctx.bar(2) - 0.2);
		expect(model(ctx).index).toBe(1);
		expect(ctx.controller.view.contest).toBeNull();

		const paused = await missed(true);
		paused.controller.pause();
		expect(paused.controller.view.contest).toBeNull();
	});
});
