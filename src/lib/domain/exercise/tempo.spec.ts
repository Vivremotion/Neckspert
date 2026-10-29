import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPO_BPM } from './tempo';
import { tempoOf } from './levels';
import { IDENTIFY_NECK } from './catalog';

describe('DEFAULT_TEMPO_BPM', () => {
	it('is the tempo of an exercise that writes none: 80 bpm', () => {
		expect(DEFAULT_TEMPO_BPM).toBe(80);
		expect(IDENTIFY_NECK.tempo).toBeUndefined();
		expect(tempoOf(IDENTIFY_NECK, 0)).toBe(DEFAULT_TEMPO_BPM);
	});
});
