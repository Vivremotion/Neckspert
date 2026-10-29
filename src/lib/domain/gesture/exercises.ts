import type { LevelOverrides } from '$lib/domain/exercise/levels';
import type { RoundTemplate } from '$lib/domain/exercise/round/types';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import type { Level } from '$lib/domain/time/levels';
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
 * One change of a grid: the prompt a beat before, the chord on the beat, opened a little early,
 * handed over at the change's length with the count ending on the change.
 */
function gridRound(): RoundTemplate {
	return {
		prompt: { lead: 1 },
		expectations: [
			{
				at: { beats: 0 },
				sensor: 'chord',
				content: { from: 'grid-change' },
				window: { ms: { param: 'windows.perfectMs' } }
			}
		],
		length: { beats: { item: 'change-beats' } },
		handover: 'end',
		countEndsOn: 'target',
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: {
					beforeMs: { param: 'windows.gridEarlyMs' },
					maxBeats: { param: 'windows.gridEarlyMaxBeats' }
				},
				lateMs: { param: 'windows.lateMs' },
				lateCapture: 'to-end'
			}
		}
	};
}

/** The tempo a gesture exercise starts at, its first level's (♩ = 80). */
const GESTURE_START_BPM = 80;
/** Its highest level's tempo: the gesture stops at ♩ = 120 (author, 2026-10-27). */
const GESTURE_TOP_BPM = 120;
/** From one level to the next. */
const GESTURE_STEP_BPM = 5;
/** Right changes in a row, unaided, that move a level up. To calibrate. */
const GESTURE_PASS_CHANGES = 10;
/** Missed changes in a row that move a level down. To calibrate. */
const GESTURE_DROP_CHANGES = 3;

/**
 * The gesture's exercise levels, plain data: one per tempo from `from` to `to` by `step`, each
 * passed after `pass` right changes in a row and dropped after `drop` misses in a row.
 */
function tempoLevels(
	from: number,
	to: number,
	step: number,
	pass: number,
	drop: number
): Level<LevelOverrides>[] {
	return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => ({
		params: { tempo: from + index * step },
		pass: { successes: pass },
		drop: { failures: drop }
	}));
}

/**
 * A gesture exercise, on its tempo levels: each exercise, and each grid of it (its scope), moves
 * up and down them on its own.
 */
function gestureExercise(
	id: ExerciseId,
	rule: GestureRule,
	grids: boolean,
	howTo: { fr: string; en: string },
	view = 'grid-scroll'
): ExerciseDefinition {
	return {
		id,
		version: 1,
		mechanic: 'chord-grid',
		round: gridRound(),
		params: { ...gestureParams(rule, grids) },
		tempo: GESTURE_START_BPM,
		levels: tempoLevels(
			GESTURE_START_BPM,
			GESTURE_TOP_BPM,
			GESTURE_STEP_BPM,
			GESTURE_PASS_CHANGES,
			GESTURE_DROP_CHANGES
		),
		view,
		howTo
	};
}

/** Link the shapes of a chord on a set, up the neck then down. */
export const GESTURE_LINK = gestureExercise(
	'gesture-link',
	'link',
	false,
	{
		fr: 'Joue l’accord demandé sur les cordes indiquées, en partant de sa position la plus grave. Monte ses renversements un par un vers l’aigu, puis redescends par le même chemin : un accord par mesure, attaqué sur le premier temps. Les flèches donnent le sens : ↗ monte, ↘ descends.',
		en: 'Play the chord asked on the strings shown, starting from its lowest position. Climb its inversions one by one, then come back down the same way: one chord per bar, struck on the first beat. The arrows give the way: ↗ up, ↘ down.'
	},
	'link-lane'
);
/** Play a grid on a set, each shape higher (or lower) than the one before. */
export const GESTURE_CLIMB = gestureExercise('gesture-climb', 'climb', true, {
	fr: 'Joue la grille sur le groupe indiqué. À chaque changement, choisis une forme plus haute sur le manche que la précédente (ou plus basse si la flèche descend). Quand le manche s’arrête, repars dans l’autre sens.',
	en: 'Play the chart on the strings shown. At each change, pick a shape higher up the neck than the one before (or lower if the arrow points down). When the neck runs out, turn back the other way.'
});
/** Play a grid within a zone of frets. */
export const GESTURE_ZONE = gestureExercise('gesture-zone', 'zone', true, {
	fr: 'Joue la grille sans sortir de la zone indiquée, sur l’un des deux groupes de cordes.',
	en: 'Play the chart without leaving the frets shown, on either set of strings.'
});
/** Play a grid anywhere. */
export const GESTURE_JAM = gestureExercise('gesture-jam', 'jam', true, {
	fr: 'Joue la grille comme tu veux : n’importe quelle forme, n’importe quel rythme. Seul l’accord compte.',
	en: 'Play the chart as you like: any shape, any rhythm. Only the chord counts.'
});

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
