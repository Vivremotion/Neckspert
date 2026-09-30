import type { Midi } from '$lib/domain/music/types';

export interface NoteOnset {
	/** Attack time on the audio clock, in seconds, before latency correction. */
	time: number;
	/** Nearest MIDI note, octave included. */
	midi: Midi;
	frequencyHz: number;
	/** Pitch clarity from 0 to 1. */
	clarity: number;
}

export interface AudioInputDevice {
	id: string;
	label: string;
}

/** Single-note detection from the guitar input. */
export interface NoteDetectorPort {
	listInputs(): Promise<AudioInputDevice[]>;
	/** Opens the input (null = default device) and starts detecting. */
	start(deviceId: string | null): Promise<void>;
	/** Gain for a built-in mic. Ignored for an external interface. */
	setBuiltInGain(gain: number): void;
	stop(): void;
	/** One event per note attack. Returns an unsubscribe function. */
	onNote(callback: (onset: NoteOnset) => void): () => void;
	/** Input level (RMS, 0 to 1), for meters. Returns an unsubscribe function. */
	onLevel(callback: (rms: number) => void): () => void;
}
