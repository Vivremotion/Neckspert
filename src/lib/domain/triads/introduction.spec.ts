import { describe, expect, it } from 'vitest';
import { pitchOfSpelled, spellInterval, voicingKey, type Voicing } from '$lib/domain/music';
import { TRIADS_ANCHOR } from '$lib/domain/exercise';
import { triadIntroductionOrder, triadParams, triadVoicings } from './index';

const PARAMS = triadParams(TRIADS_ANCHOR);

/** Root and quality of a voicing, as written in a chord chart: "C", "Cm", "C#". */
function chordOf(voicing: Voicing): string {
	return `${pitchOfSpelled(voicing.chord.root)}${voicing.chord.quality.suffix}`;
}

/** Position keys (`string:pitch`, as a locate item) of every voicing of a root on a string set. */
function positionsOf(voicings: readonly Voicing[]): Set<string> {
	return new Set(
		voicings.flatMap((v) =>
			v.strings.map(
				({ string, degree }) => `${string}:${pitchOfSpelled(spellInterval(v.chord.root, degree))}`
			)
		)
	);
}

describe('triadVoicings', () => {
	it('has every close major and minor triad on both string sets: 144 voicings', () => {
		const voicings = triadVoicings(PARAMS);
		expect(voicings).toHaveLength(144);
		expect(new Set(voicings.map(voicingKey)).size).toBe(144);
	});
});

describe('triadIntroductionOrder', () => {
	it('starts with C on G-B-E, its three inversions up the neck, then C minor', () => {
		const order = triadIntroductionOrder(PARAMS, new Set());
		expect(order.slice(0, 6).map(voicingKey)).toEqual([
			'C|maj|3:5,2:1,1:3',
			'C|maj|3:1,2:3,1:5',
			'C|maj|3:3,2:5,1:1',
			'C|min|3:1,2:b3,1:5',
			'C|min|3:b3,2:5,1:1',
			'C|min|3:5,2:1,1:b3'
		]);
	});

	it('orders the inversions of a chord by the position of their lowest shape', () => {
		const order = triadIntroductionOrder(PARAMS, new Set());
		const cMinor = order.slice(3, 6).map((v) => v.strings.map((s) => s.degree).join(','));
		// Cm on G-B-E: 5-4-3 (root on G, position 3), 8-8-8 (b3 on G), 12-13-11 (root on B).
		expect(cMinor).toEqual(['1,b3,5', 'b3,5,1', '5,1,b3']);
	});

	it('brings first the root whose positions are already known on the neck', () => {
		const d = triadVoicings(PARAMS).filter(
			(v) => pitchOfSpelled(v.chord.root) === 'D' && v.strings[0].string === 3
		);
		const order = triadIntroductionOrder(PARAMS, positionsOf(d));
		expect(order.slice(0, 6).map(chordOf)).toEqual(['D', 'D', 'D', 'Dm', 'Dm', 'Dm']);
		// F (F A C, F Ab C) shares A and F with D's family; C (C E G, C Eb G) shares none.
		const firstOf = (chord: string) => order.findIndex((v) => chordOf(v) === chord);
		expect(firstOf('F')).toBeLessThan(firstOf('C'));
	});

	it('takes the natural roots before the altered ones, then the chromatic order from C', () => {
		const roots = triadIntroductionOrder(PARAMS, new Set())
			.slice(0, 72)
			.filter((_, i) => i % 6 === 0)
			.map(chordOf);
		expect(roots).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'D#', 'F#', 'G#', 'A#']);
	});

	it('introduces D-G-B only after every triad of G-B-E', () => {
		const order = triadIntroductionOrder(PARAMS, new Set());
		expect(order.slice(0, 72).every((v) => v.strings[0].string === 3)).toBe(true);
		expect(order.slice(72).every((v) => v.strings[0].string === 4)).toBe(true);
	});
});
