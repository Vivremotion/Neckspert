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

/** The content of the gesture track (spec 2026-10-10, section 1): the triads of the memory track. */
function gestureParams(rule: GestureRule, grids: boolean): GestureParams {
	return {
		rule,
		stringSets: [
			[3, 2, 1],
			[4, 3, 2]
		],
		qualities: ['maj', 'min'],
		...(grids && { grids: ['iohefy-a', 'blues-f'] })
	};
}

/**
 * A gesture exercise. They share the chord-grid mechanic, so each starts at its own tempo rather
 * than the last tempo of another (`startTempo`).
 */
function gestureExercise(id: ExerciseId, rule: GestureRule, grids: boolean): ExerciseDefinition {
	return {
		id,
		version: 1,
		mechanic: 'chord-grid',
		params: { ...gestureParams(rule, grids) },
		startTempoBpm: 80,
		view: 'grid-scroll'
	};
}

/** Link the shapes of a chord on a set, up the neck then down. */
export const GESTURE_LINK = gestureExercise('gesture-link', 'link', false);
/** Play a grid on a set, each shape higher (or lower) than the one before. */
export const GESTURE_CLIMB = gestureExercise('gesture-climb', 'climb', true);
/** Play a grid within a zone of frets. */
export const GESTURE_ZONE = gestureExercise('gesture-zone', 'zone', true);
/** Play a grid anywhere. */
export const GESTURE_JAM = gestureExercise('gesture-jam', 'jam', true);

/** The gesture exercises, in the order of the ladder. */
export const GESTURE_EXERCISES: readonly ExerciseDefinition[] = [
	GESTURE_LINK,
	GESTURE_CLIMB,
	GESTURE_ZONE,
	GESTURE_JAM
];

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
