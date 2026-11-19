import { describe, expect, it } from 'vitest';
import { admitted, INDEX_DERIVATIONS } from '$lib/domain/families';
import { chordShapes, classifyChordShape } from '$lib/domain/families/guitar/chordShapes';
import { notePlaces } from '$lib/domain/families/guitar/notePlaces';
import { classifyNoteConfusion, parseVoicingKey, voicingOccurrences } from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { CONTENT_JUDGES, contentJudges } from './index';
import { MEMBER_CONTENT, type MemberContent } from './member';

const judge = (value: MemberContent, payload: unknown) =>
	contentJudges(MEMBER_CONTENT).judge(value, payload);

/** F on the B string: frets 6 and 18, MIDI 65 and 77. */
const F_ON_B: MemberContent = {
	family: 'note-places',
	index: { pitch: 'F', string: 2 },
	selection: { family: 'note-places' }
};

const C_KEY = 'C|maj|3:1,2:3,1:5';
const C_SHAPES: MemberContent = {
	family: 'chord-shapes',
	index: INDEX_DERIVATIONS.voicing.index({ voicingKey: C_KEY }, { of: {}, params: {} }),
	selection: { family: 'chord-shapes' }
};

describe('the member judge', () => {
	it('is registered under its kind', () => {
		expect(CONTENT_JUDGES[MEMBER_CONTENT]).toBeDefined();
		expect(contentJudges('member')).toBe(CONTENT_JUDGES.member);
	});

	describe('on note-places', () => {
		it('takes a note at any place admitted, its answer the pitch heard', () => {
			for (const midi of [65, 77]) {
				expect(judge(F_ON_B, { midi })).toEqual({
					correct: true,
					answer: { midi },
					confusion: null
				});
			}
		});

		it('tells a wrong note by the confusion the family gives', () => {
			expect(judge(F_ON_B, { midi: 66 })).toEqual({
				correct: false,
				answer: { midi: 66 },
				confusion: classifyNoteConfusion({ string: 2, pitch: 'F' }, 66)
			});
			expect(judge(F_ON_B, { midi: 66 }).confusion).not.toBeNull();
		});

		it('takes only what the selection admits', () => {
			const atSix = { ...F_ON_B, selection: { family: 'note-places', where: [{ at: 6 }] } };
			expect(judge(atSix, { midi: 65 }).correct).toBe(true);
			expect(judge(atSix, { midi: 77 }).correct).toBe(false);
		});

		it('judges a selection that admits nothing as wrong, without throwing', () => {
			const none = {
				...F_ON_B,
				selection: { family: 'note-places', where: [{ in: { strings: [1] } }] }
			};
			expect(admitted(notePlaces, none.index, none.selection)).toEqual([]);
			expect(judge(none, { midi: 65 })).toEqual({
				correct: false,
				answer: { midi: 65 },
				confusion: classifyNoteConfusion({ string: 2, pitch: 'F' }, 65)
			});
		});

		it('judges a payload without a pitch wrong, with no answer and no confusion', () => {
			expect(judge(F_ON_B, {})).toEqual({ correct: false, answer: null, confusion: null });
			expect(judge(F_ON_B, null)).toEqual({ correct: false, answer: null, confusion: null });
			expect(judge(F_ON_B, 'F')).toEqual({ correct: false, answer: null, confusion: null });
		});
	});

	describe('on chord-shapes', () => {
		const shapes = voicingOccurrences(parseVoicingKey(C_KEY)).map(occurrenceId);
		const inversion = voicingOccurrences(parseVoicingKey('C|maj|3:3,2:5,1:1')).map(occurrenceId)[0];

		it('takes any shape admitted, its answer the shape decided', () => {
			for (const decided of shapes) {
				expect(judge(C_SHAPES, { decided })).toEqual({
					correct: true,
					answer: { decided },
					confusion: null
				});
			}
		});

		it('tells a wrong shape by the confusion the family gives', () => {
			const expected = classifyChordShape(parseVoicingKey(C_KEY), null, inversion).confusion;
			expect(expected).toEqual({ kind: 'other-inversion', part: 'chord' });
			expect(judge(C_SHAPES, { decided: inversion })).toEqual({
				correct: false,
				answer: { decided: inversion },
				confusion: expected
			});
			expect(judge(C_SHAPES, { decided: null })).toEqual({
				correct: false,
				answer: { decided: null },
				confusion: { kind: 'none', part: 'chord' }
			});
		});

		it('leaves out the previous shape when the selection asks another', () => {
			const [first, second] = shapes;
			const other: MemberContent = {
				...C_SHAPES,
				selection: { family: 'chord-shapes', where: [{ other: 'previous' }] },
				previous: chordShapes.member(first)
			};
			expect(judge(other, { decided: first }).correct).toBe(false);
			expect(judge(other, { decided: second }).correct).toBe(true);
			expect(judge({ ...other, previous: null }, { decided: first }).correct).toBe(true);
		});

		it('judges a payload without a decision wrong, with no answer', () => {
			expect(judge(C_SHAPES, { midi: 60 })).toEqual({
				correct: false,
				answer: null,
				confusion: { kind: 'none', part: 'chord' }
			});
			expect(judge(C_SHAPES, 'C')).toEqual({
				correct: false,
				answer: null,
				confusion: { kind: 'none', part: 'chord' }
			});
		});

		it('tells the family which filter refused the shape heard', () => {
			const zone: MemberContent = {
				family: 'chord-shapes',
				index: { chord: parseVoicingKey(C_KEY).chord, strings: [4, 3, 2, 1] },
				selection: { family: 'chord-shapes', where: [{ in: { frets: [1, 5] } }] }
			};
			const high = 'C|maj|3:1,2:3,1:5@17-17-15';
			expect(judge(zone, { decided: high })).toEqual({
				correct: false,
				answer: { decided: high },
				confusion: { kind: 'out-of-zone', part: 'chord' }
			});
			expect(judge(zone, { decided: 'C|maj|3:1,2:3,1:5@5-5-3' }).correct).toBe(true);
		});
	});
});
