import { describe, expect, it } from 'vitest';
import { cardKey, type CardState } from '$lib/domain/types';
import { triadNotesToLearn } from './notes';

const NOW = Date.parse('2026-10-08T10:00:00.000Z');
/** D with its root on B: 2-3-2 and 14-15-14, on G-B-E. */
const D_ON_B = 'D|maj|3:5,2:1,1:3';

function card(mechanic: string, item: unknown, key: string, acquiredAt: number | null): CardState {
	return {
		key: cardKey(mechanic, key),
		mechanic,
		item,
		introducedAt: NOW,
		introducedInSession: 's',
		scheduling: {
			due: NOW,
			stability: 0,
			difficulty: 0,
			elapsedDays: 0,
			scheduledDays: 0,
			learningSteps: 0,
			reps: 0,
			lapses: 0,
			state: 0,
			lastReview: null
		},
		learnedAt: null,
		acquiredAt,
		masteredAt: null
	};
}

describe('triadNotesToLearn', () => {
	it('lists the notes of a triad being anchored, string by string, that locate has not acquired', () => {
		const anchor = card('triad-anchor', { voicingKey: D_ON_B }, D_ON_B, null);
		const knownD = card('locate', { string: 2, pitch: 'D' }, '2:D', NOW);
		expect(triadNotesToLearn([anchor, knownD])).toEqual([
			{ string: 3, pitch: 'A' },
			{ string: 1, pitch: 'F#' }
		]);
	});

	it('leaves out an acquired triad and the open strings', () => {
		const acquired = card('triad-anchor', { voicingKey: D_ON_B }, D_ON_B, NOW);
		// E minor on G-B-E with its root on E: 0-0-0 (open) and 12-12-12 (fret 12: the open notes).
		const em = 'E|min|3:b3,2:5,1:1';
		const open = card('triad-anchor', { voicingKey: em }, em, null);
		expect(triadNotesToLearn([acquired, open])).toEqual([]);
	});
});
