import { describe, expect, it } from 'vitest';
import type { ChordExpectation } from '$lib/application/ports';
import { triadAnchorRules, triadZoneRules } from '$lib/domain/mechanics';
import type { ExpectationResult, ResponseValue } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { TRIAD_PRESENTERS, triadAnchorPresenter, triadZonePresenter } from './triads';

/** D on G-B-E: root on B (2-3-2, 14-15-14), root on G (7-7-5), root on E (11-10-10). */
const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';
const EM_ON_E = 'E|min|3:b3,2:5,1:1';
const EBM_ON_B = 'D#|min|3:5,2:1,1:b3';

const D_232 = {
	notes: [
		{ string: 3, fret: 2 },
		{ string: 2, fret: 3 },
		{ string: 1, fret: 2 }
	]
};
const D_141514 = {
	notes: [
		{ string: 3, fret: 14 },
		{ string: 2, fret: 15 },
		{ string: 1, fret: 14 }
	]
};
const shapeOf = (frets: [number, number, number]) => ({
	notes: [
		{ string: 3, fret: frets[0] },
		{ string: 2, fret: frets[1] },
		{ string: 1, fret: frets[2] }
	]
});
const ROOT_D = { midi: 62 };
const chordConfusion = (kind: string) => ({ kind, part: 'chord' });

const unaided = { aid: 'none', stringAid: false } as const;
const aided = { aid: 'show-position', stringAid: false } as const;
const miss = { correct: false, verdict: 'wrong' } as const;

function previous(voicingKey: string): PlannedItem {
	return {
		exerciseId: 'triads-anchor',
		mechanic: 'triad-anchor',
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

	it('names the chord and the string of its root, the strings in small below', () => {
		expect(triadAnchorPresenter.prompt({ voicingKey: D_ON_B }, unaided, 'fr', () => 0)).toEqual({
			primary: 'D',
			secondary: 'fondamentale sur si',
			detail: 'sol‑si‑mi',
			target: 'D',
			band: 'D',
			aid: null,
			diagram: null
		});
		expect(
			triadAnchorPresenter.prompt({ voicingKey: D_ON_G }, unaided, 'en', () => 0)
		).toMatchObject({ primary: 'D', secondary: 'root on G', detail: 'G‑B‑E' });
	});

	it('puts the root on the target tile and the chord on the band that follows', () => {
		expect(
			triadAnchorPresenter.prompt({ voicingKey: EBM_ON_B }, unaided, 'fr', () => 0)
		).toMatchObject({ primary: 'Ebm', target: 'Eb', band: 'Ebm' });
	});

	it('draws the lowest shape as the aid, without frets in text', () => {
		const prompt = triadAnchorPresenter.prompt({ voicingKey: D_ON_B }, aided, 'fr', () => 0);
		expect(prompt.shape).toEqual(D_232);
		expect(prompt.aid).toBeNull();
		expect(
			triadAnchorPresenter.prompt({ voicingKey: D_ON_B }, unaided, 'fr', () => 0).shape
		).toBeUndefined();
	});

	it('spells Eb, Ab and Bb with a flat', () => {
		expect(
			triadAnchorPresenter.prompt({ voicingKey: EBM_ON_B }, unaided, 'fr', () => 0).primary
		).toBe('Ebm');
		expect(
			triadAnchorPresenter.prompt({ voicingKey: 'C#|maj|3:5,2:1,1:3' }, unaided, 'fr', () => 0)
				.primary
		).toBe('C#');
	});

	it('reveals the shape and its notes after a miss, nothing on a right chord', () => {
		expect(triadAnchorPresenter.reveal({ voicingKey: D_ON_B }, miss, 'fr')).toBe('2‑3‑2 · A D F#');
		expect(triadAnchorPresenter.reveal({ voicingKey: EBM_ON_B }, miss, 'fr')).toBe(
			'3‑4‑2 · Bb Eb Gb'
		);
		expect(
			triadAnchorPresenter.reveal(
				{ voicingKey: D_ON_B },
				{ correct: true, verdict: 'perfect' },
				'fr'
			)
		).toBeNull();
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

	it('labels the chord heard by its frets', () => {
		expect(
			triadAnchorPresenter.answerLabel(
				{ root: { midi: 62 }, chord: { decided: `${D_ON_B}@14-15-14` } },
				{ voicingKey: D_ON_B },
				'fr',
				() => 0
			)
		).toBe('14‑15‑14');
	});
});

describe('triadAnchorPresenter feedback', () => {
	const item = { voicingKey: D_ON_B };
	const feedback = (
		chord: string | null | undefined,
		confusion: unknown,
		verdict: 'wrong' | 'corrected' | 'perfect' = 'wrong',
		locale: 'fr' | 'en' = 'fr',
		root: { midi: number } | null = ROOT_D
	) =>
		triadAnchorPresenter.feedback!(
			item,
			{
				answer: {
					root,
					chord: chord === undefined ? null : { decided: chord },
					correction: null
				},
				confusion,
				verdict
			},
			locale
		);

	it('draws the chord heard, the closest shape asked, and names the gap', () => {
		expect(feedback('C|maj|3:1,2:3,1:5@5-5-3', chordConfusion('other-quality'))).toEqual({
			heard: shapeOf([5, 5, 3]),
			expected: D_232,
			gap: 'autre qualité'
		});
		expect(feedback('D|maj|3:5,2:1,1:3@14-15-14', null, 'perfect')).toBeNull();
	});

	it('takes the shape asked closest to the one played', () => {
		expect(feedback('D|maj|3:1,2:3,1:5@7-7-5', chordConfusion('other-inversion'))).toMatchObject({
			heard: shapeOf([7, 7, 5]),
			expected: D_232,
			gap: 'autre renversement'
		});
		expect(
			feedback('D|maj|3:3,2:5,1:1@11-10-10', chordConfusion('other-inversion'))?.expected
		).toEqual(D_141514);
	});

	it('says when nothing was recognized, or no chord came in the band', () => {
		expect(feedback(null, chordConfusion('none'))).toEqual({
			heard: null,
			expected: D_232,
			gap: 'rien de reconnu'
		});
		expect(feedback(undefined, { kind: 'no-chord', part: 'chord' })?.gap).toBe(
			'pas d’accord dans la bande'
		);
	});

	it('names the root heard on a wrong root, or its absence', () => {
		expect(
			feedback(
				'D|maj|3:5,2:1,1:3@2-3-2',
				{ kind: 'semitone', delta: 1, part: 'root' },
				'wrong',
				'fr',
				{
					midi: 63
				}
			)?.gap
		).toBe('fondamentale entendue : D#');
		expect(
			triadAnchorPresenter.feedback!(
				item,
				{ answer: null, confusion: null, verdict: 'wrong' },
				'fr'
			)
		).toEqual({ heard: null, expected: D_232, gap: 'fondamentale non entendue' });
	});

	it('shows the first chord of a corrected attempt, the one that counts', () => {
		expect(
			triadAnchorPresenter.feedback!(
				item,
				{
					answer: {
						root: ROOT_D,
						chord: { decided: 'D|maj|3:1,2:3,1:5@7-7-5' },
						correction: { decided: 'D|maj|3:5,2:1,1:3@2-3-2' }
					},
					confusion: chordConfusion('other-inversion'),
					verdict: 'corrected'
				},
				'fr'
			)?.heard
		).toEqual(shapeOf([7, 7, 5]));
	});

	it('names the gap in English', () => {
		const en = (kind: string) => feedback(null, chordConfusion(kind), 'wrong', 'en')?.gap;
		expect(en('other-inversion')).toBe('other inversion');
		expect(en('other-quality')).toBe('other quality');
		expect(en('none')).toBe('nothing recognized');
		expect(feedback(undefined, { kind: 'no-chord', part: 'chord' }, 'wrong', 'en')?.gap).toBe(
			'no chord in the band'
		);
		expect(feedback(null, { kind: 'octave', part: 'root' }, 'wrong', 'en', { midi: 63 })?.gap).toBe(
			'root heard: D#'
		);
		expect(
			triadAnchorPresenter.feedback!(
				item,
				{ answer: null, confusion: null, verdict: 'wrong' },
				'en'
			)?.gap
		).toBe('no root heard');
	});
});

describe('triadZonePresenter feedback', () => {
	it('draws the shape at the position asked, and names the gap', () => {
		const item = { voicingKey: D_ON_B, position: 14 as const };
		expect(
			triadZonePresenter.feedback!(
				item,
				{
					answer: { decided: 'D|maj|3:5,2:1,1:3@2-3-2' },
					confusion: chordConfusion('other-octave'),
					verdict: 'wrong'
				},
				'fr'
			)
		).toEqual({ heard: D_232, expected: D_141514, gap: 'autre octave' });
		expect(
			triadZonePresenter.feedback!(item, { answer: null, confusion: null, verdict: 'wrong' }, 'en')
		).toEqual({ heard: null, expected: D_141514, gap: 'no chord heard' });
		expect(
			triadZonePresenter.feedback!(item, { answer: null, confusion: null, verdict: 'wrong' }, 'fr')
				?.gap
		).toBe('pas d’accord entendu');
	});
});

describe('triadZonePresenter', () => {
	it('is played on the guitar, heard by the chord sensor', () => {
		expect(triadZonePresenter.rules).toBe(triadZoneRules);
		expect(triadZonePresenter.sensors).toEqual(['chord']);
		expect(TRIAD_PRESENTERS['triad-zone']).toBe(triadZonePresenter);
	});

	it('names the chord and the fret drawn for it, the string of its root as the aid', () => {
		const item = { voicingKey: D_ON_B, position: 2 as const, fret: 3 };
		expect(triadZonePresenter.prompt(item, unaided, 'fr', () => 0)).toEqual({
			primary: 'D',
			secondary: 'vers la case 3',
			detail: 'sol‑si‑mi',
			aid: null,
			diagram: null
		});
		expect(triadZonePresenter.prompt(item, aided, 'fr', () => 0).aid).toBe('fondamentale sur si');
		expect(triadZonePresenter.prompt(item, aided, 'en', () => 0).aid).toBe('root on B');
		expect(triadZonePresenter.prompt(item, unaided, 'en', () => 0).secondary).toBe('around fret 3');
	});

	it('names the lowest fret of the shape for an attempt stored without a fret', () => {
		const item = { voicingKey: D_ON_B, position: 2 as const };
		expect(triadZonePresenter.prompt(item, unaided, 'fr', () => 0).secondary).toBe(
			'vers la case 2'
		);
	});

	it('calls a shape on open strings open', () => {
		const item = { voicingKey: EM_ON_E, position: 'open' as const };
		expect(triadZonePresenter.prompt(item, unaided, 'fr', () => 0)).toMatchObject({
			primary: 'Em',
			secondary: 'à vide'
		});
		expect(triadZonePresenter.prompt(item, unaided, 'en', () => 0).secondary).toBe('open');
	});

	it('reveals the shape asked after a miss', () => {
		expect(triadZonePresenter.reveal({ voicingKey: D_ON_B, position: 14 }, miss, 'fr')).toBe(
			'14‑15‑14 · A D F#'
		);
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
