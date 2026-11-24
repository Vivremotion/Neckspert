import { describe, expect, it, vi } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { LevelState } from '$lib/domain/time';
import { InMemoryLevelStateRepository } from '$lib/testing/fakes';
import { ExerciseLevels } from './exerciseLevels';
import { RHYTHM_OFFBEATS } from '$lib/testing/catalog';

/** A data exercise with three tempo levels, each passed after two successes, dropped after two misses. */
const CLIMB: ExerciseDefinition = {
	id: 'climb',
	practices: 'grid-reading',
	params: {},
	tempo: 80,
	levels: [80, 90, 100].map((tempo) => ({
		params: { tempo },
		pass: { successes: 2 },
		drop: { failures: 2 }
	}))
};

/** An exercise that writes no levels: one implicit level, nothing to remember. */
const PLAIN: ExerciseDefinition = { ...CLIMB, id: 'plain', levels: undefined };

/** Runs of two rounds at level 1, of three at level 2. */
const RUNS: ExerciseDefinition = {
	...CLIMB,
	id: 'runs',
	params: { pacing: { roundsPerBreath: 2 } },
	levels: [{ params: {}, pass: { successes: 1 } }, { params: { 'pacing.roundsPerBreath': 3 } }]
};

/**
 * A figure that sounds: played along everywhere but at level 2, which writes `playAlong: false`;
 * heard first at level 3 only.
 */
const SOUNDING: ExerciseDefinition = {
	...RHYTHM_OFFBEATS,
	id: 'sounding',
	params: { ...RHYTHM_OFFBEATS.params, playAlong: true, pacing: { roundsPerBreath: 2 } },
	levels: [{ params: {} }, { params: { playAlong: false } }, { params: { listenFirst: true } }]
};

/** No figure to sound, its levels writing both all the same. */
const SILENT: ExerciseDefinition = {
	...CLIMB,
	id: 'silent',
	levels: [{ params: { listenFirst: true, playAlong: true } }]
};

/** The next round goes on without a gap. */
const CHAINS = { chains: true, countIn: false };
/** The next round comes after the breath of its plan, no count. */
const FOLLOWS = { chains: false, countIn: false };

function stored(exerciseId: string, scope: string, level: number): LevelState {
	return { exerciseId, scope, item: '', level, successes: 0, failures: 0 };
}

async function setup(states: LevelState[] = []) {
	const repository = new InMemoryLevelStateRepository();
	for (const state of states) await repository.put(state);
	const definitions = [CLIMB, PLAIN, RUNS, RHYTHM_OFFBEATS, SOUNDING, SILENT];
	const levels = new ExerciseLevels({
		levels: repository,
		exercise: (id) => {
			const definition = definitions.find((d) => d.id === id);
			if (!definition) throw new Error(`unknown ${id}`);
			return definition;
		}
	});
	await levels.load();
	return { repository, levels };
}

const round = (success: boolean, scope = 'blues-f', exerciseId = 'climb', level = 0) => ({
	exerciseId,
	scope,
	level,
	success
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

	it('brings a stored level outside the levels back into them at the first round (Review Focus)', async () => {
		// -1: a level the migration did not shift, of an exercise it did not know; 99: above the top.
		const { levels } = await setup([
			stored(RHYTHM_OFFBEATS.id, '', -1),
			stored('climb', 'blues-f', 99),
			stored('climb', 'iohefy-a', -1)
		]);
		const top = (RHYTHM_OFFBEATS.levels?.length ?? 0) - 1;
		expect(levels.played(RHYTHM_OFFBEATS.id)).toBe(0);
		expect(levels.played('climb', 'blues-f')).toBe(2);
		expect(levels.played('climb', 'iohefy-a')).toBe(0);
		expect(
			levels.boundary({ exerciseId: RHYTHM_OFFBEATS.id }, 0, 1000, { chains: false, countIn: true })
				.next.role
		).not.toBe('end');
		// Its first round settles at the level brought back, and moves from there.
		for (let i = 0; i < 3; i++) {
			await levels.settle({ exerciseId: RHYTHM_OFFBEATS.id, level: 0, success: true });
		}
		expect(levels.reached(RHYTHM_OFFBEATS.id)).toBe(Math.min(1, top));
	});

	it('starts a never-played exercise at the first of its levels, index 0', async () => {
		const { levels } = await setup();
		expect(levels.played(RHYTHM_OFFBEATS.id)).toBe(0);
		expect(levels.reached('climb', 'blues-f')).toBe(0);
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

	it('keeps playing level 1 however many rounds fail there: nothing ends, nothing rests', async () => {
		const { levels, repository } = await setup();
		const at = { exerciseId: 'climb', scope: 'blues-f' };
		levels.boundary(at, 0, 1000, { chains: false, countIn: true });
		for (let i = 0; i < 6; i++) {
			expect(await levels.settle(round(false))).toBeNull();
			expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({
				role: 'round',
				playAlong: false
			});
		}
		expect(levels.apply('climb', 'blues-f')).toBeNull();
		expect(await repository.get({ exerciseId: 'climb', scope: 'blues-f', item: '' })).toEqual({
			...stored('climb', 'blues-f', 0),
			failures: 6
		});
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

	it('plays runs of the rounds its exercise level writes, a breath between them', async () => {
		const { levels } = await setup();
		const at = { exerciseId: 'runs' };
		const roles = (count: number) =>
			Array.from({ length: count }, () => {
				const { breath, next } = levels.boundary(at, 0, 1000, CHAINS);
				return breath ? `breath+${next.role}` : next.role;
			});
		expect(roles(5)).toEqual(['round', 'round', 'breath+round', 'round', 'breath+round']);
		// The level reached applies at a breath: the runs after it are of three rounds.
		await levels.settle({ exerciseId: 'runs', level: 0, success: true });
		levels.apply('runs');
		expect(roles(5)).toEqual(['round', 'breath+round', 'round', 'round', 'breath+round']);
	});

	it('starts a run again at the level reached once its boundary was decided ahead', async () => {
		const { levels } = await setup();
		const at = { exerciseId: 'runs' };
		const role = () => {
			const { breath, next } = levels.boundary(at, 0, 1000, CHAINS);
			return breath ? `breath+${next.role}` : next.role;
		};
		// A run of two at level 1; the breath is decided before its last round settles.
		expect([role(), role(), role()]).toEqual(['round', 'round', 'breath+round']);
		await levels.settle({ exerciseId: 'runs', level: 0, success: true });
		levels.restartRun('runs');
		levels.apply('runs');
		// Started again at level 2: its first round counted again, a run of three.
		expect(levels.boundary(at, 0, 1000, { chains: false, countIn: true }).next.role).toBe('round');
		expect([role(), role(), role()]).toEqual(['round', 'round', 'breath+round']);
	});

	it('breathes before a counted bar once its run has played', async () => {
		const { levels } = await setup();
		const at = { exerciseId: 'climb', scope: 'blues-f' };
		// The count that opens the series is not a breath.
		expect(levels.boundary(at, 0, 1000, { chains: false, countIn: true })).toEqual({
			breath: false,
			next: { role: 'round', playAlong: false }
		});
		expect(levels.boundary(at, 0, 1000, FOLLOWS).breath).toBe(false);
		expect(levels.boundary(at, 0, 1000, { chains: false, countIn: true }).breath).toBe(true);
	});

	it('ends past the budget at the first round that does not chain, or with the source', async () => {
		const { levels } = await setup();
		const at = { exerciseId: 'climb', scope: 'blues-f' };
		expect(levels.boundary(at, 1000, 1000, CHAINS).next.role).toBe('round');
		expect(levels.boundary(at, 999, 1000, FOLLOWS).next.role).toBe('round');
		expect(levels.boundary(at, 1000, 1000, FOLLOWS).next).toEqual({ role: 'end', reason: 'time' });
		expect(levels.boundary(at, 0, 1000, null).next).toEqual({ role: 'end', reason: 'complete' });
	});

	it('announces a level by its move only: down to the first level is a level down', async () => {
		const { levels } = await setup([stored('climb', 'blues-f', 1)]);
		await levels.settle(round(false, 'blues-f', 'climb', 1));
		await levels.settle(round(false, 'blues-f', 'climb', 1));
		expect(levels.reached('climb', 'blues-f')).toBe(0);
		expect(levels.apply('climb', 'blues-f')).toBe('level-down');
		expect(levels.played('climb', 'blues-f')).toBe(0);
	});

	it('decides without counting when asked to look only', async () => {
		const { levels } = await setup();
		const at = { exerciseId: 'runs' };
		levels.boundary(at, 0, 1000, CHAINS);
		// Looked at, not taken: the run still has its second round to play.
		expect(levels.boundary(at, 0, 1000, CHAINS, { look: true }).next.role).toBe('round');
		expect(levels.boundary(at, 0, 1000, CHAINS).breath).toBe(false);
		expect(levels.boundary(at, 0, 1000, CHAINS).breath).toBe(true);
	});

	it('hears the content asked for, where the level gives listening', async () => {
		// Level 2 of the offbeats: nothing heard first but what is asked.
		const { levels } = await setup([stored(RHYTHM_OFFBEATS.id, '', 1)]);
		const at = { exerciseId: RHYTHM_OFFBEATS.id };
		levels.boundary(at, 0, 1000, { chains: false, countIn: true });
		levels.askListen(RHYTHM_OFFBEATS.id);
		expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({ role: 'listen' });
		expect(levels.boundary(at, 0, 1000, CHAINS).next.role).toBe('round');
		// A template has nothing to hear.
		levels.boundary({ exerciseId: 'climb' }, 0, 1000, { chains: false, countIn: true });
		levels.askListen('climb');
		expect(levels.boundary({ exerciseId: 'climb' }, 0, 1000, CHAINS).next.role).toBe('round');
	});

	it('forgets the run and the listen asked when play stops', async () => {
		const { levels } = await setup([stored(RHYTHM_OFFBEATS.id, '', 1)]);
		const at = { exerciseId: RHYTHM_OFFBEATS.id };
		levels.boundary(at, 0, 1000, { chains: false, countIn: true });
		levels.askListen(RHYTHM_OFFBEATS.id);
		levels.interrupt();
		// A new run, no breath before it, and the listen forgotten.
		expect(levels.boundary(at, 0, 1000, { chains: false, countIn: true })).toEqual({
			breath: false,
			next: { role: 'round', playAlong: false }
		});
	});

	it('plays the model along at every level that writes it, the exercise’s params included', async () => {
		const along = async (level: number) => {
			const { levels } = await setup([stored('sounding', '', level)]);
			const at = { exerciseId: 'sounding' };
			return [
				levels.boundary(at, 0, 1000, { chains: false, countIn: true }),
				levels.boundary(at, 0, 1000, CHAINS),
				levels.boundary(at, 0, 1000, CHAINS)
			].map(({ breath, next }) => (breath ? `breath+` : '') + JSON.stringify(next));
		};
		const round = (playAlong: boolean) => JSON.stringify({ role: 'round', playAlong });
		expect(await along(0)).toEqual([round(true), round(true), `breath+${round(true)}`]);
		expect(await along(1)).toEqual([round(false), round(false), `breath+${round(false)}`]);
		// Level 3 hears the model before each run, then plays along with it.
		expect(await along(2)).toEqual([JSON.stringify({ role: 'listen' }), round(true), round(true)]);
	});

	it('hears the model again when play goes on after a stop during the heard cycle', async () => {
		const { levels } = await setup([stored('sounding', '', 2)]);
		const at = { exerciseId: 'sounding' };
		const opening = { chains: false, countIn: true };
		expect(levels.boundary(at, 0, 1000, opening).next).toEqual({ role: 'listen' });
		levels.interrupt();
		expect(levels.boundary(at, 0, 1000, opening).next).toEqual({ role: 'listen' });
		expect(levels.boundary(at, 0, 1000, CHAINS).next.role).toBe('round');
	});

	it('neither hears nor plays along an exercise with no figure to sound', async () => {
		const { levels } = await setup();
		const at = { exerciseId: 'silent' };
		expect(levels.boundary(at, 0, 1000, { chains: false, countIn: true }).next).toEqual({
			role: 'round',
			playAlong: false
		});
		expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({ role: 'round', playAlong: false });
	});
});

describe('a level write that fails', () => {
	it('is reported, settles the round all the same, and the next write goes on', async () => {
		const { repository, levels } = await setup();
		const put = repository.put.bind(repository);
		const failure = new Error('disk full');
		let calls = 0;
		repository.put = async (state) => {
			if (++calls === 1) throw failure;
			return put(state);
		};
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(levels.settle(round(true))).resolves.toBeNull();
			expect(errors).toHaveBeenCalledWith('[neckspert] level write failed', failure);
			await expect(levels.settle(round(true))).resolves.toBe('up');
			await levels.settled();
			const state = await repository.get({ exerciseId: 'climb', scope: 'blues-f', item: '' });
			expect(state?.level).toBe(1);
		} finally {
			errors.mockRestore();
		}
	});
});
