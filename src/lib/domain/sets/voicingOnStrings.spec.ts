import { describe, expect, it } from 'vitest';
import { closeTriadVoicings, parseSpelledNote, qualityById, voicingKey } from '$lib/domain/music';
import { rootPosition, voicingOnStringsSet } from './voicingOnStrings';

const D_MAJOR = closeTriadVoicings(
	{ root: parseSpelledNote('D'), quality: qualityById('maj') },
	[3, 2, 1]
);
/** D with its root on B: 2-3-2, 14-15-14. */
const D_ON_B = D_MAJOR[2];
const KEY = voicingKey(D_ON_B);

describe('rootPosition', () => {
	it('places the root on the string that carries it', () => {
		expect(rootPosition(D_ON_B)).toEqual({ string: 2, pitch: 'D' });
	});
});

describe('voicingOnStringsSet', () => {
	it('keeps one card per voicing, whatever the position asked', () => {
		const asked = { voicingKey: KEY, position: 2 as const, fret: 3 };
		expect(voicingOnStringsSet.itemKey(asked)).toBe(KEY);
		expect(voicingOnStringsSet.itemKey({ voicingKey: KEY })).toBe(KEY);
		expect(voicingOnStringsSet.cardItem?.(asked)).toEqual({ voicingKey: KEY });
	});

	it('reads its keys back, and refuses what is not a voicing', () => {
		expect(voicingOnStringsSet.parseItem(KEY)).toEqual({ voicingKey: KEY });
		expect(() => voicingOnStringsSet.parseItem('D|maj')).toThrow();
	});

	it('asks a member as its position and a fret drawn among those it covers', () => {
		const item = { voicingKey: KEY };
		// 2-3-2 covers frets 2 and 3: the fret takes one number.
		let taken = 0;
		const random = () => (taken++ === 0 ? 0.9 : 0);
		expect(voicingOnStringsSet.asked!(item, { id: `${KEY}@2-3-2` }, random)).toEqual({
			voicingKey: KEY,
			position: 2,
			fret: 3
		});
		expect(taken).toBe(1);
		expect(voicingOnStringsSet.asked!(item, { id: `${KEY}@14-15-14` }, () => 0)).toEqual({
			voicingKey: KEY,
			position: 14,
			fret: 14
		});
	});

	it('asks a shape on open strings with no fret, drawing nothing', () => {
		const E_MINOR = closeTriadVoicings(
			{ root: parseSpelledNote('E'), quality: qualityById('min') },
			[3, 2, 1]
		).find((voicing) => voicingKey(voicing).endsWith('3:b3,2:5,1:1'))!;
		const key = voicingKey(E_MINOR);
		const never = () => {
			throw new Error('nothing to draw');
		};
		expect(voicingOnStringsSet.asked!({ voicingKey: key }, { id: `${key}@0-0-0` }, never)).toEqual({
			voicingKey: key,
			position: 'open'
		});
	});

	it('refuses to ask a member that names no shape of the voicing', () => {
		expect(() =>
			voicingOnStringsSet.asked!({ voicingKey: KEY }, { id: 'D|maj@1-1-1' }, () => 0)
		).toThrow(/names no shape/);
	});

	it('names the member an asked item names, by its voicing and position', () => {
		expect(voicingOnStringsSet.memberOf!({ voicingKey: KEY, position: 14, fret: 15 })).toBe(
			`${KEY}@14-15-14`
		);
		expect(voicingOnStringsSet.memberOf!({ voicingKey: KEY })).toBeNull();
		expect(voicingOnStringsSet.memberOf!({ voicingKey: KEY, position: 99 })).toBeNull();
	});
});
