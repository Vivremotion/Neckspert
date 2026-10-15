import type { ResponseVerdict } from '$lib/domain/types';

/** Short sounds reserved for the verdicts, played on the shared audio clock. */
export interface SoundCuePort {
	/** Plays the verdict's cue at `time` (audio seconds), or immediately when omitted. */
	play(verdict: ResponseVerdict, time?: number): void;
}
