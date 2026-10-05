import { MAX_PROMPT_FRET, type StringNumber } from '$lib/domain/music/types';
import { pitchOnString } from './fretboard';
import type { LocateItem, NeckCard } from './items';

/** Teaching order: low E string first. */
export const CURRICULUM_STRINGS: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** Frets taught and prompted. Fret 0 is left out: open strings are assumed known. */
export const LEARNABLE_FRETS: readonly number[] = Array.from(
	{ length: MAX_PROMPT_FRET },
	(_, index) => index + 1
);

function locateItem(string: StringNumber, fret: number): LocateItem {
	return { string, pitch: pitchOnString(string, fret) };
}

/** Every locate item: strings 6 to 1, frets 1 to 11 on each (66 items). */
export function locateItems(): LocateItem[] {
	return CURRICULUM_STRINGS.flatMap((string) =>
		LEARNABLE_FRETS.map((fret) => locateItem(string, fret))
	);
}

/** Every card free play draws from: 66 locate, then 66 identify. */
export function practiceCards(): NeckCard[] {
	return [
		...locateItems().map((item): NeckCard => ({ mechanic: 'locate', item })),
		...CURRICULUM_STRINGS.flatMap((string) =>
			LEARNABLE_FRETS.map((fret): NeckCard => ({ mechanic: 'identify', item: { string, fret } }))
		)
	];
}
