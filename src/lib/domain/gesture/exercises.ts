import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import type { GestureRule } from '$lib/domain/mechanics/chordGrid';
import type { StringNumber } from '$lib/domain/music/types';

/** What a gesture exercise is made of. */
export interface GestureParams {
	rule: GestureRule;
	/** In the order of the content. */
	stringSets: StringNumber[][];
	/** Quality ids of the chords linked ('maj', 'min'). */
	qualities: string[];
	/** The grids played, by id; none for the link. */
	grids?: string[];
}

/** The params of a gesture exercise. Throws on another exercise. */
export function readGestureParams(definition: ExerciseDefinition): GestureParams {
	const params = definition.params as Partial<GestureParams>;
	if (!params.rule || !Array.isArray(params.stringSets) || !Array.isArray(params.qualities)) {
		throw new Error(`Not a gesture exercise: ${definition.id}`);
	}
	return params as GestureParams;
}

/** What one passage plays: a chord on a set (link), or a grid on its sets. */
export interface GestureElement {
	exerciseId: ExerciseId;
	rule: GestureRule;
	/** Stable: 'link:D|maj:3,2,1', 'climb:iohefy-a:3,2,1', 'zone:iohefy-a', 'jam:blues-f'. */
	key: string;
	/** Link: the triad, root as a chord chart writes it ('Eb|min'). */
	chord?: string;
	gridId?: string;
	sets: StringNumber[][];
}

/** The roots of the linked chords, from C, as a chord chart writes them. */
export const CHART_ROOTS: readonly string[] = [
	'C',
	'C#',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B'
];

/**
 * The elements of an exercise, in the order of its content. Link: root, quality, then set, so
 * the two sets of a chord come side by side; climb: grid then set; zone and jam: grid, on every set.
 */
export function gestureElements(definition: ExerciseDefinition): GestureElement[] {
	const { rule, stringSets, qualities, grids = [] } = readGestureParams(definition);
	const exerciseId = definition.id;
	if (rule === 'link') {
		return CHART_ROOTS.flatMap((root) =>
			qualities.flatMap((quality) =>
				stringSets.map((set) => {
					const chord = `${root}|${quality}`;
					return { exerciseId, rule, key: `link:${chord}:${set.join()}`, chord, sets: [set] };
				})
			)
		);
	}
	if (rule === 'climb') {
		return grids.flatMap((gridId) =>
			stringSets.map((set) => ({
				exerciseId,
				rule,
				key: `climb:${gridId}:${set.join()}`,
				gridId,
				sets: [set]
			}))
		);
	}
	return grids.map((gridId) => ({
		exerciseId,
		rule,
		key: `${rule}:${gridId}`,
		gridId,
		sets: stringSets
	}));
}
