import { MAX_PROMPT_FRET, type StringNumber } from '$lib/domain/music/types';
import type { IdentifyTarget, LocateTarget, Target } from '$lib/domain/types';
import { pitchOnString } from './fretboard';

/** Teaching order: low E string first. */
export const CURRICULUM_STRINGS: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** Frets taught and prompted. Fret 0 is left out: open strings are assumed known. */
export const LEARNABLE_FRETS: readonly number[] = Array.from(
	{ length: MAX_PROMPT_FRET },
	(_, index) => index + 1
);

function locateTarget(string: StringNumber, fret: number): LocateTarget {
	return { direction: 'locate', string, pitch: pitchOnString(string, fret) };
}

function identifyTarget(string: StringNumber, fret: number): IdentifyTarget {
	return { direction: 'identify', string, fret };
}

/** Every mode 1 target: strings 6 to 1, frets 1 to 11 on each (66 targets). */
export function locateTargets(): LocateTarget[] {
	return CURRICULUM_STRINGS.flatMap((string) =>
		LEARNABLE_FRETS.map((fret) => locateTarget(string, fret))
	);
}

/** Every target free play draws from: 66 in mode 1, then 66 in mode 2. */
export function practiceTargets(): Target[] {
	return [
		...locateTargets(),
		...CURRICULUM_STRINGS.flatMap((string) =>
			LEARNABLE_FRETS.map((fret) => identifyTarget(string, fret))
		)
	];
}
