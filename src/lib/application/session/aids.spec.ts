import { describe, expect, it } from 'vitest';
import { cycleAids, levelAided } from './aids';

describe('cycleAids', () => {
	const plain = { cursor: true, listen: 'free' as const, aidLevel: false, playAlong: false };
	it('names the cursor the level gives, a listen worth an aid, and an aid level', () => {
		expect(cycleAids({ ...plain, listened: false })).toEqual(['cursor']);
		expect(
			cycleAids({ cursor: false, listen: 'aid', aidLevel: true, listened: true, playAlong: false })
		).toEqual(['listen', 'aid-level']);
		// Listening is free at this level: it is no aid.
		expect(cycleAids({ ...plain, listened: true })).toEqual(['cursor']);
	});

	it('names playing along, which the level never gives', () => {
		const aids = cycleAids({ ...plain, listened: false, playAlong: true });
		expect(aids).toContain('play-along');
		expect(levelAided(aids, true)).toBe(true);
	});
});

describe('levelAided', () => {
	it('counts only the aids beyond the level’s own cursor and aid level', () => {
		expect(levelAided(['cursor', 'aid-level'], true)).toBe(false);
		expect(levelAided(['cursor', 'listen'], true)).toBe(true);
		// A cursor the level does not give is an aid.
		expect(levelAided(['cursor'], false)).toBe(true);
	});
});
