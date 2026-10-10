import { describe, expect, it } from 'vitest';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	ChordExpectation
} from '$lib/application/ports';
import { GESTURE_PRESENTERS, NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { createAppServices } from '$lib/application/services/createAppServices';
import type { ChordGridData } from '$lib/domain/mechanics';
import type { Attempt, BackupFile, CardState } from '$lib/domain/types';
import {
	FakeChordVerifier,
	FakeClock,
	FakeDiagnostics,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { shapeId, triadCards } from '$lib/testing/shapes';
import { chordSensor, noteSensor, tapSensor } from './sensors';
import type { SessionDeps } from './SessionDeps';

const G_B_E = [3, 2, 1] as const;

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
	cancel(): void {}
}

async function setup(cards: CardState[]) {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const chords = new FakeChordVerifier();
	const deps: SessionDeps = {
		clock,
		metronome,
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
		sensors: { note: noteSensor(detector), tap: tapSensor(), chord: chordSensor(chords) }
	};
	await deps.cards.putMany(cards);
	const services = createAppServices({
		...deps,
		backup: new FakeBackup(),
		calibration: new FakeCalibration(),
		diagnostics: new FakeDiagnostics()
	});
	const controller = await services.startSession('gesture');
	await controller.start();
	return { services, deps, clock, metronome, chords, controller, briefings: [] as string[] };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** A change as the fake verifier met it: what it was told, and the shape it reported. */
interface Played {
	expectation: ChordExpectation;
	decided: string | null;
}

/**
 * Plays changes until `changes` were played: at each change, the verifier reports the shape
 * `choose` dictates, 20 ms after the change, once the clock gets there.
 */
async function play(
	ctx: Ctx,
	changes: number,
	choose: (expectation: ChordExpectation, n: number) => string | null
): Promise<Played[]> {
	const played: Played[] = [];
	const briefings: string[] = [];
	let lastTarget: number | null = null;
	let due: { time: number; expectation: ChordExpectation } | null = null;
	for (let step = 0; step < 100_000 && played.length < changes; step++) {
		ctx.clock.advance(0.01);
		ctx.metronome.flush();
		// An exercise met for the first time stops on its instruction: « C'est parti ».
		if (ctx.controller.view.status === 'paused' && ctx.controller.view.briefing) {
			briefings.push(ctx.controller.view.briefing.text);
			ctx.controller.resume();
		}
		const target = ctx.controller.view.targetBeatIndex;
		if (target !== null && target !== lastTarget && ctx.metronome.isRunning()) {
			lastTarget = target;
			const expectation = ctx.chords.expectations.at(-1);
			if (!expectation) throw new Error('no expectation for the change');
			due = { time: ctx.metronome.beatTime(target) + 0.02, expectation };
		}
		if (due && ctx.clock.now() >= due.time) {
			const decided = choose(due.expectation, played.length);
			ctx.chords.emit({ time: due.time, windowMs: 250, decided, final: true, variants: [] });
			played.push({ expectation: due.expectation, decided });
			due = null;
		}
		if (step % 50 === 0) await Promise.resolve();
	}
	ctx.briefings.push(...briefings);
	return played;
}

/** Until the round in course settles at its handover, then quits and lets the writes end. */
async function finish(ctx: Ctx) {
	for (let i = 0; i < 400; i++) {
		ctx.clock.advance(0.01);
		ctx.metronome.flush();
	}
	ctx.controller.quit();
	for (let i = 0; i < 50; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

const right = (expectation: ChordExpectation) => expectation.expected[0];
const dataOf = (attempt: Attempt) => attempt.data as ChordGridData;

describe('a gesture session, end to end', () => {
	it('links D on G-B-E right: seven changes, no card, the passage won, the aid gone after it', async () => {
		const cards = triadCards('triad-anchor', 'D', 'maj', G_B_E);
		const ctx = await setup(cards);
		const played = await play(ctx, 14, right);
		await finish(ctx);

		expect(played.slice(0, 7).map((p) => p.decided)).toEqual(
			['2-3-2', '7-7-5', '11-10-10', '14-15-14', '11-10-10', '7-7-5', '2-3-2'].map((frets) =>
				shapeId('D', 'maj', G_B_E, frets)
			)
		);
		const attempts = await ctx.deps.attempts.all();
		expect(attempts.slice(0, 14).every((a) => a.correct && a.mechanic === 'chord-grid')).toBe(true);
		const passages = new Set(attempts.map((a) => dataOf(a).item.passageId));
		expect(passages.size).toBeGreaterThanOrEqual(2);
		expect(attempts.slice(0, 7).every((a) => a.aid === 'show-position')).toBe(true);
		expect(attempts.slice(7, 14).every((a) => a.aid === 'none')).toBe(true);
		expect(await ctx.deps.cards.all()).toEqual(cards);
		expect(await ctx.deps.progressions.get('gesture-link')).toMatchObject({ tempoBpm: 85 });

		const summary = await ctx.services.sessionSummary(ctx.controller.sessionId);
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
		const ctx = await setup(cards);
		// Link (7), then the climb (9), then the jam (9). In the climb's third change (Dm7), a Dm
		// lower than the G just heard.
		const low = shapeId('D', 'min', G_B_E, '2-3-1');
		const played = await play(ctx, 25, (expectation, n) => (n === 9 ? low : right(expectation)));
		await finish(ctx);

		const attempts = await ctx.deps.attempts.all();
		const exercises = attempts.map((a) => a.exerciseId);
		// The link came first, told on the start screen; the climb and the jam each stopped once.
		expect(ctx.briefings).toEqual([
			expect.stringMatching(/^Joue la grille sur le groupe/),
			expect.stringMatching(/^Joue la grille comme tu veux/)
		]);
		expect(exercises.slice(0, 7).every((id) => id === 'gesture-link')).toBe(true);
		expect(exercises.slice(7, 16).every((id) => id === 'gesture-climb')).toBe(true);
		expect(exercises.slice(16, 25).every((id) => id === 'gesture-jam')).toBe(true);

		const missed = attempts[9];
		expect(dataOf(missed).item).toMatchObject({ rule: 'climb', symbol: 'Dm7', direction: 'up' });
		expect(missed).toMatchObject({ correct: false, verdict: 'wrong' });
		expect(dataOf(missed).confusion).toEqual({ kind: 'not-higher', part: 'chord' });
		// The G still ringing was never a candidate of that change.
		const ringing = dataOf(missed).item.previous;
		expect(ringing).toBe(played[8].decided);
		expect(played[9].expectation.candidates.map((c) => c.id)).not.toContain(ringing);
		expect(attempts.filter((a) => a.exerciseId === 'gesture-climb' && !a.correct)).toHaveLength(1);
		expect(attempts.slice(16, 25).every((a) => a.correct)).toBe(true);

		const summary = await ctx.services.sessionSummary(ctx.controller.sessionId);
		expect(summary.gesture?.exercises.map((e) => e.exerciseId)).toEqual([
			'gesture-link',
			'gesture-climb',
			'gesture-jam'
		]);
		expect(summary.gesture?.misses).toEqual([
			expect.objectContaining({ exerciseId: 'gesture-climb', symbol: 'Dm7', heard: '2-3-1' })
		]);
	});
});
