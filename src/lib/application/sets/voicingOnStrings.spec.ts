import { describe, expect, it } from 'vitest';
import type { ChordExpectation } from '$lib/application/ports';
import { voicingOnStringsSet } from '$lib/domain/sets';
import type { ExpectationResult, ResponseValue } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { GUITAR_DERIVATIONS } from '$lib/domain/families/guitar/derivations';
import type { Filter } from '$lib/domain/families';
import { MEMBER_CONTENT } from '$lib/domain/judges';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { METER_4_4 } from '$lib/domain/time';
import { TRIADS_ANCHOR } from '$lib/testing/catalog';
import { exerciseSeries, listItems, mulberry32, playExercise } from '$lib/testing/randomExercise';
import { SET_PRESENTERS } from './index';
import { voicingOnStringsPresenter } from './voicingOnStrings';

/** D on G-B-E: root on B (2-3-2, 14-15-14), root on G (7-7-5), root on E (11-10-10). */
const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';
const ROOT_D = { midi: 62 };
const chordConfusion = (kind: string) => ({ kind, part: 'chord' });

function previous(voicingKey: string): PlannedItem {
	return {
		exerciseId: 'chord-anchor',
		skill: 'chord-anchor',
		exerciseLevel: 0,
		item: { voicingKey },
		phase: 'review',
		temperature: 'cold',
		leadBeats: 2
	};
}

/** A round whose chord expectation admits the shapes of the voicing that `where` keeps. */
function chordRound(
	voicingKey: string,
	where: readonly Filter[],
	opensAt: number,
	previousItem: PlannedItem | null = null
) {
	return {
		opensAt,
		previous: previousItem,
		expectations: [
			{
				sensor: 'chord',
				content: {
					kind: MEMBER_CONTENT,
					value: {
						family: 'chord-shapes',
						index: GUITAR_DERIVATIONS.voicing.index({ voicingKey }),
						selection: { family: 'chord-shapes', where }
					}
				}
			}
		]
	};
}

describe('voicingOnStringsPresenter, for an item without a position (the anchor)', () => {
	it('is played on the guitar, heard by the note and the chord sensors unless its round names others', () => {
		expect(voicingOnStringsPresenter.set).toBe(voicingOnStringsSet);
		expect(voicingOnStringsPresenter.scene).toBe('guitar');
		expect(voicingOnStringsPresenter.sensors).toEqual(['note', 'chord']);
		expect(SET_PRESENTERS['voicing-on-strings']).toBe(voicingOnStringsPresenter);
	});

	it('expects every shape of the voicing on the chord sensor', () => {
		const { chord } = voicingOnStringsPresenter.expectation!(
			{ voicingKey: D_ON_B },
			chordRound(D_ON_B, [], 4.2)
		) as { chord: ChordExpectation };
		expect(chord.opensAt).toBe(4.2);
		expect(chord.style).toBe('unknown');
		expect(chord.expected).toEqual([`${D_ON_B}@2-3-2`, `${D_ON_B}@14-15-14`]);
		const ids = chord.candidates.map((c) => c.id);
		for (const id of chord.expected) expect(ids).toContain(id);
		expect(chord.candidates.find((c) => c.id === `${D_ON_B}@14-15-14`)?.kind).toBe('expected');
	});

	it('never lists a shape of the chord still ringing from the prompt before', () => {
		const { chord } = voicingOnStringsPresenter.expectation!(
			{ voicingKey: D_ON_G },
			chordRound(D_ON_G, [], 4.2, previous(D_ON_B))
		) as { chord: ChordExpectation };
		const frets = chord.candidates.map((c) => c.notes.map((n) => n.fret).join('-'));
		expect(frets).not.toContain('2-3-2');
		expect(frets).not.toContain('14-15-14');
		expect(chord.candidates.some((c) => c.id.startsWith(D_ON_B))).toBe(false);
	});
});

describe('voicingOnStringsPresenter, for an item with a position (the zone)', () => {
	it('expects the shape at the position asked, among its look-alikes', () => {
		const { chord } = voicingOnStringsPresenter.expectation!(
			{ voicingKey: D_ON_B, position: 14 },
			chordRound(D_ON_B, [{ at: 14 }], 1)
		) as { chord: ChordExpectation };
		expect(chord.expected).toEqual([`${D_ON_B}@14-15-14`]);
		expect(chord.candidates.find((c) => c.id === `${D_ON_B}@2-3-2`)?.kind).toBe('other-octave');
		expect(chord.candidates[0].notes).toEqual([
			{ string: 3, fret: 14, midi: 69 },
			{ string: 2, fret: 15, midi: 74 },
			{ string: 1, fret: 14, midi: 78 }
		]);
	});
});

describe('voicingOnStringsPresenter, reading what its round admits', () => {
	it('expects the shapes its chord expectation admits, whatever the item says', () => {
		const { chord } = voicingOnStringsPresenter.expectation!(
			{ voicingKey: D_ON_B },
			chordRound(D_ON_B, [{ at: 15 }], 1)
		) as { chord: ChordExpectation };
		expect(chord.expected).toEqual([`${D_ON_B}@14-15-14`]);
		expect(chord.candidates.find((c) => c.id === `${D_ON_B}@2-3-2`)?.kind).toBe('other-octave');
	});

	it('tells the chord sensor nothing of a content of another family, and its round opens', async () => {
		// Written in data, valid: the chord sensor asked for the root's places.
		const anchor = TRIADS_ANCHOR.round!;
		const rootByChord: ExerciseDefinition = {
			...TRIADS_ANCHOR,
			id: 'root-by-chord',
			round: {
				...anchor,
				expectations: anchor.expectations.map((e, i) =>
					i === 1 ? { ...e, content: { family: 'note-places', of: 'root' } } : e
				)
			}
		};
		const item = { voicingKey: D_ON_B };
		const { expectations } = compileRound(
			rootByChord,
			{ ...previous(D_ON_B), exerciseId: rootByChord.id, leadBeats: 2, level: 2, item },
			METER_4_4,
			{ previewBeats: 0, fromRunStart: null }
		);
		expect(expectations[1]).toMatchObject({ sensor: 'chord', content: { kind: MEMBER_CONTENT } });
		expect(
			voicingOnStringsPresenter.expectation!(item, { opensAt: 1, previous: null, expectations })
		).toEqual({});
		const bench = exerciseSeries(rootByChord, listItems(rootByChord, mulberry32(3)));
		expect(await playExercise(bench, 'none')).toHaveLength(3);
	});

	it('tells the chord sensor nothing in a round that expects no chord', () => {
		expect(
			voicingOnStringsPresenter.expectation!(
				{ voicingKey: D_ON_B },
				{ opensAt: 1, previous: null, expectations: [] }
			)
		).toEqual({});
	});
});

describe('the triads’ attempt data', () => {
	type Result = Partial<ExpectationResult> & { index: number };
	const result = (over: Result): ExpectationResult => ({
		answer: null,
		correct: null,
		confusion: null,
		correction: null,
		late: false,
		...over
	});
	const valueOf = (...results: Result[]): ResponseValue => ({
		verdict: 'wrong',
		timingOffsetMs: null,
		reactionMs: null,
		leadMs: 1500,
		expectations: results.map(result)
	});
	const item = { voicingKey: D_ON_B };

	it('stores an anchor answered right as the anchor relation did', () => {
		const value = valueOf(
			{ index: 0, answer: ROOT_D, correct: true },
			{ index: 1, answer: { decided: 'd' }, correct: true }
		);
		expect(voicingOnStringsPresenter.attemptData!(item, value)).toEqual({
			item,
			answer: { root: ROOT_D, chord: { decided: 'd' }, correction: null },
			confusion: null
		});
	});

	it('names a wrong root first, as locate names it, whatever the chord', () => {
		const value = valueOf(
			{ index: 0, answer: { midi: 63 }, correct: false, confusion: { kind: 'semitone', delta: 1 } },
			{ index: 1, answer: { decided: 'x' }, correct: false, confusion: chordConfusion('none') }
		);
		expect(voicingOnStringsPresenter.attemptData!(item, value)).toEqual({
			item,
			answer: { root: { midi: 63 }, chord: { decided: 'x' }, correction: null },
			confusion: { kind: 'semitone', delta: 1, part: 'root' }
		});
	});

	it('says no chord after a right root, the chord’s gap after a wrong one, and keeps its correction', () => {
		const noChord = valueOf({ index: 0, answer: ROOT_D, correct: true }, { index: 1 });
		expect(voicingOnStringsPresenter.attemptData!(item, noChord)).toMatchObject({
			confusion: { kind: 'no-chord', part: 'chord' }
		});
		const corrected = valueOf(
			{ index: 0, answer: ROOT_D, correct: true },
			{
				index: 1,
				answer: { decided: 'x' },
				correct: false,
				confusion: chordConfusion('other-inversion'),
				correction: { decided: 'd' }
			}
		);
		expect(voicingOnStringsPresenter.attemptData!(item, corrected)).toEqual({
			item,
			answer: { root: ROOT_D, chord: { decided: 'x' }, correction: { decided: 'd' } },
			confusion: chordConfusion('other-inversion')
		});
	});

	it('stores nothing heard as no answer and no confusion', () => {
		expect(
			voicingOnStringsPresenter.attemptData!(item, valueOf({ index: 0 }, { index: 1 }))
		).toEqual({
			item,
			answer: null,
			confusion: null
		});
		const zone = { voicingKey: D_ON_B, position: 2, fret: 3 };
		expect(voicingOnStringsPresenter.attemptData!(zone, valueOf({ index: 0 }))).toEqual({
			item: zone,
			answer: null,
			confusion: null
		});
	});

	it('stores a zone answer with its item, its fret included', () => {
		const zone = { voicingKey: D_ON_B, position: 2, fret: 3 };
		const value = valueOf({
			index: 0,
			answer: { decided: 'x' },
			correct: false,
			confusion: chordConfusion('other-octave')
		});
		expect(voicingOnStringsPresenter.attemptData!(zone, value)).toEqual({
			item: zone,
			answer: { decided: 'x' },
			confusion: chordConfusion('other-octave')
		});
	});
});
