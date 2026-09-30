import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES, STANDARD_TUNING, pitchOfMidi } from './types';

describe('pitchOfMidi', () => {
	it('maps MIDI numbers to sharp pitch names', () => {
		expect(pitchOfMidi(60)).toBe('C');
		expect(pitchOfMidi(64)).toBe('E');
		expect(pitchOfMidi(66)).toBe('F#');
		expect(pitchOfMidi(40)).toBe('E');
	});

	it('handles every pitch class exactly once over an octave', () => {
		const names = Array.from({ length: 12 }, (_, i) => pitchOfMidi(48 + i));
		expect(names).toEqual([...CHROMATIC_NOTES]);
	});
});

describe('STANDARD_TUNING', () => {
	it('tunes string 1 to E4 and string 6 to E2', () => {
		expect(STANDARD_TUNING[1]).toBe(64);
		expect(STANDARD_TUNING[6]).toBe(40);
		expect(pitchOfMidi(STANDARD_TUNING[2])).toBe('B');
	});
});
