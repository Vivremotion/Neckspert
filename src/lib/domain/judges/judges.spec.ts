import { describe, expect, it } from 'vitest';
import type { StringNumber } from '$lib/domain/music';
import { shapeId } from '$lib/testing/shapes';
import type { ChordGridItem } from '$lib/domain/sets/chordGrid';
import { contentJudges } from './index';

const G_B_E: StringNumber[] = [3, 2, 1];

describe('contentJudges', () => {
	it('pitch judges the exact midi', () => {
		const judge = contentJudges('pitch');
		const value = { midi: 64, string: 3 };
		expect(judge.judge(value, { midi: 64 })).toEqual({
			correct: true,
			answer: { midi: 64 },
			confusion: null
		});
		// An octave above is not the note: the figure asks for this pitch.
		expect(judge.judge(value, { midi: 76 }).correct).toBe(false);
		expect(judge.judge(value, { midi: 52 }).correct).toBe(false);
		expect(judge.judge({ midi: 64 }, { midi: 64 }).correct).toBe(true);
	});

	it('pitch judges a payload without a numeric midi as wrong, not as an error', () => {
		// A local exercise can pair a pitch with a sensor that reports none (the attack sensor).
		const judge = contentJudges('pitch');
		for (const payload of [undefined, null, {}, { midi: 'C' }, { onset: 12 }, 64]) {
			expect(judge.judge({ midi: 64 }, payload)).toEqual({
				correct: false,
				answer: null,
				confusion: null
			});
		}
	});

	it('judges a tapped name as identify does', () => {
		const judge = contentJudges('name');
		const value = { string: 2, fret: 6 }; // F
		expect(judge.judge(value, 'F')).toEqual({
			correct: true,
			answer: { pitch: 'F' },
			confusion: null
		});
		expect(judge.judge(value, 'G')).toEqual({
			correct: false,
			answer: { pitch: 'G' },
			confusion: { kind: 'semitone', delta: 2 }
		});
	});

	it('judges a grid change by its rule as the gesture does', () => {
		const judge = contentJudges('chord-grid');
		const link: ChordGridItem = {
			rule: 'link',
			element: 'link:D|maj:3,2,1',
			passageId: 's:0',
			index: 0,
			changes: [{ at: 0, length: 4, symbol: 'D' }],
			symbol: 'D',
			chord: 'D|maj',
			sets: [G_B_E],
			shape: shapeId('D', 'maj', G_B_E, '2-3-2'),
			previous: null
		};
		const right = shapeId('D', 'maj', G_B_E, '2-3-2');
		expect(judge.judge(link, { decided: right })).toEqual({
			correct: true,
			answer: { decided: right },
			confusion: null
		});
		const other = shapeId('D', 'maj', G_B_E, '14-15-14');
		expect(judge.judge(link, { decided: other })).toEqual({
			correct: false,
			answer: { decided: other },
			confusion: { kind: 'other-shape', part: 'chord' }
		});
		expect(judge.judge(link, { decided: null }).confusion).toEqual({ kind: 'none', part: 'chord' });
	});

	it('refuses a content kind it does not know', () => {
		expect(() => contentJudges('kazoo')).toThrow('unknown content kind: kazoo');
		expect(() => contentJudges('toString')).toThrow('unknown content kind: toString');
		// Judged as members of their families since plan 4a.
		expect(() => contentJudges('note')).toThrow('unknown content kind: note');
		expect(() => contentJudges('chord-voicing')).toThrow('unknown content kind: chord-voicing');
	});
});
