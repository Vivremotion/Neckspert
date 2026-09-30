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
