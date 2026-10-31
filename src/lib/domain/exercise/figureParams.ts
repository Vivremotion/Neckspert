import type { CycleThresholds } from '../time/judge/measures';
import type { Feedback } from '../time/levels';
import { resolvedParamsOf } from './levels';
import { FIGURE_CONTENT, isFigureEntry } from './round/types';
import type { ExerciseDefinition } from './types';

/** How a figure is engraved: a staff (its pitches), a tab (its frets); neither, the rhythm line. */
export interface Notation {
	staff: boolean;
	tab: boolean;
}

/**
 * What a round that plays a figure reads of its exercise level, beyond its template: how its
 * marks are told, what listening to the figure is worth, the cursor over it, the thresholds
 * its verdict judges against, and how it is engraved. Absent from the params: the defaults below.
 */
export interface FigureParams {
	feedback: Feedback;
	listen: 'free' | 'aid' | 'none';
	cursor: boolean;
	thresholds: CycleThresholds;
	/**
	 * The staff and the tab the level shows (`notation`, or `notation.staff` and `notation.tab`,
	 * the one it leaves out taken from the round's content: `contentNotationOf`); null when it
	 * writes none, the default of the round's content.
	 */
	notation: Notation | null;
	/** The level draws on the neck the notes its round derives from its item. */
	neck: boolean;
	/** The level marks on the figure, as it plays, what was heard of each note. */
	liveMarks: boolean;
	/** Beats before its round ends that the level shows what comes next; 0: it does not. */
	nextBeats: number;
}

const FEEDBACKS: readonly Feedback[] = ['every-cycle', 'summary', 'out-of-tolerance'];
const LISTENS: readonly FigureParams['listen'][] = ['free', 'aid', 'none'];

/** The figure params of an exercise that writes none. */
export const DEFAULT_FIGURE_PARAMS: FigureParams = {
	feedback: 'every-cycle',
	listen: 'none',
	cursor: false,
	thresholds: {},
	notation: null,
	neck: false,
	liveMarks: false,
	nextBeats: 0
};

/** The round template writes a figure entry. */
export function writesFigure(definition: ExerciseDefinition): boolean {
	return definition.round?.expectations.some(isFigureEntry) ?? false;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, otherwise: T): T {
	return values.includes(value as T) ? (value as T) : otherwise;
}

/**
 * The figure params of exercise level `exerciseLevel` (0 = level 1, aid levels negative), read in
 * its resolved params (`resolvedParamsOf`), each over its default. Throws on a level the exercise
 * does not have.
 */
export function figureParamsOf(
	definition: ExerciseDefinition,
	exerciseLevel: number
): FigureParams {
	const { feedback, listen, cursor, thresholds, notation, neck, liveMarks, nextBeats } =
		resolvedParamsOf(definition, { exerciseLevel, itemLevel: null });
	return {
		notation: notationParam(definition, notation),
		feedback: oneOf(FEEDBACKS, feedback, DEFAULT_FIGURE_PARAMS.feedback),
		listen: oneOf(LISTENS, listen, DEFAULT_FIGURE_PARAMS.listen),
		cursor: typeof cursor === 'boolean' ? cursor : DEFAULT_FIGURE_PARAMS.cursor,
		neck: typeof neck === 'boolean' ? neck : DEFAULT_FIGURE_PARAMS.neck,
		liveMarks: typeof liveMarks === 'boolean' ? liveMarks : DEFAULT_FIGURE_PARAMS.liveMarks,
		nextBeats:
			typeof nextBeats === 'number' && nextBeats > 0 ? nextBeats : DEFAULT_FIGURE_PARAMS.nextBeats,
		thresholds:
			typeof thresholds === 'object' && thresholds !== null
				? { ...(thresholds as CycleThresholds) }
				: { ...DEFAULT_FIGURE_PARAMS.thresholds }
	};
}

/** The content the round's first figure entry gives its notes: null, `'figure'` or a derivation. */
function figureContentOf(definition: ExerciseDefinition): string | null {
	const entry = definition.round?.expectations.find(isFigureEntry);
	return entry?.content?.from ?? null;
}

/**
 * How a figure is engraved when no level says: the pitches written in the figure (content
 * `{ from: 'figure' }`) as staff and tab; notes derived from the item, the prompt telling them,
 * and a bare rhythm, as the rhythm line.
 */
export function contentNotationOf(definition: ExerciseDefinition): Notation {
	const written = figureContentOf(definition) === FIGURE_CONTENT;
	return { staff: written, tab: written };
}

/** The notation a level's params write, the part it leaves out from the content; null without. */
function notationParam(definition: ExerciseDefinition, value: unknown): Notation | null {
	if (typeof value !== 'object' || value === null) return null;
	const { staff, tab } = value as Record<string, unknown>;
	const otherwise = contentNotationOf(definition);
	return {
		staff: typeof staff === 'boolean' ? staff : otherwise.staff,
		tab: typeof tab === 'boolean' ? tab : otherwise.tab
	};
}

/** How the figure of exercise level `exerciseLevel` is engraved: what the level writes, else the content's. */
export function notationOf(definition: ExerciseDefinition, exerciseLevel: number): Notation {
	return figureParamsOf(definition, exerciseLevel).notation ?? contentNotationOf(definition);
}
