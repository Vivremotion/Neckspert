import { describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { LevelState } from '$lib/domain/time';
import { InMemoryLevelStateRepository } from '$lib/testing/fakes';
import { ExerciseLevels } from './exerciseLevels';

/** A data exercise with three tempo levels, each passed after two successes, dropped after two misses. */
const CLIMB: ExerciseDefinition = {
	id: 'climb',
	version: 1,
	mechanic: 'chord-grid',
	params: {},
	tempo: 80,
	levels: [80, 90, 100].map((tempo) => ({
		params: { tempo },
		pass: { successes: 2 },
		drop: { failures: 2 }
	}))
};

/** The same exercise asking the anti-blocking; with no aid level, a block changes the air. */
const BLOCKING: ExerciseDefinition = { ...CLIMB, id: 'blocking', flow: { antiBlocking: true } };

/** An exercise that writes no levels: one implicit level, nothing to remember. */
const PLAIN: ExerciseDefinition = { ...CLIMB, id: 'plain', levels: undefined };

function stored(exerciseId: string, scope: string, level: number): LevelState {
	return { exerciseId, scope, item: '', level, successes: 0, failures: 0, resumeAfter: null };
}

async function setup(states: LevelState[] = []) {
	const repository = new InMemoryLevelStateRepository();
	for (const state of states) await repository.put(state);
	const definitions = [CLIMB, BLOCKING, PLAIN];
	const levels = new ExerciseLevels({
		levels: repository,
		exercise: (id) => {
			const definition = definitions.find((d) => d.id === id);
			if (!definition) throw new Error(`unknown ${id}`);
			return definition;
		},
		now: () => 1_000
	});
	await levels.load();
	return { repository, levels };
}

const round = (success: boolean, scope = 'blues-f', exerciseId = 'climb', level = 0) => ({
	exerciseId,
	scope,
	level,
	success,
	aided: false
});

describe('ExerciseLevels', () => {
	it('starts at the stored level of the scope, level 0 without one', async () => {
		const { levels } = await setup([stored('climb', 'blues-f', 2)]);
		expect(levels.played('climb', 'blues-f')).toBe(2);
		expect(levels.played('climb', 'iohefy-a')).toBe(0);
		expect(levels.played('climb')).toBe(0);
	});

	it('clamps a stored level above the exercise’s highest', async () => {
		const { levels } = await setup([stored('climb', 'blues-f', 7)]);
		expect(levels.played('climb', 'blues-f')).toBe(2);
	});

	it('moves up after the passes but plays the old level until apply', async () => {
		const { levels } = await setup();
		expect(await levels.settle(round(true))).toBeNull();
		expect(await levels.settle(round(true))).toBe('up');
		expect(levels.played('climb', 'blues-f')).toBe(0);
		expect(levels.apply('climb', 'blues-f')).toBe('level-up');
		expect(levels.played('climb', 'blues-f')).toBe(1);
		expect(levels.apply('climb', 'blues-f')).toBeNull();
	});

	it('counts no round played at the level left behind', async () => {
		const { levels } = await setup();
		await levels.settle(round(true));
		await levels.settle(round(true));
		// Still played at level 0 until apply: such rounds move nothing.
		expect(await levels.settle(round(false))).toBeNull();
		expect(await levels.settle(round(false))).toBeNull();
		expect(levels.apply('climb', 'blues-f')).toBe('level-up');
	});

	it('moves down after the drops', async () => {
		const { levels } = await setup([stored('climb', 'blues-f', 2)]);
		await levels.settle(round(false, 'blues-f', 'climb', 2));
		expect(await levels.settle(round(false, 'blues-f', 'climb', 2))).toBe('down');
		expect(levels.apply('climb', 'blues-f')).toBe('level-down');
		expect(levels.played('climb', 'blues-f')).toBe(1);
	});

	it('stores the state at each settle', async () => {
		const { levels, repository } = await setup();
		await levels.settle(round(true));
		expect(await repository.get({ exerciseId: 'climb', scope: 'blues-f', item: '' })).toEqual({
			...stored('climb', 'blues-f', 0),
			successes: 1
		});
		await levels.settle(round(true));
		// Stored before it is applied: a change reached as time runs out is kept.
		expect(await repository.get({ exerciseId: 'climb', scope: 'blues-f', item: '' })).toEqual(
			stored('climb', 'blues-f', 1)
		);
		expect(levels.played('climb', 'blues-f')).toBe(0);
	});

	it('keeps scopes apart', async () => {
		const { levels, repository } = await setup();
		await levels.settle(round(true, 'blues-f'));
		await levels.settle(round(true, 'blues-f'));
		expect(
			await repository.get({ exerciseId: 'climb', scope: 'iohefy-a', item: '' })
		).toBeUndefined();
		expect(levels.apply('climb', 'iohefy-a')).toBeNull();
		expect(levels.played('climb', 'iohefy-a')).toBe(0);
		expect(levels.apply('climb', 'blues-f')).toBe('level-up');
	});

	it('never acts the anti-blocking without antiBlocking', async () => {
		const { levels, repository } = await setup();
		for (let i = 0; i < 5; i++) expect(await levels.settle(round(false))).toBeNull();
		expect(levels.apply('climb', 'blues-f')).toBeNull();
		expect(await repository.get({ exerciseId: 'climb', scope: 'blues-f', item: '' })).toEqual({
			...stored('climb', 'blues-f', 0),
			failures: 5
		});
	});

	it('acts the anti-blocking when its exercise asks it', async () => {
		const { levels, repository } = await setup();
		for (let i = 0; i < 3; i++) await levels.settle(round(false, 'blues-f', 'blocking'));
		// No aid level to go down to: the air changes, the exercise rests.
		expect(
			await repository.get({ exerciseId: 'blocking', scope: 'blues-f', item: '' })
		).toMatchObject({ level: 0, resumeAfter: expect.any(Number) });
	});

	it('stores nothing for an exercise that writes no levels', async () => {
		const { levels, repository } = await setup();
		await levels.settle(round(true, 'blues-f', 'plain'));
		expect(await repository.all()).toEqual([]);
		expect(levels.played('plain', 'blues-f')).toBe(0);
	});

	it('waits for its writes', async () => {
		const { levels, repository } = await setup();
		void levels.settle(round(true));
		await levels.settled();
		expect(await repository.all()).toHaveLength(1);
	});
});
