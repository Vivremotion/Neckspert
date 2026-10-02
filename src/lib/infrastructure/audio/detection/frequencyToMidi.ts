import type { Midi } from '$lib/domain/music/types';

/** Continuous MIDI number; A4 (440 Hz) = 69. */
export function frequencyToMidi(frequencyHz: number): number {
	return 69 + 12 * Math.log2(frequencyHz / 440);
}

/** Nearest MIDI note, clamped to [minMidi, maxMidi]. */
export function midiFromFrequency(frequencyHz: number, minMidi: number, maxMidi: number): Midi {
	const midi = Math.round(frequencyToMidi(frequencyHz));
	return Math.min(maxMidi, Math.max(minMidi, midi));
}

/** Nearest MIDI note, or null when that note sits outside the guitar range. */
export function midiIfInRange(frequencyHz: number, minMidi: number, maxMidi: number): Midi | null {
	if (!(frequencyHz > 0) || !Number.isFinite(frequencyHz)) return null;
	const midi = Math.round(frequencyToMidi(frequencyHz));
	if (midi < minMidi || midi > maxMidi) return null;
	return midi;
}
