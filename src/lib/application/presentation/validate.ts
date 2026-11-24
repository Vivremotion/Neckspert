import { exerciseSetId } from '$lib/domain/sets';
import { notationOf, writesFigure } from '$lib/domain/exercise/figureParams';
import {
	exerciseLevelsOf,
	isPresentationPath,
	presentationOf,
	resolvedParamsOf
} from '$lib/domain/exercise/levels';
import {
	FIGURE_CONTENT,
	isFigureEntry,
	paramValue,
	type FigureRef
} from '$lib/domain/exercise/round';
import { levelRange, type Figure } from '$lib/domain/time';
import { fretOf } from '$lib/domain/music/fretboard';
import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import type {
	ExerciseDefinition,
	Ladder,
	PromptPresentation,
	Slot
} from '$lib/domain/exercise/types';
import { validateExercise } from '$lib/domain/exercise/validate';
import type { CheckBudget } from '$lib/domain/exercise/checkCost';
import { lookUpPresenter, type PresenterRegistries } from '$lib/application/sets/lookUp';
import { DEFAULT_PLAY_VIEW, playViewOf } from '$lib/application/session/contract';
import { isSelectionTemplate } from '$lib/domain/exercise/selection/types';
import { memberFieldNames } from './contentViews';
import { ITEM_FIELDS } from './itemFields';
import { CONTENT_PICTURES, PICTURES } from './pictures';
import { FIGURE_VIEW, PASSAGE_VIEWS, PLAY_VIEW_NAMES, PROMPT_STAGE_VIEWS } from './playViews';

/** The names of the `{fields}` a slot reads, in each language. */
function placeholders(slot: Slot): string[] {
	const texts = typeof slot === 'string' ? [slot] : [slot.fr, slot.en];
	return texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a slot is written as one: a text, or `{ fr, en }`, each a text. */
const isSlot = (value: unknown): value is Slot =>
	typeof value === 'string' ||
	(isRecord(value) && typeof value.fr === 'string' && typeof value.en === 'string');

/** The text slots of a presentation, by their path under `presentation`. */
const TEXT_SLOTS = ['primary', 'secondary', 'detail', 'target', 'band', 'preview'] as const;

/**
 * Why the presentation is not written as the screen reads it, naming the field: no object, a
 * slot that is neither a text nor `{ fr, en }` (one language alone, a number, an object without
 * texts), a picture that is no name. Its texts and names are checked after.
 */
function presentationShapeProblem(presentation: unknown): string | null {
	if (!isRecord(presentation)) return 'presentation must be an object';
	for (const slot of TEXT_SLOTS) {
		const value = presentation[slot];
		if (value !== undefined && !isSlot(value)) {
			return `presentation.${slot} must be a text or { fr, en }`;
		}
	}
	const { picture } = presentation;
	if (picture !== undefined && typeof picture !== 'string') {
		return 'presentation.picture must name a picture';
	}
	return null;
}

/** The families whose members the round template's expectations select, in order, each once. */
function memberFamilies(definition: ExerciseDefinition): string[] {
	const families = (definition.round?.expectations ?? []).flatMap(({ content }) =>
		isSelectionTemplate(content) ? [content.family] : []
	);
	return [...new Set(families)];
}

/**
 * What checks a presentation of the exercise: null when it can be written, else what it cannot,
 * naming the field, not the exercise: a slot that names a field neither its set nor any family its
 * round selects members of (`memberFieldNames`) has, a picture that does not exist or does not
 * read its set, the picture of the members admitted (`CONTENT_PICTURES`) for a round that selects
 * none, or of an exercise drawn on a view that draws no passage (`PASSAGE_VIEWS`); before them, a
 * presentation not written as the screen reads it (`presentationShapeProblem`). What the exercise
 * gives is read once, and the fields of a slot once however many of its levels resolve it.
 */
function presentationChecker(
	definition: ExerciseDefinition
): (presentation: unknown) => string | null {
	const set = exerciseSetId(definition);
	const families = memberFamilies(definition);
	const offered = families.flatMap((family) => memberFieldNames(family));
	const known = [...(Object.hasOwn(ITEM_FIELDS, set) ? ITEM_FIELDS[set].names : []), ...offered];
	// The families are named once one of them offers fields: a slot could have read one.
	const owners =
		offered.length === 0
			? `which ${set} does not have`
			: `which neither ${[set, ...families].join(' nor ')} has`;
	// A level's resolution keeps the slots it does not write: each is read once.
	const unknownFields = new Map<Slot, string | undefined>();
	const unknownIn = (slot: Slot): string | undefined => {
		if (!unknownFields.has(slot)) {
			unknownFields.set(
				slot,
				placeholders(slot).find((name) => !known.includes(name))
			);
		}
		return unknownFields.get(slot);
	};
	return (presentation) => {
		const shape = presentationShapeProblem(presentation);
		if (shape !== null) return shape;
		const written = presentation as PromptPresentation;
		const slots: [string, Slot | undefined][] = [
			['primary', written.primary],
			['secondary', written.secondary],
			['detail', written.detail],
			['target', written.target],
			['band', written.band],
			['preview', written.preview]
		];
		for (const [path, slot] of slots) {
			if (slot === undefined) continue;
			const unknown = unknownIn(slot);
			if (unknown !== undefined) {
				return `presentation.${path} names field "${unknown}", ${owners}`;
			}
		}
		const name = written.picture;
		if (name === undefined) return null;
		if (CONTENT_PICTURES.includes(name)) {
			if (families.length === 0) {
				return `presentation.picture names picture "${name}", which draws the members its round admits, and no expectation of its round has a member content`;
			}
			const view = playViewOf(definition);
			if (!PASSAGE_VIEWS.includes(view)) {
				return `presentation.picture names picture "${name}", which only a view that draws a passage draws (${PASSAGE_VIEWS.join(', ')}), and the exercise is drawn on "${view}"`;
			}
			return null;
		}
		const picture = Object.hasOwn(PICTURES, name) ? PICTURES[name] : undefined;
		if (!picture) return `presentation.picture names picture "${name}", which does not exist`;
		if (!picture.reads.includes(set)) {
			return `presentation.picture names picture "${name}", which does not read ${set}`;
		}
		return null;
	};
}

/** Whether a level writes a path of the presentation (`isPresentationPath`). */
const rewritesPresentation = (level: { params?: unknown }): boolean =>
	isRecord(level.params) && Object.keys(level.params).some(isPresentationPath);

/**
 * Null when the exercise's presentation can be written at every level, else what it cannot
 * (`presentationChecker`): the one it writes, then the one each exercise level that rewrites it
 * resolves (`presentationOf`), then, when it writes a ladder, the one each item level that
 * rewrites it resolves over each exercise level. Names the exercise, the level (`levels[i]`,
 * `params.ladder[i]`, with the exercise level it resolves over when the exercise writes levels)
 * and the field. A level that rewrites no slot resolves the presentation it lies over, checked
 * there. Resolving the levels is charged with the other level checks (`levelsCheckCost`).
 * It is not part of `validateExercise` because its words are code of the application layer.
 */
export function presentationProblem(definition: ExerciseDefinition): string | null {
	if (definition.presentation === undefined) return null;
	const { id } = definition;
	const check = presentationChecker(definition);
	const base = check(definition.presentation);
	if (base !== null) return `${id}: ${base}`;
	const at = (
		field: string,
		levels: { exerciseLevel: number; itemLevel: number | null }
	): string | null => {
		let resolved: PromptPresentation | undefined;
		try {
			resolved = presentationOf(definition, levels);
		} catch (error) {
			return `${id}: ${field} ${(error as Error).message}`;
		}
		const problem = check(resolved);
		return problem === null ? null : `${id}: ${field}: ${problem}`;
	};
	const exerciseLevels = exerciseLevelsOf(definition);
	const { lowest } = levelRange(exerciseLevels);
	for (const [i, level] of exerciseLevels.entries()) {
		if (!rewritesPresentation(level)) continue;
		const problem = at(`levels[${i}]`, { exerciseLevel: i + lowest, itemLevel: null });
		if (problem !== null) return problem;
	}
	const ladder = definition.params.ladder as Ladder | undefined;
	if (!Array.isArray(ladder)) return null;
	const first = levelRange(ladder).lowest;
	const writesLevels = (definition.levels?.length ?? 0) > 0;
	for (const [j, step] of ladder.entries()) {
		if (!rewritesPresentation(step)) continue;
		for (const i of exerciseLevels.keys()) {
			const over = writesLevels ? ` at levels[${i}]` : '';
			const levels = { exerciseLevel: i + lowest, itemLevel: j + first };
			const problem = at(`params.ladder[${j}]${over}`, levels);
			if (problem !== null) return problem;
		}
	}
	return null;
}

/**
 * Null when the exercise can be drawn, else what cannot, naming the exercise and the field: a
 * view the screen does not have (`PLAY_VIEW_NAMES`); the figure view for a round that plays no
 * figure (`writesFigure`), which it draws with or without a prompt; a presentation drawn by a
 * view that does not draw one (`PROMPT_STAGE_VIEWS`, or a view of `PASSAGE_VIEWS` on an
 * exercise that writes `passages`), or a prompt view with no presentation to read; a response exercise (one that writes its `round`) with neither a presentation nor a
 * screen of its presenter (`stageOf`); a level of the figure view that shows the tab of
 * a figure with a note it cannot fret (`tabProblem`); a view that draws a passage
 * (`PASSAGE_VIEWS`, but the default view of an exercise its presenter draws, with no
 * presentation) on an exercise that writes no `passages`. The view is the exercise's, else
 * the one the series gives it (`playViewOf`).
 */
export function screenProblem(
	definition: ExerciseDefinition,
	registries: PresenterRegistries
): string | null {
	const { id, view } = definition;
	if (view !== undefined && !PLAY_VIEW_NAMES.includes(view)) {
		return `${id}: view "${view}" is not a view of the screen (known: ${PLAY_VIEW_NAMES.join(', ')})`;
	}
	const drawn = playViewOf(definition);
	const drawsPassage =
		PASSAGE_VIEWS.includes(drawn) &&
		// The default view without a presentation is the screen its presenter draws.
		(definition.presentation !== undefined || drawn !== DEFAULT_PLAY_VIEW);
	if (drawsPassage && definition.passages === undefined) {
		return `${id}: view "${drawn}" draws a passage, and the exercise writes no passages`;
	}
	if (drawn === FIGURE_VIEW) {
		return writesFigure(definition)
			? tabProblem(definition)
			: `${id}: view "${drawn}" draws the figure of its round, and the round plays none`;
	}
	const readsPrompt = PROMPT_STAGE_VIEWS.includes(drawn);
	if (definition.presentation !== undefined) {
		return readsPrompt || drawsPassage
			? null
			: `${id}: view "${drawn}" cannot draw a presentation (the views that do: ${[...PROMPT_STAGE_VIEWS, ...PASSAGE_VIEWS].join(', ')})`;
	}
	if (readsPrompt) {
		return `${id}: view "${drawn}" draws a presentation, and the exercise writes none`;
	}
	if (definition.round === undefined) return null;
	if (lookUpPresenter(definition, registries)?.stageOf) return null;
	return `${id}: writes a round but no presentation, and ${exerciseSetId(definition)} draws no screen of its own`;
}

/** The figures a figure entry may play at an exercise level: the one it names, else all of them. */
function figuresAt(
	definition: ExerciseDefinition,
	ref: FigureRef,
	exerciseLevel: number
): { id: string; figure: Figure }[] {
	const figures = definition.figures ?? [];
	if ('item' in ref) return [...figures];
	const id =
		'id' in ref
			? ref.id
			: paramValue(resolvedParamsOf(definition, { exerciseLevel, itemLevel: null }), ref.param);
	return figures.filter((figure) => figure.id === id);
}

/** What keeps a figure from its tab: a note without a string or a pitch, or off its string's frets (`fretOf`). */
function unfrettedNote(figure: Figure): string | null {
	for (const voice of figure.voices) {
		for (const [i, element] of voice.elements.entries()) {
			if (element.kind !== 'note') continue;
			const note = `note ${i + 1}${figure.voices.length > 1 ? ` of voice "${voice.id}"` : ''}`;
			const fret = fretOf(element.pitch, element.string);
			if ('problem' in fret) return `${note} ${fret.problem}`;
		}
	}
	return null;
}

/**
 * Null when every level that shows the tab of its figure can engrave it, else the first that
 * cannot (an engine limit: no tab without strings): a note of the figures it may play written
 * without a string, a pitch, or off its string's frets. Notes derived from the item take the pitch and
 * the string the derivation gives.
 */
function tabProblem(definition: ExerciseDefinition): string | null {
	const entry = definition.round?.expectations.find(isFigureEntry);
	if (!entry || (entry.content !== null && entry.content.from !== FIGURE_CONTENT)) return null;
	const { lowest, highest } = levelRange(exerciseLevelsOf(definition));
	for (let level = lowest; level <= highest; level++) {
		if (!notationOf(definition, level).tab) continue;
		for (const { id, figure } of figuresAt(definition, entry.figure, level)) {
			const problem = unfrettedNote(figure);
			if (problem) {
				return `${definition.id}: exercise level ${level} shows the tab of figure "${id}", whose ${problem}`;
			}
		}
	}
	return null;
}

/**
 * Null when the exercise's round can run with the preview the series gives it: its own
 * (`flow.previewBeats`, which `validateExercise` checks), else its presenter's, else
 * none. With the presenter's, what the round cannot run once that preview is read (a
 * `{ param: 'previewBeats' }` that leaves no listening), naming the exercise and the field.
 * Its rounds are compiled again, charged to `budget` (its file's) when given; once spent, the
 * budget's words are said alone.
 */
export function previewProblem(
	definition: ExerciseDefinition,
	registries: PresenterRegistries,
	budget?: CheckBudget
): string | null {
	if (definition.round === undefined || definition.flow?.previewBeats !== undefined) return null;
	const presenter = lookUpPresenter(definition, registries);
	const previewBeats = previewBeatsOf(definition, presenter?.previewBeats) ?? 0;
	const problem = validateExercise(
		{ ...definition, flow: { ...definition.flow, previewBeats } },
		budget && { budget }
	);
	if (problem === null) return null;
	if (budget?.refusal) return `${definition.id}: ${budget.refusal}`;
	return `${problem} (its preview is ${exerciseSetId(definition)}'s, ${previewBeats} beats)`;
}
