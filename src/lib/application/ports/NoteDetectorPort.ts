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

/** Why an attack was heard but no note came out of it. */
export type NoteRejectionReason = 'no-pitch' | 'unclear' | 'unstable' | 'out-of-range';

/** One pitch reading; a frequency of 0 means no pitch was found. */
export interface PitchWindow {
	frequencyHz: number;
	clarity: number;
}

/** An attack whose pitch the detector could not confirm. */
export interface NoteRejection {
	/** Attack time on the audio clock, in seconds, before latency correction. */
	time: number;
	reason: NoteRejectionReason;
	/** Reading of the window that includes the pick attack. */
	attack: PitchWindow;
	/** Reading of the window after it. */
	sustain: PitchWindow;
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
	/** One event per attack whose pitch could not be confirmed. Returns an unsubscribe function. */
	onRejected(callback: (rejection: NoteRejection) => void): () => void;
	/** Input level (RMS, 0 to 1), for meters. Returns an unsubscribe function. */
	onLevel(callback: (rms: number) => void): () => void;
}
