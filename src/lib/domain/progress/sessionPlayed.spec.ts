import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '$lib/domain/types';
import { sessionPlayed } from './sessionPlayed';

const record = (origin: Partial<SessionRecord>): SessionRecord => ({
	id: 's1',
	startedAt: 0,
	endedAt: 1,
	fatigueDetected: false,
	executions: [],
	latencyMs: 0,
	...origin
});

const ids = (played: ReturnType<typeof sessionPlayed>) =>
	played.exercises.map((exercise) => exercise.id);

describe('sessionPlayed', () => {
	it('reads the exercises and skills of the routine a session names', () => {
		const played = sessionPlayed(record({ routine: 'notes' }), []);
		expect(ids(played)).toEqual(['identify-note', 'locate-note-string']);
		expect(played.exerciseIds).toEqual(['identify-note', 'locate-note-string']);
		expect([...played.skills]).toEqual(['identify-note', 'locate-note-string']);
		expect(played.chords).toBe(false);
		expect(played.passages).toBe(false);
	});

	it('tells a session of chords from the item set of its skills', () => {
		expect(sessionPlayed(record({ routine: 'chords' }), []).chords).toBe(true);
		expect(sessionPlayed(record({ routine: 'chords-zone' }), []).chords).toBe(true);
		expect(sessionPlayed(record({ exercise: 'chord-anchor', free: true }), []).chords).toBe(true);
	});

	it('tells a session of passages from its exercises', () => {
		const played = sessionPlayed(record({ routine: 'changes' }), []);
		expect(played.passages).toBe(true);
		expect(played.chords).toBe(false);
		expect(sessionPlayed(record({ exercise: 'grid-reading' }), []).passages).toBe(true);
	});

	it('reads the exercise played alone, whatever its executions and attempts', () => {
		const played = sessionPlayed(
			record({
				exercise: 'chord-anchor',
				free: true,
				executions: [{ exerciseId: 'locate-note-string', tempoBpm: 80 }]
			}),
			[{ exerciseId: 'locate-note-string', skill: 'locate-note-string' }]
		);
		expect(ids(played)).toEqual(['chord-anchor']);
		expect([...played.skills]).toEqual(['chord-anchor']);
	});

	it('falls back on its executions and attempts when its routine or exercise is gone, or unnamed', () => {
		const attempts = [
			{ exerciseId: 'chord-anchor', skill: 'chord-anchor' },
			{ exerciseId: 'gone', skill: 'gone-skill' }
		];
		for (const origin of [{ routine: 'kazoo' }, { exercise: 'kazoo' }, {}]) {
			const played = sessionPlayed(
				record({ ...origin, executions: [{ exerciseId: 'chord-zone', tempoBpm: 85 }] }),
				attempts
			);
			expect(played.exerciseIds).toEqual(['chord-zone', 'chord-anchor']);
			expect(ids(played)).toEqual(['chord-zone', 'chord-anchor']);
			expect([...played.skills].sort()).toEqual(['chord-anchor', 'chord-zone', 'gone-skill']);
			expect(played.chords).toBe(true);
		}
	});

	it('is nothing for a session with nothing to read', () => {
		const played = sessionPlayed(record({}), []);
		expect(played).toEqual({
			exerciseIds: [],
			exercises: [],
			skills: new Set(),
			chords: false,
			passages: false,
			memory: true
		});
	});

	it('tells a session of memory: its skills have cards, or nothing tells otherwise', () => {
		expect(sessionPlayed(record({ routine: 'notes' }), []).memory).toBe(true);
		expect(sessionPlayed(record({ routine: 'changes' }), []).memory).toBe(false);
		expect(sessionPlayed(record({ exercise: 'rhythm-offbeats' }), []).memory).toBe(false);
		// Gone, with its skill: the skill tells. Gone with an unknown skill: nothing tells.
		const gone = (skill: string) =>
			sessionPlayed(record({ exercise: 'kazoo' }), [{ exerciseId: 'kazoo', skill }]).memory;
		expect(gone('inner-pulse')).toBe(false);
		expect(gone('gone-skill')).toBe(true);
	});
});
