import { describe, expect, it } from 'vitest';
import type { ChordExpectation } from '$lib/application/ports';
import { triadAnchorRules, triadZoneRules } from '$lib/domain/mechanics';
import type { PlannedItem } from '$lib/domain/types';
import { TRIAD_PRESENTERS, triadAnchorPresenter, triadZonePresenter } from './triads';

/** D on G-B-E: root on B (2-3-2, 14-15-14), root on G (7-7-5), root on E (11-10-10). */
const D_ON_B = 'D|maj|3:5,2:1,1:3';
const D_ON_G = 'D|maj|3:1,2:3,1:5';
const EM_ON_E = 'E|min|3:b3,2:5,1:1';
const EBM_ON_B = 'D#|min|3:5,2:1,1:b3';

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
			aid: null,
			diagram: null
		});
		expect(
			triadAnchorPresenter.prompt({ voicingKey: D_ON_G }, unaided, 'en', () => 0)
		).toMatchObject({ primary: 'D', secondary: 'root on G', detail: 'G‑B‑E' });
	});

	it('shows the frets of the lowest shape as the aid', () => {
		expect(triadAnchorPresenter.prompt({ voicingKey: D_ON_B }, aided, 'fr', () => 0).aid).toBe(
			'2‑3‑2'
		);
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

describe('triadZonePresenter', () => {
	it('is played on the guitar, heard by the chord sensor', () => {
		expect(triadZonePresenter.rules).toBe(triadZoneRules);
		expect(triadZonePresenter.sensors).toEqual(['chord']);
		expect(TRIAD_PRESENTERS['triad-zone']).toBe(triadZonePresenter);
	});

	it('names the chord and the position asked, the string of its root as the aid', () => {
		const item = { voicingKey: D_ON_B, position: 2 as const };
		expect(triadZonePresenter.prompt(item, unaided, 'fr', () => 0)).toEqual({
			primary: 'D',
			secondary: 'position 2',
			detail: 'sol‑si‑mi',
			aid: null,
			diagram: null
		});
		expect(triadZonePresenter.prompt(item, aided, 'fr', () => 0).aid).toBe('fondamentale sur si');
		expect(triadZonePresenter.prompt(item, aided, 'en', () => 0).aid).toBe('root on B');
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
