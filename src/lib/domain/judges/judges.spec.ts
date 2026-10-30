import { describe, expect, it } from 'vitest';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingKey,
	type StringNumber
} from '$lib/domain/music';
import { shapeId } from '$lib/testing/shapes';
import type { ChordGridItem } from '$lib/domain/mechanics/chordGrid';
import { contentJudges } from './index';

const G_B_E: StringNumber[] = [3, 2, 1];
const D_ON_B_KEY = voicingKey(
	closeTriadVoicings({ root: parseSpelledNote('D'), quality: qualityById('maj') }, G_B_E)[2]
);

describe('contentJudges', () => {
	it('judges a note on its string as locate does', () => {
		const judge = contentJudges('note');
		// F on the B string: frets 6 and 18, MIDI 65 and 77.
		const value = { string: 2, pitch: 'F' };
		expect(judge.judge(value, { midi: 65 })).toEqual({
			correct: true,
			answer: { midi: 65 },
			confusion: null
		});
		expect(judge.judge(value, { midi: 66 })).toEqual({
			correct: false,
			answer: { midi: 66 },
			confusion: { kind: 'semitone', delta: 1 }
		});
		// The open note of the string, read from the prompt: B (MIDI 59).
		expect(judge.judge(value, { midi: 59 }).confusion).toEqual({ kind: 'string-name' });
	});

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

	it('judges a chord voicing anywhere, or at its position, as the triads do', () => {
		const judge = contentJudges('chord-voicing');
		const right = shapeId('D', 'maj', G_B_E, '2-3-2');
		const octaveUp = shapeId('D', 'maj', G_B_E, '14-15-14');
		const anywhere = { voicingKey: D_ON_B_KEY, position: null };
		expect(judge.judge(anywhere, { decided: right })).toEqual({
			correct: true,
			confusion: null,
			answer: { decided: right }
		});
		expect(judge.judge(anywhere, { decided: octaveUp }).correct).toBe(true);
		const at14 = { voicingKey: D_ON_B_KEY, position: 14 };
		expect(judge.judge(at14, { decided: octaveUp }).correct).toBe(true);
		expect(judge.judge(at14, { decided: right })).toEqual({
			correct: false,
			confusion: { kind: 'other-octave', part: 'chord' },
			answer: { decided: right }
		});
		expect(judge.judge(anywhere, { decided: shapeId('D', 'min', G_B_E, '2-3-1') })).toMatchObject({
			correct: false,
			confusion: { kind: 'other-quality', part: 'chord' }
		});
		expect(judge.judge(anywhere, { decided: null })).toEqual({
			correct: false,
			confusion: { kind: 'none', part: 'chord' },
			answer: { decided: null }
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
	});
});
