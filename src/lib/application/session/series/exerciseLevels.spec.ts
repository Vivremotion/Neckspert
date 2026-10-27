import { describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { RHYTHM_OFFBEATS } from '$lib/domain/exercise/rhythmCatalog';
import type { CycleReport } from '$lib/domain/time';
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

/** Runs of two rounds at level 1, of three at level 2. */
const RUNS: ExerciseDefinition = {
	...CLIMB,
	id: 'runs',
	params: { pacing: { roundsPerBreath: 2 } },
	levels: [{ params: {}, pass: { successes: 1 } }, { params: { 'pacing.roundsPerBreath': 3 } }]
};

/** Two aid levels below level 1, the anti-blocking asked. */
const AIDS: ExerciseDefinition = {
	...BLOCKING,
	id: 'aids',
	levels: [
		{ aid: true, params: { tempo: 60 } },
		{ aid: true, params: { tempo: 70 } },
		...(CLIMB.levels ?? [])
	]
};

/** The next round goes on without a gap. */
const CHAINS = { chains: true, countIn: false };
/** The next round comes after the breath of its plan, no count. */
const FOLLOWS = { chains: false, countIn: false };

function stored(exerciseId: string, scope: string, level: number): LevelState {
	return { exerciseId, scope, item: '', level, successes: 0, failures: 0, resumeAfter: null };
}

async function setup(states: LevelState[] = []) {
	const repository = new InMemoryLevelStateRepository();
	for (const state of states) await repository.put(state);
	const definitions = [CLIMB, BLOCKING, PLAIN, RUNS, AIDS, RHYTHM_OFFBEATS];
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
		await levels.settle({ exerciseId: 'runs', level: 0, success: true, aided: false });
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
		await levels.settle({ exerciseId: 'runs', level: 0, success: true, aided: false });
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
			next: { role: 'round', aid: null, remedy: false }
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

	it('ends with « On change d’air » once the anti-blocking says so', async () => {
		const { levels } = await setup();
		for (let i = 0; i < 3; i++) await levels.settle(round(false, 'blues-f', 'blocking'));
		const at = { exerciseId: 'blocking', scope: 'blues-f' };
		expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({
			role: 'end',
			reason: 'change-of-air'
		});
	});

	it('announces any aid level as one, a deeper one too', async () => {
		const { levels } = await setup([stored('aids', '', -1)]);
		for (let i = 0; i < 3; i++) {
			await levels.settle({ exerciseId: 'aids', level: -1, success: false, aided: false });
		}
		expect(levels.reached('aids')).toBe(-2);
		expect(levels.apply('aids')).toBe('aid-level');
		expect(levels.played('aids')).toBe(-2);
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
		const { levels } = await setup();
		const at = { exerciseId: RHYTHM_OFFBEATS.id };
		levels.boundary(at, 0, 1000, { chains: false, countIn: true });
		levels.askListen(RHYTHM_OFFBEATS.id);
		expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({ role: 'listen', remedy: false });
		expect(levels.boundary(at, 0, 1000, CHAINS).next.role).toBe('round');
		// A template has nothing to hear.
		levels.boundary({ exerciseId: 'climb' }, 0, 1000, { chains: false, countIn: true });
		levels.askListen('climb');
		expect(levels.boundary({ exerciseId: 'climb' }, 0, 1000, CHAINS).next.role).toBe('round');
	});

	it('forgets the run and the listen asked when play stops', async () => {
		const { levels } = await setup();
		const at = { exerciseId: RHYTHM_OFFBEATS.id };
		levels.boundary(at, 0, 1000, { chains: false, countIn: true });
		levels.askListen(RHYTHM_OFFBEATS.id);
		levels.interrupt();
		// A new run, no breath before it, and the listen forgotten.
		expect(levels.boundary(at, 0, 1000, { chains: false, countIn: true })).toEqual({
			breath: false,
			next: { role: 'round', aid: null, remedy: false }
		});
	});

	it('reads a reading block of cycles and gives their remedies', async () => {
		const { levels } = await setup();
		const at = { exerciseId: RHYTHM_OFFBEATS.id };
		levels.boundary(at, 0, 1000, { chains: false, countIn: true });
		// The same note missed three times.
		const report = {
			expectations: [{ index: 3, verdict: 'missed', offsetMs: null }],
			dropped: [],
			extra: 0,
			shift: null,
			measures: {},
			latency: null
		} as unknown as CycleReport;
		for (let i = 0; i < 3; i++) {
			await levels.settle({
				exerciseId: RHYTHM_OFFBEATS.id,
				item: 'offbeats-1@0',
				level: 0,
				success: false,
				aided: false,
				report,
				verdict: { passed: false, reasons: ['missed'] },
				spotMs: 187.5
			});
		}
		expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({ role: 'listen', remedy: true });
		expect(levels.boundary(at, 0, 1000, CHAINS).next).toEqual({
			role: 'round',
			aid: 'play-along',
			remedy: true
		});
	});

	it('names the measure that breaks once the air changes, and the level reached', async () => {
		const { levels } = await setup();
		expect(levels.breaking()).toBeNull();
		for (let i = 0; i < 3; i++) {
			await levels.settle({
				exerciseId: 'blocking',
				scope: 'blues-f',
				level: 0,
				success: false,
				aided: false,
				verdict: { passed: false, reasons: ['regularity'] },
				spotMs: 0
			});
		}
		expect(levels.breaking()).toBe('regularity');
		expect(levels.reached('blocking', 'blues-f')).toBe(0);
	});
});
