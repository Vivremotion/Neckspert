import { describe, expect, it } from 'vitest';
import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, clampTempo } from './tempo';

describe('clampTempo', () => {
	it('keeps values inside 60..140', () => {
		expect(MIN_TEMPO_BPM).toBe(60);
		expect(MAX_TEMPO_BPM).toBe(140);
		expect(clampTempo(80)).toBe(80);
		expect(clampTempo(60)).toBe(60);
		expect(clampTempo(140)).toBe(140);
	});

	it('clamps below and above the user bounds', () => {
		expect(clampTempo(59)).toBe(60);
		expect(clampTempo(20)).toBe(60);
		expect(clampTempo(141)).toBe(140);
		expect(clampTempo(300)).toBe(140);
	});

	it('rounds to the nearest integer', () => {
		expect(clampTempo(80.4)).toBe(80);
		expect(clampTempo(80.6)).toBe(81);
	});
});
