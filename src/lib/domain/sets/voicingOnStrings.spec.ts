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
});
