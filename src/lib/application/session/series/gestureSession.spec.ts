import { describe, expect, it, vi } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import { passageIndices } from '$lib/domain/exercise/passage/indices';
import type { ChangeData, ChangeItem } from '$lib/domain/sets';
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
import type { Picture } from '$lib/application/presentation/pictures';
import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import { GESTURE_EXERCISE_IDS, LOCATE_NECK_ID } from '$lib/testing/catalogIds';
import { changePresenter } from '$lib/application/sets/chordGrid';
import type { SetPresenter } from '$lib/application/sets/types';
import { createAppServices } from '$lib/application/services/createAppServices';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import type { PlaySessionController } from '$lib/application/session/contract';
import type { Observation, SensorFactory } from '$lib/application/session/sensors';
import { chordSensor, noteSensor, tapSensor } from '$lib/application/session/sensors';
import {
	FakeChordVerifier,
	FakeClock,
	FakeDiagnostics,
	FakeNoteDetector,
	FakeSoundScheduler,
	FakeTakeBuffer,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository,
	FakeDefinitionsService
} from '$lib/testing/fakes';
import {
	change,
	clicksBetween,
	drain,
	expectationsAsked,
	gestureSeries,
	linkChange,
	LINK_FRETS,
	model,
	passage,
	rightShape,
	ScriptedSource,
	type Ctx
} from '$lib/testing/gestureSeries';
import { shapeId, triadCards } from '$lib/testing/shapes';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import { triadOf } from '$lib/domain/grid';
import type { LevelState } from '$lib/domain/time';
import { SessionController } from '../SessionController.svelte';

/**
 * The gesture's scenarios of the old controller (`gestureEndToEnd`, `chainedRounds`, `countdown`,
 * `briefing`, `scope`, `twoSensors`), played on the session controller: the acceptance test of
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

/**
 * The app's services on fakes, `cards` acquired and `levels` stored; a gesture session started
 * from them.
 */
async function appSession(
	cards: CardState[],
	levels: LevelState[] = [],
	start: (services: ReturnType<typeof createAppServices>) => Promise<PlaySessionController> = (
		services
	) => services.startRoutine('changes')
) {
	const clock = new FakeClock();
	const detector = new FakeNoteDetector();
	const chords = new FakeChordVerifier();
	const sounds = new FakeSoundScheduler(clock);
	const deps = {
		clock,
		detector,
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => 'gesture-session',
		presenters: SET_PRESENTERS,
		views: VIEW_PRESENTERS,
		sensors: { note: noteSensor(detector), tap: tapSensor(), chord: chordSensor(chords) },
		sounds,
		takes: new FakeTakeBuffer(),
		memory: new SessionMemory(),
		levels: new InMemoryLevelStateRepository()
	};
	await deps.cards.putMany(cards);
	for (const state of levels) await deps.levels.put(state);
	const services = createAppServices({
		...deps,
		backup: new FakeBackup(),
		definitions: new FakeDefinitionsService(),
		calibration: new FakeCalibration(),
		diagnostics: new FakeDiagnostics()
	});
	const controller = await start(services);
	expect(controller).toBeInstanceOf(SessionController);
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
	choose: (expectation: ChordExpectation, n: number) => string | null,
	/** Called at every step, after the clock moved. */
	watch: () => void = () => {}
): Promise<Played[]> {
	const { clock, sounds, chords, controller } = app;
	const played: Played[] = [];
	let told = chords.expectations.length;
	let due: { time: number; expectation: ChordExpectation } | null = null;
	for (let step = 0; step < 100_000 && played.length < changes; step++) {
		clock.advance(0.01);
		sounds.flush();
		watch();
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
const dataOf = (attempt: Attempt) => attempt.data as ChangeData;
const passageIdOf = (attempt: Attempt) => dataOf(attempt).passage!.id;

/** The attempts of each passage, in order. */
function byPassage(attempts: readonly Attempt[]): Attempt[][] {
	const passages = new Map<string, Attempt[]>();
	for (const attempt of attempts) {
		passages.set(passageIdOf(attempt), [...(passages.get(passageIdOf(attempt)) ?? []), attempt]);
	}
	return [...passages.values()];
}

/** The cards of iohefy-a's triads, acquired in `skill` on `set`. */
const IOHEFY_TRIADS = [
	['D', 'min'],
	['G', 'maj'],
	['C', 'maj'],
	['F', 'maj'],
	['E', 'min'],
	['Eb', 'min'],
	['Ab', 'maj']
] as const;
const iohefyCards = (skill: 'chord-anchor' | 'chord-zone', set: readonly (3 | 4 | 2 | 1)[]) =>
	IOHEFY_TRIADS.flatMap(([root, quality]) => triadCards(skill, root, quality, set));

describe('a gesture session on the session controller, end to end', () => {
	it('links D on G-B-E right: seven changes, no card, the passage won, no aid kept', async () => {
		const cards = triadCards('chord-anchor', 'D', 'maj', G_B_E);
		const app = await appSession(cards);
		const played = await play(app, 14, right);
		await finish(app);

		expect(played.slice(0, 7).map((p) => p.decided)).toEqual(
			['2-3-2', '7-7-5', '11-10-10', '14-15-14', '11-10-10', '7-7-5', '2-3-2'].map((frets) =>
				shapeId('D', 'maj', G_B_E, frets)
			)
		);
		const attempts = await app.deps.attempts.all();
		expect(attempts.slice(0, 14).every((a) => a.correct && a.skill === 'inversion-run')).toBe(true);
		expect(attempts.slice(0, 14).every((a) => a.success && a.tempoBpm === 80)).toBe(true);
		const passages = new Set(attempts.map(passageIdOf));
		expect(passages.size).toBeGreaterThanOrEqual(2);
		expect(attempts.slice(0, 14).every((a) => a.aids === undefined)).toBe(true);
		expect(await app.deps.cards.all()).toEqual(cards);
		// Ten right changes in a row moved the link up a level: its next tour would play at 85.
		expect(
			await app.deps.levels.get({ exerciseId: 'inversion-run', scope: '', item: '' })
		).toMatchObject({ level: 1 });

		const summary = await app.services.sessionSummary(app.controller.sessionId);
		expect(summary.exercises[0]).toMatchObject({
			exerciseId: 'inversion-run',
			passages: { passed: 2 },
			tempo: { first: 80, last: 80 }
		});
	});

	it('climbs iohefy-a, refuses a shape that does not climb, and jams it', async () => {
		const app = await appSession(iohefyCards('chord-anchor', G_B_E));
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
		expect(exercises.slice(0, 7).every((id) => id === 'inversion-run')).toBe(true);
		expect(exercises.slice(7, 16).every((id) => id === 'grid-in-direction')).toBe(true);
		expect(exercises.slice(16, 25).every((id) => id === 'grid-reading')).toBe(true);
		expect(attempts.slice(7, 25).map((a) => a.scope)).toEqual(Array(18).fill('iohefy-a'));

		const missed = attempts[9];
		expect(dataOf(missed)).toMatchObject({
			item: { grid: 'iohefy-a', index: 2 },
			passage: { index: 'grid=iohefy-a;strings=3,2,1', rank: 2, each: { direction: 'up' } }
		});
		expect(missed).toMatchObject({
			correct: false,
			success: false,
			verdict: { relation: 'response' }
		});
		expect(responseVerdictOf(missed)).toBe('wrong');
		expect(dataOf(missed).confusion).toEqual({ kind: 'not-higher', part: 'chord' });
		// The G still ringing was never a candidate of that change.
		const ringing = played[8].decided;
		expect(ringing).not.toBeNull();
		expect(played[9].expectation.candidates.map((c) => c.id)).not.toContain(ringing);
		// Each change keeps the key the old rule wrote: its grid and its rank.
		expect(attempts.slice(7, 16).map((a) => a.cardKey)).toEqual(
			[...Array(9).keys()].map((rank) => `grid-in-direction:iohefy-a#${rank}`)
		);
		expect(attempts.filter((a) => a.exerciseId === 'grid-in-direction' && !a.correct)).toHaveLength(
			1
		);
		expect(attempts.slice(16, 25).every((a) => a.correct)).toBe(true);

		const summary = await app.services.sessionSummary(app.controller.sessionId);
		expect(summary.exercises.map((e) => e.exerciseId)).toEqual([
			'inversion-run',
			'grid-in-direction',
			'grid-reading'
		]);
		expect(summary.misses).toEqual([
			expect.objectContaining({ exerciseId: 'grid-in-direction', symbol: 'Dm7', heard: '2-3-1' })
		]);
	});

	it('plays a failed link tour again whole, after a counted bar, at the level it failed at', async () => {
		const app = await appSession(triadCards('chord-anchor', 'D', 'maj', G_B_E));
		// Nothing right in the first tour (7 changes), then right.
		await play(app, 14, (expectation, n) => (n < 7 ? null : right(expectation)));
		await finish(app);
		const attempts = await app.deps.attempts.all();
		const [first, second] = byPassage(attempts);
		expect(first.every((a) => !a.success)).toBe(true);
		// The same index again, its seven shapes from the lowest: nothing left out.
		expect(second.map((a) => a.cardKey)).toEqual(first.map((a) => a.cardKey));
		expect(second.map((a) => dataOf(a).passage!.rank)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(new Set(attempts.map((a) => dataOf(a).passage!.index))).toEqual(
			new Set(['chord=D;strings=3,2,1'])
		);
		// Not chained: a counted bar between the tours, no rest; a counted change is prompted a
		// beat before its target, a chained one at its handover (200 ms before).
		const bar = 4 * 750;
		expect(second[0].promptedAt - first[6].promptedAt).toBeCloseTo(2 * bar - (750 - 200), -1);
		// Seven misses in a row at level 1: the tour comes back at level 1, nothing imposed.
		expect([...first, ...second].every((a) => a.aids === undefined)).toBe(true);
		expect(second.every((a) => a.success)).toBe(true);
		expect(
			await app.deps.levels.get({ exerciseId: 'inversion-run', scope: '', item: '' })
		).toMatchObject({ level: 0, failures: 0, successes: 7, resumeAfter: null });
	});

	it('plays a beginner’s tours at level 1 when nothing is right: nothing ends the session early', async () => {
		// D major acquired on G-B-E: the link alone opens.
		const app = await appSession(triadCards('chord-anchor', 'D', 'maj', G_B_E));
		const played = await play(app, 30, () => null);
		const announced = app.controller.view.announcement;
		await finish(app);
		const attempts = await app.deps.attempts.all();
		// Every change asked was played: tour after tour, all at level 1.
		expect(played).toHaveLength(30);
		expect(byPassage(attempts).length).toBeGreaterThanOrEqual(4);
		expect(attempts.every((a) => !a.success && a.aids === undefined)).toBe(true);
		expect(announced).toBeNull();
		expect(
			await app.deps.levels.get({ exerciseId: 'inversion-run', scope: '', item: '' })
		).toMatchObject({ level: 0, resumeAfter: null });
	});

	it('links each of its 48 indices in the order written, a bar of silence before a new one', async () => {
		expect(passageIndices(exerciseById('inversion-run'))).toHaveLength(48);
		// C major acquired on both groups: the link alone opens, on its two indices.
		const app = await appSession([
			...triadCards('chord-anchor', 'C', 'maj', G_B_E),
			...triadCards('chord-anchor', 'C', 'maj', [4, 3, 2])
		]);
		await play(app, 21, right);
		await finish(app);
		const attempts = await app.deps.attempts.all();
		const tours = byPassage(attempts).slice(0, 3);
		expect(tours.map((tour) => tour.length)).toEqual([7, 7, 7]);
		expect(tours.map((tour) => dataOf(tour[0]).passage!.index)).toEqual([
			'chord=C;strings=3,2,1',
			'chord=C;strings=4,3,2',
			'chord=C;strings=3,2,1'
		]);
		// The keys the old rule wrote: the placed shape asked.
		expect(tours[0].map((a) => a.cardKey)).toEqual(
			[
				'C|maj|3:5,2:1,1:3@0-1-0',
				'C|maj|3:1,2:3,1:5@5-5-3',
				'C|maj|3:3,2:5,1:1@9-8-8',
				'C|maj|3:5,2:1,1:3@12-13-12',
				'C|maj|3:3,2:5,1:1@9-8-8',
				'C|maj|3:1,2:3,1:5@5-5-3',
				'C|maj|3:5,2:1,1:3@0-1-0'
			].map((key) => `inversion-run:${key}`)
		);
		// A new index after a tour: a bar of silence, then the counted bar.
		const bar = 4 * 750;
		expect(tours[1][0].promptedAt - tours[0][6].promptedAt).toBeCloseTo(3 * bar - (750 - 200), -1);
	});

	it('climbs one way then the other from one passage to the next, turning where the neck runs out', async () => {
		const app = await appSession(iohefyCards('chord-anchor', G_B_E));
		// The link (7), the climb (9), the jam (9), the link again (7), the climb again (9).
		await play(app, 41, right);
		await finish(app);
		const climbs = byPassage(
			(await app.deps.attempts.all()).filter((a) => a.exerciseId === 'grid-in-direction')
		);
		const directions = climbs.map((passage) =>
			passage.map((a) => dataOf(a).passage!.each.direction)
		);
		expect(directions.map((passage) => passage[0])).toEqual(['up', 'down']);
		// The first climb runs out of neck on the way up and turns for the rest of its passage.
		// Each shape played is the lowest beyond the one before: the first climb runs out of neck
		// at Em (rank 7) and turns down, then out of neck again below Em's open shape and turns up;
		// the second, down from the start, turns up at once. As the old rule served it.
		expect(directions).toEqual([
			['up', 'up', 'up', 'up', 'up', 'up', 'up', 'down', 'up'],
			['down', 'up', 'up', 'up', 'up', 'up', 'up', 'down', 'up']
		]);
		expect(climbs.flat().every((a) => a.success)).toBe(true);
	});

	it('plays the zones of grid-in-zone in the order written', async () => {
		const app = await appSession([
			...iohefyCards('chord-zone', G_B_E),
			...iohefyCards('chord-zone', [4, 3, 2])
		]);
		await play(app, 27, right);
		await finish(app);
		const zones = byPassage(await app.deps.attempts.all()).map((passage) => [
			...new Set(passage.map((a) => JSON.stringify(dataOf(a).passage!.each.zone)))
		]);
		expect(zones.slice(0, 3)).toEqual([['[1,5]'], ['[6,10]'], ['[11,15]']]);
		const attempts = await app.deps.attempts.all();
		expect(attempts.every((a) => a.exerciseId === 'grid-in-zone' && a.scope === 'iohefy-a')).toBe(
			true
		);
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
/**
 * Plays every change as it opens, on its target, with the shape `shapeOf` gives (by default the
 * first one expected; null: nothing recognized); returns the tempo of each change.
 */
async function playAllRight(
	ctx: Ctx,
	shapeOf: (n: number, expected: string) => string | null = (_n, expected) => expected,
	/** Called at each step, after the clock moved: it may read the view, or pause. */
	watch: () => void = () => undefined
): Promise<number[]> {
	const tempos: number[] = [];
	let told = ctx.verifier.expectations.length;
	let due: { time: number; shape: string | null } | null = null;
	for (let step = 0; step < 50_000 && ctx.controller.view.status !== 'finished'; step++) {
		if (ctx.controller.view.status === 'paused') ctx.controller.resume();
		ctx.runTo(ctx.clock.now() + 0.01);
		watch();
		if (ctx.controller.view.status === 'paused') {
			await drain();
			continue;
		}
		if (ctx.verifier.expectations.length > told) {
			told = ctx.verifier.expectations.length;
			const expectation = ctx.verifier.expectations.at(-1);
			const anchorBeat = model(ctx)?.anchorBeat ?? null;
			if (expectation && anchorBeat !== null) {
				const beatS = 60 / ctx.controller.view.tempoBpm;
				const target = ctx.clock.now() + (anchorBeat - ctx.controller.timeline.nowBeat()) * beatS;
				due = { time: target + 0.02, shape: shapeOf(tempos.length, expectation.expected[0]) };
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
	const JAM = exerciseById('grid-reading').howTo?.fr;
	const ZONE = exerciseById('grid-in-zone').howTo?.fr;

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
			...passage({ passage: 's:1', exerciseId: 'grid-in-zone' })
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
			return id === 'grid-in-zone' ? { ...definition, howTo: undefined } : definition;
		};
		const ctx = gestureSeries(
			[
				...passage(),
				...passage({ passage: 's:1', exerciseId: 'grid-in-zone' }),
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
			'grid-reading',
			'grid-reading',
			'grid-in-zone',
			'grid-in-zone',
			'grid-reading',
			'grid-reading'
		]);
	});
});

describe('a level per exercise and scope', () => {
	it('plays each change at the tempo of its scope, the transport changing tempo between scopes', async () => {
		const ctx = gestureSeries([
			...passage(),
			...passage({ passage: 's:1', scope: 'blues-f' }),
			...passage({ passage: 's:2' })
		]);
		await ctx.controller.start();
		expect(await playAllRight(ctx)).toEqual([120, 120, 60, 60, 120, 120]);
		const attempts = await ctx.stored();
		expect(attempts.map((a) => [a.tempoBpm, a.scope, a.success])).toEqual([
			[120, 'iohefy-a', true],
			[120, 'iohefy-a', true],
			[60, 'blues-f', true],
			[60, 'blues-f', true],
			[120, 'iohefy-a', true],
			[120, 'iohefy-a', true]
		]);
	});

	it('moves the level of a scope on its own attempts only', async () => {
		const ballad = [0, 1, 2, 3, 4].flatMap((n) => passage({ passage: `s:${n}` }));
		const ctx = gestureSeries([...ballad, change(0, { passage: 'b:0', scope: 'blues-f' })], {
			catalogLevels: true
		});
		await ctx.controller.start();
		await playAllRight(ctx);
		const level = (scope: string) =>
			ctx.levels.get({ exerciseId: 'grid-reading', scope, item: '' });
		expect(await level('iohefy-a')).toMatchObject({ level: 1, successes: 0 });
		expect(await level('blues-f')).toMatchObject({ level: 0, successes: 1 });
		expect(await level('')).toBeUndefined();
	});
});

describe('fatigue', () => {
	it('marks fatigue once the last answers fall behind the first, and tells the source', async () => {
		const passages = [0, 1, 2, 3, 4, 5, 6].flatMap((n) => passage({ passage: `s:${n}` }));
		const ctx = gestureSeries(passages);
		await ctx.controller.start();
		// Six changes right, then nothing recognized.
		await playAllRight(ctx, (n, expected) => (n < 6 ? expected : null));
		const attempts = await ctx.stored();
		expect(attempts.map((a) => a.success)).toEqual([
			...Array<boolean>(6).fill(true),
			...Array<boolean>(8).fill(false)
		]);
		expect(ctx.controller.view.fatigueDetected).toBe(true);
		// Before the twelfth answer, the source was told nothing; after it, fatigue.
		expect(ctx.source.asked.slice(0, 12).every((context) => !context.fatigued)).toBe(true);
		expect(ctx.source.asked.at(-1)?.fatigued).toBe(true);
		expect((await ctx.repositories.sessions.get('series-1'))?.fatigueDetected).toBe(true);
	});
});

describe('the chord sensor of a change (twoSensors)', () => {
	/** A sensor the gesture does not listen to, open because another exercise of the series does. */
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
		return {
			told,
			emit: (time: number) => listener?.({ time, payload: { midi: 62 }, readable: true }),
			// A session that plays locate too opens the note sensor.
			options: { plays: [...GESTURE_EXERCISE_IDS, LOCATE_NECK_ID], sensors: { note } }
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
		const presenter: SetPresenter = {
			...changePresenter,
			expectation: (item, round) => {
				const previous = round.previous?.item as ChangeItem | undefined;
				rounds.push([(item as ChangeItem).index, previous?.index ?? null]);
				return changePresenter.expectation!(item as ChangeItem, round);
			}
		} as SetPresenter;
		return {
			rounds,
			options: { presenters: { ...SET_PRESENTERS, change: presenter } }
		};
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
		expect(model(ctx).verdict?.misses).toEqual([
			{
				correction: null,
				heard: { kind: 'shape', notes: expect.any(Array) },
				expected: { kind: 'shape', notes: expect.any(Array) },
				gap: expect.any(String)
			}
		]);
		expect(model(ctx).chordDiagram).toBe('grid');
		ctx.runTo(ctx.bar(2) - 0.2);
		expect(model(ctx)).toMatchObject({ index: 1, verdict: null });
	});

	it('shows each change on the screen model of its passage, its words its presentation’s', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		// The jam on iohefy-a: the change, the title, the line of its passage, no aid at level 1.
		expect(model(ctx)).toMatchObject({
			prompt: { primary: 'Dm7', secondary: 'I Only Have Eyes for You', detail: null },
			rounds: [
				{ at: 0, length: 4, label: 'Dm7', way: null },
				{ at: 4, length: 4, label: 'G7', way: null }
			],
			index: 0,
			aid: null
		});
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
		ctx.runTo(ctx.bar(2) - 0.15);
		expect(model(ctx)).toMatchObject({ prompt: { primary: 'G7' }, index: 1 });
	});

	it('draws nothing after a right chord', async () => {
		const ctx = gestureSeries(passage());
		await ctx.controller.start();
		ctx.runTo(ctx.bar(1) + 0.02);
		ctx.play(ctx.bar(1) + 0.02, rightShape(change(0)));
		expect(model(ctx).history).toEqual([{ beatIndex: 4, verdict: 'perfect' }]);
		expect(model(ctx).verdict?.misses).toEqual([]);
	});

	it('draws chords as the player chose, unless the exercise says', async () => {
		const chosen = gestureSeries(passage());
		await chosen.repositories.settings.update({ chordDiagram: 'grid' });
		await chosen.controller.start();
		chosen.runTo(chosen.bar(1));
		expect(model(chosen).chordDiagram).toBe('grid');

		const exercise = (id: string) => ({ ...exerciseById(id), chordDiagram: 'strings' as const });
		const imposed = gestureSeries(passage(), { exercise });
		await imposed.repositories.settings.update({ chordDiagram: 'grid' });
		await imposed.controller.start();
		imposed.runTo(imposed.bar(1));
		expect(model(imposed).chordDiagram).toBe('strings');
	});
});

describe('the miss of a passage’s last change (shown until the count starts)', () => {
	const LINK_SHAPES = LINK_FRETS.map((frets) => shapeId('D', 'maj', G_B_E, frets));

	/** A link tour of two changes, D on G-B-E, at ♩ = 120 like the jam. */
	function linkTour(id: string, restBars?: number): PlannedItem[] {
		return [0, 1].map((index) => ({
			...linkChange(index, id),
			...(index === 0 && restBars && { restBars })
		}));
	}

	/** The drawn miss, the contest offer and the change shown, read at `time`. */
	function at(ctx: Ctx, time: number) {
		ctx.runTo(time);
		const shown = model(ctx);
		return {
			miss: (shown.verdict?.misses.length ?? 0) > 0,
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
		const ctx = gestureSeries([...linkTour('s:0'), ...linkTour('s:1', 1)]);
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

	// Accepted difference: « Joué juste » is a development tool now (docs/projet.md).
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

describe('the exercise level moving in session (levels)', () => {
	const RIGHT = (_n: number, expected: string) => expected;
	const LEVEL_UP = { kind: 'level-up', level: 1, of: 9, tempoBpm: 85 };
	const passages = (count: number, options: Parameters<typeof passage>[0] = {}) =>
		Array.from({ length: count }, (_, n) => passage({ ...options, passage: `s:${n}` })).flat();
	/** Where (exercise, scope) stands, `successes` right changes in a row at level 0. */
	const standing = (successes: number, exerciseId = 'grid-reading', scope = 'iohefy-a') => ({
		exerciseId,
		scope,
		item: '',
		level: 0,
		successes,
		failures: 0,
		resumeAfter: null
	});
	/** What the frame showed on each beat counted, and once the rounds were open. */
	function frames(ctx: Ctx) {
		const counting: { countdown: number; tempoBpm: number; announcement: unknown }[] = [];
		const open: unknown[] = [];
		let last: number | null = null;
		const watch = () => {
			const { status, countdown, tempoBpm, announcement } = ctx.controller.view;
			if (status === 'count-in' && countdown !== null && countdown !== last) {
				counting.push({ countdown, tempoBpm, announcement });
			}
			last = status === 'count-in' ? countdown : null;
			if (status === 'awaiting') open.push(announcement);
		};
		return { counting, open, watch };
	}
	const levelOf = (ctx: Ctx, exerciseId = 'grid-reading', scope = 'iohefy-a') =>
		ctx.levels.get({ exerciseId, scope, item: '' });

	it('raises the tempo at the next passage after ten right changes', async () => {
		const ctx = gestureSeries(passages(6), { catalogLevels: true });
		const seen = frames(ctx);
		await ctx.controller.start();
		const tempos = await playAllRight(ctx, RIGHT, seen.watch);

		// The tenth right change ends the fifth passage, still at 80; the sixth plays at 85.
		expect(tempos).toEqual([...Array(10).fill(80), 85, 85]);
		expect((await ctx.stored()).map((a) => a.tempoBpm)).toEqual(tempos);
		// Its counted bar, at 85, announces the level and the tempo; the earlier counts nothing.
		// On the count's last beat the change is asked already (its prompt): told no more.
		const announced = seen.counting.filter((frame) => frame.announcement !== null);
		expect(announced.map((frame) => frame.countdown)).toEqual([4, 3, 2]);
		expect(announced.every((frame) => frame.tempoBpm === 85)).toBe(true);
		expect(announced.every((frame) => frame.announcement !== null)).toBe(true);
		expect(announced[0].announcement).toEqual(LEVEL_UP);
		// Gone once the change is asked.
		expect(seen.open.length).toBeGreaterThan(0);
		expect(seen.open.every((announcement) => announcement === null)).toBe(true);
		expect(await levelOf(ctx)).toMatchObject({ level: 1, successes: 2, failures: 0 });
	});

	it('counts a link tour played again in at the level reached', async () => {
		/** A link tour of two changes, D on G-B-E, counted in. */
		const tour = (id: string): PlannedItem[] => [0, 1].map((index) => linkChange(index, id));
		// Eight right changes stored: the tour's last change is the tenth and moves the level up.
		const ctx = gestureSeries([...tour('s:0'), ...tour('s:1'), ...tour('s:2')], {
			catalogLevels: true,
			levelStates: [standing(8, 'inversion-run', '')]
		});
		const seen = frames(ctx);
		await ctx.controller.start();
		const tempos = await playAllRight(ctx, RIGHT, seen.watch);

		// A tour played again is counted in like any passage: it starts at the level reached.
		expect(tempos).toEqual([80, 80, 85, 85, 85, 85]);
		expect(
			seen.counting.filter((frame) => frame.announcement !== null).map((f) => f.tempoBpm)
		).toEqual([85, 85, 85]);
		expect(await levelOf(ctx, 'inversion-run', '')).toMatchObject({ level: 1 });
	});

	it('counts again at the new tempo after a pause in the counted bar', async () => {
		const ctx = gestureSeries(passages(2), {
			catalogLevels: true,
			levelStates: [standing(9)]
		});
		const seen = frames(ctx);
		let paused: { status: string; announcement: unknown } | null = null;
		await ctx.controller.start();
		const tempos = await playAllRight(ctx, RIGHT, () => {
			seen.watch();
			const { view } = ctx.controller;
			if (paused === null && view.status === 'count-in' && view.announcement !== null) {
				ctx.controller.pause();
				paused = { status: view.status, announcement: view.announcement };
			}
		});

		// The first change moved the level up; the passage ends at 80.
		expect(tempos).toEqual([80, 80, 85, 85]);
		// The announcement stays through the pause, and is told again as the count starts over.
		expect(paused).toEqual({ status: 'paused', announcement: LEVEL_UP });
		const announced = seen.counting.filter((frame) => frame.announcement !== null);
		// Paused on the count's first beat, then counted again whole, at 85.
		expect(announced.map((frame) => frame.countdown)).toEqual([4, 4, 3, 2]);
		expect(announced.every((frame) => frame.tempoBpm === 85)).toBe(true);
		// Moved once: two right changes since at level 1, nothing counted twice.
		expect(await levelOf(ctx)).toMatchObject({ level: 1, successes: 2 });
	});

	it('stores the level reached when time runs out before it is played', async () => {
		const ctx = gestureSeries(passages(2), {
			catalogLevels: true,
			levelStates: [standing(9)],
			durationMs: 1
		});
		await ctx.controller.start();
		const tempos = await playAllRight(ctx);

		// The passage begun is played to its end at 80; no other begins.
		expect(tempos).toEqual([80, 80]);
		expect((await ctx.stored()).map((a) => a.tempoBpm)).toEqual([80, 80]);
		expect(await levelOf(ctx)).toMatchObject({ level: 1 });
	});

	it('starts the next session at the stored level', async () => {
		const ctx = gestureSeries([], {
			catalogLevels: true,
			levelStates: [standing(9)],
			durationMs: 1,
			sources: [new ScriptedSource(passage()), new ScriptedSource(passage({ passage: 's:1' }))]
		});
		await ctx.controller.start();
		expect(await playAllRight(ctx)).toEqual([80, 80]);
		await ctx.controller.start();
		await drain();
		expect(ctx.controller.view.tempoBpm).toBe(85);
		expect(await playAllRight(ctx)).toEqual([85, 85]);
		expect((await ctx.stored(ctx.controller.sessionId)).map((a) => a.tempoBpm)).toEqual([85, 85]);
	});
});

describe('the aid level of the changes (Review Focus 4)', () => {
	const CLIMB = 'grid-in-direction';
	const climbs = (count: number, from = 0) =>
		Array.from({ length: count }, (_, n) =>
			passage({ exerciseId: CLIMB, passage: `s:${from + n}` })
		).flat();
	/** What each change showed once open: its level's aid, and the announcement of its counted bar. */
	function watching(ctx: Ctx) {
		const shown: { aid: unknown; tempoBpm: number }[] = [];
		const announced: string[] = [];
		let told = 0;
		const watch = () => {
			const { view } = ctx.controller;
			if (view.status === 'count-in' && view.announcement && announced.at(-1) !== 'told') {
				announced.push(view.announcement.kind, 'told');
			}
			if (view.status !== 'count-in' && announced.at(-1) === 'told') announced.pop();
			if (ctx.verifier.expectations.length > told) {
				told = ctx.verifier.expectations.length;
				if (ctx.verifier.expectations.at(-1)) {
					shown.push({ aid: model(ctx)?.aid ?? null, tempoBpm: view.tempoBpm });
				}
			}
		};
		return { shown, announced, watch };
	}
	const levelOf = (ctx: Ctx, exerciseId = CLIMB) =>
		ctx.levels.get({ exerciseId, scope: 'iohefy-a', item: '' });

	it('writes an aid level under level 1 that draws the shapes admitted, and no anti-blocking', () => {
		for (const id of GESTURE_EXERCISE_IDS) {
			const definition = exerciseById(id);
			// The aid level of the exercise writes its own picture: the shapes admitted.
			expect(definition.levels?.[0]).toEqual({
				aid: true,
				params: { tempo: 80, 'presentation.picture': 'admitted' }
			});
			expect(definition.presentation?.picture).toBeUndefined();
			expect(definition.levels?.slice(1).every((level) => !level.aid)).toBe(true);
			expect(definition.flow).toBeUndefined();
		}
	});

	/** The stored level of `exerciseId` on iohefy-a at the aid level. */
	const atAidLevel = (exerciseId: string) => ({
		exerciseId,
		scope: 'iohefy-a',
		item: '',
		level: -1,
		successes: 0,
		failures: 0,
		resumeAfter: null
	});

	it('the jam at its aid level: every shape of the chord drawn, three right take it to level 1', async () => {
		const jams = [0, 1, 2, 3, 4].flatMap((n) => passage({ passage: `j:${n}` }));
		const ctx = gestureSeries(jams, {
			catalogLevels: true,
			levelStates: [atAidLevel('grid-reading')]
		});
		const seen = watching(ctx);
		await ctx.controller.start();
		await playAllRight(ctx, (_n, expected) => expected, seen.watch);

		const attempts = await ctx.stored();
		expect(attempts.map((attempt) => attempt.success)).toEqual(Array(10).fill(true));
		// The first two passages at the aid level (the third right change moves it up), then level 1.
		expect(seen.shown.map((each) => each.aid !== null)).toEqual([
			...Array(4).fill(true),
			...Array(6).fill(false)
		]);
		expect(seen.announced).toEqual(['level-up']);
		expect(attempts.every((attempt) => attempt.aids === undefined)).toBe(true);
		// The first passage's first change, Dm7 then G7, on the jam's four strings: every place of
		// every shape of Dm drawn as now, every place of G not already drawn as next.
		const placesOf = (chord: string) =>
			new Set(
				chordShapes
					.members({ chord: triadOf(chord), strings: [4, 3, 2, 1] })
					.flatMap((shape) => shape.notes.map(({ string, fret }) => `${string}:${fret}`))
			);
		const now = placesOf('Dm7');
		const next = [...placesOf('G7')].filter((place) => !now.has(place));
		const aid = seen.shown[0].aid as Picture & { kind: 'neck' };
		expect(aid).toMatchObject({ kind: 'neck', strings: [4, 3, 2, 1] });
		const drawn = (isNext: boolean) =>
			aid.notes
				.filter((note) => (note.next === true) === isNext)
				.map(({ string, fret }) => `${string}:${fret}`)
				.sort();
		expect(now.size).toBeGreaterThan(3);
		expect(drawn(false)).toEqual([...now].sort());
		expect(drawn(true)).toEqual(next.sort());
		expect(await levelOf(ctx, 'grid-reading')).toMatchObject({
			level: 0,
			successes: 6,
			failures: 0
		});
	});

	it('draws the shapes admitted at the levels that name them only, whatever their rank (D6)', async () => {
		// A climb written in the test: its aid level and its level 2 draw them, its level 1 does not.
		const exercise = (id: string) => {
			const definition = exerciseById(id);
			if (id !== CLIMB) return definition;
			return {
				...definition,
				flow: undefined,
				levels: [
					{ aid: true as const, params: { tempo: 80, 'presentation.picture': 'admitted' } },
					{ params: { tempo: 80 } },
					{ params: { tempo: 80, 'presentation.picture': 'admitted' } }
				]
			};
		};
		const at = async (level: number) => {
			const ctx = gestureSeries(climbs(1), {
				catalogLevels: true,
				exercise,
				levelStates: [
					{
						exerciseId: CLIMB,
						scope: 'iohefy-a',
						item: '',
						level,
						successes: 0,
						failures: 0,
						resumeAfter: null
					}
				]
			});
			const seen = watching(ctx);
			await ctx.controller.start();
			await playAllRight(ctx, () => null, seen.watch);
			return seen.shown.map((each) => each.aid);
		};
		expect((await at(-1)).every((aid) => aid !== null)).toBe(true);
		expect(await at(0)).toEqual([null, null]);
		expect((await at(1)).every((aid) => aid !== null)).toBe(true);
	});

	it('draws no aid at the first passage of an index', async () => {
		const ctx = gestureSeries(climbs(1), { catalogLevels: true });
		const seen = watching(ctx);
		await ctx.controller.start();
		await playAllRight(ctx, () => null, seen.watch);
		expect(seen.shown.map((each) => each.aid)).toEqual([null, null]);
		expect((await ctx.stored()).every((attempt) => attempt.aids === undefined)).toBe(true);
	});

	it('misses in a row at level 1 keep it: nothing drawn, nothing announced, every passage played', async () => {
		const ctx = gestureSeries(climbs(5), { catalogLevels: true });
		const seen = watching(ctx);
		await ctx.controller.start();
		// Four misses, the first two passages whole, then everything right.
		await playAllRight(ctx, (n, expected) => (n < 4 ? null : expected), seen.watch);

		const attempts = await ctx.stored();
		expect(attempts.map((attempt) => attempt.success)).toEqual([
			...Array(4).fill(false),
			...Array(6).fill(true)
		]);
		expect(seen.shown.map((each) => each.aid)).toEqual(Array(10).fill(null));
		expect(seen.announced).toEqual([]);
		expect(attempts.every((attempt) => attempt.aids === undefined)).toBe(true);
		expect(await levelOf(ctx)).toMatchObject({
			level: 0,
			successes: 6,
			failures: 0,
			resumeAfter: null
		});
	});

	it('the climb at its aid level draws every shape admitted now and next, three right take it to level 1', async () => {
		const ctx = gestureSeries(climbs(5), {
			catalogLevels: true,
			levelStates: [atAidLevel(CLIMB)]
		});
		const seen = watching(ctx);
		await ctx.controller.start();
		await playAllRight(ctx, (_n, expected) => expected, seen.watch);

		// The first two passages at the aid level, then level 1.
		expect(seen.shown.map((each) => each.aid !== null)).toEqual([
			...Array(4).fill(true),
			...Array(6).fill(false)
		]);
		// The first change, Dm7, nothing heard before: the lowest G on G-B-E, 4-3-3, the shape the
		// climb goes up to next. It draws on the neck every shape admitted now (Dm7's) and next
		// (G7's), 4-3-3 among them (D5).
		const lowestG = chordShapes.members({ chord: triadOf('G7'), strings: [...G_B_E] })[0];
		expect(lowestG.notes.map(({ string, fret }) => `${string}:${fret}`)).toEqual([
			'3:4',
			'2:3',
			'1:3'
		]);
		const aid = seen.shown[0].aid as Picture & { kind: 'neck' };
		expect(aid).toMatchObject({ kind: 'neck', strings: [3, 2, 1] });
		// Its places drawn (2-3, D, is Dm's too: drawn once, as a note of now).
		expect(aid.notes.map(({ string, fret }) => `${string}:${fret}`)).toEqual(
			expect.arrayContaining(['3:4', '2:3', '1:3'])
		);
		expect(aid.notes.some((note) => note.next)).toBe(true);
		expect(aid.notes.some((note) => !note.next)).toBe(true);
		expect(seen.shown.every((each) => each.tempoBpm === 80)).toBe(true);
		// Announced at the counted bar of the third passage.
		expect(seen.announced).toEqual(['level-up']);
		expect(await levelOf(ctx)).toMatchObject({ level: 0, successes: 6, failures: 0 });
	});

	it('link: a tour at the aid level draws the notes of its shapes, one at level 1 nothing', async () => {
		const tour = (id: string): PlannedItem[] => [0, 1].map((index) => linkChange(index, id));
		// Held at the aid level: two tours there (the third right change moves it up), then level 1.
		const ctx = gestureSeries([...tour('s:0'), ...tour('s:1'), ...tour('s:2')], {
			catalogLevels: true,
			levelStates: [
				{
					exerciseId: 'inversion-run',
					scope: '',
					item: '',
					level: -1,
					successes: 0,
					failures: 0,
					resumeAfter: null
				}
			]
		});
		const seen = watching(ctx);
		await ctx.controller.start();
		await playAllRight(ctx, (_n, expected) => expected, seen.watch);
		// D on G-B-E: 2-3-2 is A, D, F#; 7-7-5 is D, F#, A.
		const first = [
			{ string: 3, fret: 2, name: 'A' },
			{ string: 2, fret: 3, name: 'D' },
			{ string: 1, fret: 2, name: 'F#' }
		];
		const second = [
			{ string: 3, fret: 7, name: 'D' },
			{ string: 2, fret: 7, name: 'F#' },
			{ string: 1, fret: 5, name: 'A' }
		];
		const aided = [
			{ now: first, next: second },
			{ now: second, next: [] }
		];
		/** The notes of the aid's neck, those of now and those of next. */
		const notesOf = (aid: unknown) => {
			if (aid === null) return null;
			const { notes } = aid as Picture & { kind: 'neck' };
			const plain = (next: boolean) =>
				notes
					.filter((note) => (note.next === true) === next)
					.map(({ string, fret, name }) => ({ string, fret, name }));
			return { now: plain(false), next: plain(true) };
		};
		expect(seen.shown.map((each) => notesOf(each.aid))).toEqual([...aided, ...aided, null, null]);
		expect((await ctx.stored()).every((attempt) => attempt.aids === undefined)).toBe(true);
	});

	it('plays every passage served when nothing is right: the jam after the climb, nothing ends early', async () => {
		// The climb's passages, then the jam's.
		const ctx = gestureSeries([...climbs(4), ...passage({ passage: 'j:0' })], {
			catalogLevels: true
		});
		await ctx.controller.start();
		await playAllRight(ctx, () => null);

		const attempts = await ctx.stored();
		expect(attempts.map((attempt) => attempt.exerciseId)).toEqual([
			...Array(8).fill(CLIMB),
			'grid-reading',
			'grid-reading'
		]);
		expect(attempts.every((attempt) => !attempt.success && attempt.aids === undefined)).toBe(true);
		expect(ctx.controller.view.announcement).toBeNull();
		expect(await levelOf(ctx)).toMatchObject({ level: 0, resumeAfter: null });
		expect(await levelOf(ctx, 'grid-reading')).toMatchObject({ level: 0, resumeAfter: null });
	});
});
