import { describe, expect, it } from 'vitest';
import type { ChordExpectation } from '$lib/application/ports';
import { triadAnchorRules, triadZoneRules } from '$lib/domain/mechanics';
import type { ExpectationResult, ResponseValue } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { TRIAD_PRESENTERS, triadAnchorPresenter, triadZonePresenter } from './triads';

/** D on G-B-E: root on B (2-3-2, 14-15-14), root on G (7-7-5), root on E (11-10-10). */
const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';
const ROOT_D = { midi: 62 };
const chordConfusion = (kind: string) => ({ kind, part: 'chord' });

function previous(voicingKey: string): PlannedItem {
	return {
		exerciseId: 'triads-anchor',
		mechanic: 'triad-anchor',
		exerciseLevel: 0,
		item: { voicingKey },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2
	};
}

describe('triadAnchorPresenter', () => {
	it('is played on the guitar, heard by the note and the chord sensors', () => {
		expect(triadAnchorPresenter.rules).toBe(triadAnchorRules);
		expect(triadAnchorPresenter.scene).toBe('guitar');
		expect(triadAnchorPresenter.sensors).toEqual(['note', 'chord']);
		expect(TRIAD_PRESENTERS['triad-anchor']).toBe(triadAnchorPresenter);
	});

	it('expects every shape of the voicing on the chord sensor', () => {
		const { chord } = triadAnchorPresenter.expectation!(
			{ voicingKey: D_ON_B },
			{ opensAt: 4.2, previous: null }
		) as { chord: ChordExpectation };
		expect(chord.opensAt).toBe(4.2);
		expect(chord.style).toBe('unknown');
		expect(chord.expected).toEqual([`${D_ON_B}@2-3-2`, `${D_ON_B}@14-15-14`]);
		const ids = chord.candidates.map((c) => c.id);
		for (const id of chord.expected) expect(ids).toContain(id);
		expect(chord.candidates.find((c) => c.id === `${D_ON_B}@14-15-14`)?.kind).toBe('expected');
	});

	it('never lists a shape of the chord still ringing from the prompt before', () => {
		const { chord } = triadAnchorPresenter.expectation!(
			{ voicingKey: D_ON_G },
			{ opensAt: 4.2, previous: previous(D_ON_B) }
		) as { chord: ChordExpectation };
		const frets = chord.candidates.map((c) => c.notes.map((n) => n.fret).join('-'));
		expect(frets).not.toContain('2-3-2');
		expect(frets).not.toContain('14-15-14');
		expect(chord.candidates.some((c) => c.id.startsWith(D_ON_B))).toBe(false);
	});
});

describe('triadZonePresenter', () => {
	it('is played on the guitar, heard by the chord sensor', () => {
		expect(triadZonePresenter.rules).toBe(triadZoneRules);
		expect(triadZonePresenter.sensors).toEqual(['chord']);
		expect(TRIAD_PRESENTERS['triad-zone']).toBe(triadZonePresenter);
	});

	it('expects the shape at the position asked, among its look-alikes', () => {
		const { chord } = triadZonePresenter.expectation!(
			{ voicingKey: D_ON_B, position: 14 },
			{ opensAt: 1, previous: null }
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
		expect(triadAnchorPresenter.attemptData!(item, value)).toEqual({
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
		expect(triadAnchorPresenter.attemptData!(item, value)).toEqual({
			item,
			answer: { root: { midi: 63 }, chord: { decided: 'x' }, correction: null },
			confusion: { kind: 'semitone', delta: 1, part: 'root' }
		});
	});

	it('says no chord after a right root, the chord’s gap after a wrong one, and keeps its correction', () => {
		const noChord = valueOf({ index: 0, answer: ROOT_D, correct: true }, { index: 1 });
		expect(triadAnchorPresenter.attemptData!(item, noChord)).toMatchObject({
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
		expect(triadAnchorPresenter.attemptData!(item, corrected)).toEqual({
			item,
			answer: { root: ROOT_D, chord: { decided: 'x' }, correction: { decided: 'd' } },
			confusion: chordConfusion('other-inversion')
		});
	});

	it('stores nothing heard as no answer and no confusion', () => {
		expect(triadAnchorPresenter.attemptData!(item, valueOf({ index: 0 }, { index: 1 }))).toEqual({
			item,
			answer: null,
			confusion: null
		});
		const zone = { voicingKey: D_ON_B, position: 2, fret: 3 };
		expect(triadZonePresenter.attemptData!(zone, valueOf({ index: 0 }))).toEqual({
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
		expect(triadZonePresenter.attemptData!(zone, value)).toEqual({
			item: zone,
			answer: { decided: 'x' },
			confusion: chordConfusion('other-octave')
		});
	});
});
