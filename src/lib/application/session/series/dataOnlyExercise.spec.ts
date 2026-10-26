import { describe, expect, it } from 'vitest';
import type { NoteLaneModel } from '$lib/application/mechanics/locate';
import type { PlaySessionController } from '$lib/application/session/contract';
import {
	IDENTIFY_NECK,
	LOCATE_NECK,
	validateExercise,
	type ExerciseDefinition
} from '$lib/domain/exercise';
import { neckCardKey, type NeckCard } from '$lib/domain/music';
import { Fraction } from '$lib/domain/time/fraction';
import type { Attempt } from '$lib/domain/types';
import {
	allRight,
	drain,
	learnedCard,
	levelOf,
	locate,
	notesApp,
	playRounds,
	runUntil,
	startNotes,
	type NotesApp
} from '$lib/testing/notesSeries';

/**
 * The acceptance test of plan L: an exercise that exists only here, as data, plays end to end on
 * the app's real wiring with no code of its own. It replaces locate in the catalog the notes'
 * sessions read.
 */
const WALTZ = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };

const WALTZ_LOCATE: ExerciseDefinition = {
	id: LOCATE_NECK.id,
	version: 1,
	mechanic: 'locate',
	view: 'note-lane',
	meter: WALTZ,
	tempo: { fixed: 90 },
	flow: { previewBeats: 2 },
	params: {
		recallThresholdMs: 1500,
		pacing: { respirationBars: 2 },
		windows: { perfectMs: 120 },
		targetBarOffset: '1/4',
		ladder: [
			{ params: { leadBeats: 6, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
			{
				params: { leadBeats: 3, aided: false },
				pass: { successes: 2 },
				drop: { failures: 1 },
				success: 'direct-recall'
			}
		]
	}
};

/** A series keeps one meter: the names the session mixes in are written in 3/4 too. */
const WALTZ_IDENTIFY: ExerciseDefinition = { ...IDENTIFY_NECK, meter: WALTZ };

const BEATS_PER_BAR = 3;
const BEAT_S = 60 / 90;

/** Two notes on other strings, neither the other's mirror, learned and due, at level 0. */
const FIRST = locate(5, 'C');
const SECOND = locate(2, 'G');

const keyOf = (card: NeckCard) => neckCardKey(card);

function lane(controller: PlaySessionController): NoteLaneModel | null {
	const stage = controller.view.stage;
	return stage?.view === 'note-lane' ? (stage.model as NoteLaneModel) : null;
}

async function quitAndRead(app: NotesApp, controller: PlaySessionController): Promise<Attempt[]> {
	controller.quit();
	await drain();
	return app.deps.attempts.listBySession(controller.sessionId);
}

describe('an exercise written only in data', () => {
	it('plays an exercise written only in data', async () => {
		expect(validateExercise(WALTZ_LOCATE)).toBeNull();
		expect(validateExercise(WALTZ_IDENTIFY)).toBeNull();
		const app = await notesApp({
			exercises: [WALTZ_LOCATE, WALTZ_IDENTIFY],
			cards: [learnedCard(FIRST), learnedCard(SECOND)],
			levels: [levelOf(FIRST, 0), levelOf(SECOND, 0)]
		});

		// The first session: both at level 0, a lead of 6 beats.
		const first = await startNotes(app, 'learn');
		const [one] = await playRounds(app, first, allRight, { rounds: 1 });
		await runUntil(app, () => first.view.status === 'verdict');
		// The next note's string shows alone, 2 beats before its prompt.
		let shownAt: number | null = null;
		await runUntil(app, () => {
			if (lane(first)?.anchorBeat === null) shownAt = first.timeline.nowBeat();
			return shownAt !== null;
		});
		const previewPrompt = lane(first)?.promptBeat as number;
		const [two] = await playRounds(app, first, allRight, { rounds: 1 });
		await runUntil(app, () => first.view.status === 'verdict');
		const sounds = app.sounds.emitted();
		const firstAttempts = await quitAndRead(app, first);

		expect(first.view.tempoBpm).toBe(90);
		expect([one, two].map((round) => keyOf(round.card)).sort()).toEqual(
			[keyOf(FIRST), keyOf(SECOND)].sort()
		);
		for (const round of [one, two]) {
			const target = round.anchorBeat as number;
			// Its target on beat 2 of a bar of 3, 6 beats after its prompt.
			expect(target % BEATS_PER_BAR).toBe(1);
			expect(target - (round.promptBeat as number)).toBe(6);
		}
		// After the first target, its breath of 2 bars, then the second prompt.
		expect((two.promptBeat as number) - (one.anchorBeat as number)).toBe(2 * BEATS_PER_BAR);
		expect(previewPrompt).toBe(two.promptBeat);
		expect(shownAt).toBeCloseTo(previewPrompt - 2, 1);
		// The click at ♩ = 90, its accent on beat 1 of each bar of 3; the target on the click after it.
		const clicks = sounds.filter((s) => s.sound === 'click' || s.sound === 'click-accent');
		const accents = clicks.filter((s) => s.sound === 'click-accent').map((s) => s.time);
		for (let i = 1; i < clicks.length; i++) {
			expect(clicks[i].time - clicks[i - 1].time).toBeCloseTo(BEAT_S, 6);
		}
		for (let i = 1; i < accents.length; i++) {
			expect(accents[i] - accents[i - 1]).toBeCloseTo(BEATS_PER_BAR * BEAT_S, 6);
		}
		for (const round of [one, two]) {
			expect(accents.some((time) => Math.abs(round.dueAt - BEAT_S - time) < 0.005)).toBe(true);
		}
		expect(firstAttempts.map((a) => [a.leadBeats, a.tempoBpm, a.success])).toEqual([
			[6, 90, true],
			[6, 90, true]
		]);
		// A success at level 0, where any success counts: both climb to lead 3.
		expect(await app.deps.levels.get(levelOf(FIRST, 0))).toMatchObject({ level: 1 });
		expect(await app.deps.levels.get(levelOf(SECOND, 0))).toMatchObject({ level: 1 });

		// A month later: both at the top, a lead of 3 beats.
		app.clock.advance(30 * 24 * 3600);
		const second = await startNotes(app, 'learn');
		const rounds = await playRounds(app, second, allRight, { rounds: 2 });
		await runUntil(app, () => second.view.status === 'verdict');
		const secondAttempts = await quitAndRead(app, second);
		expect(
			rounds.map((round) => (round.anchorBeat as number) - (round.promptBeat as number))
		).toEqual([3, 3]);
		// Right on the beat, but 3 beats at ♩ = 90 last 2 000 ms, past the 1 500 ms the exercise
		// writes: no direct recall, which the top of its ladder requires, so both drop back.
		expect(secondAttempts.map((a) => [a.leadBeats, a.success])).toEqual([
			[3, true],
			[3, true]
		]);
		expect(await app.deps.levels.get(levelOf(FIRST, 0))).toMatchObject({ level: 0 });
		expect(await app.deps.levels.get(levelOf(SECOND, 0))).toMatchObject({ level: 0 });
	});
});
