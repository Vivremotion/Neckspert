import { MAX_PROMPT_FRET, type StringNumber } from '$lib/domain/music/types';
import type { Curriculum, CurriculumSet, IdentifyTarget, LocateTarget } from '$lib/domain/types';
import { pitchOnString } from './fretboard';

/** Teaching order: low E string first. */
const CURRICULUM_STRINGS: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** Set `a` of each string: the pitches under the fret markers 3, 5 and 7. */
const SET_A_FRETS: readonly number[] = [3, 5, 7];

const PROMPT_FRETS: readonly number[] = Array.from(
	{ length: MAX_PROMPT_FRET + 1 },
	(_, fret) => fret
);

const SET_PARTS = ['a', 'b'] as const;

const SET_FRETS: Record<(typeof SET_PARTS)[number], readonly number[]> = {
	a: SET_A_FRETS,
	b: PROMPT_FRETS.filter((fret) => !SET_A_FRETS.includes(fret))
};

function locateTarget(string: StringNumber, fret: number): LocateTarget {
	return { direction: 'locate', string, pitch: pitchOnString(string, fret) };
}

function identifyTarget(string: StringNumber, fret: number): IdentifyTarget {
	return { direction: 'identify', string, fret };
}

export function buildCurriculum(): Curriculum {
	const sets: CurriculumSet[] = [];
	let previousLocateId: string | null = null;
	for (const string of CURRICULUM_STRINGS) {
		for (const part of SET_PARTS) {
			const frets = SET_FRETS[part];
			const locateId = `locate-s${string}-${part}`;
			sets.push({
				id: locateId,
				direction: 'locate',
				targets: frets.map((fret) => locateTarget(string, fret)),
				requires: previousLocateId
			});
			sets.push({
				id: `identify-s${string}-${part}`,
				direction: 'identify',
				targets: frets.map((fret) => identifyTarget(string, fret)),
				requires: locateId
			});
			previousLocateId = locateId;
		}
	}
	return sets;
}

/** Every mode 1 target: strings 6 to 1, frets 0 to 11 on each (72 targets). */
export function placementTargets(): LocateTarget[] {
	return CURRICULUM_STRINGS.flatMap((string) =>
		PROMPT_FRETS.map((fret) => locateTarget(string, fret))
	);
}
