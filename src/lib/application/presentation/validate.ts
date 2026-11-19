import { exerciseSetId } from '$lib/domain/sets';
import { notationOf, writesFigure } from '$lib/domain/exercise/figureParams';
import { exerciseLevelsOf, resolvedParamsOf } from '$lib/domain/exercise/levels';
import {
	FIGURE_CONTENT,
	isFigureEntry,
	paramValue,
	type FigureRef
} from '$lib/domain/exercise/round';
import { levelRange, type Figure } from '$lib/domain/time';
import { fretOf } from '$lib/domain/music/fretboard';
import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import type { ExerciseDefinition, Slot } from '$lib/domain/exercise/types';
import { validateExercise } from '$lib/domain/exercise/validate';
import { lookUpPresenter, type PresenterRegistries } from '$lib/application/sets/lookUp';
import { playViewOf } from '$lib/application/session/contract';
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

/** The families whose members the round template's expectations select, in order, each once. */
function memberFamilies(definition: ExerciseDefinition): string[] {
	const families = (definition.round?.expectations ?? []).flatMap(({ content }) =>
		isSelectionTemplate(content) ? [content.family] : []
	);
	return [...new Set(families)];
}

/**
 * Null when the exercise's presentation can be written, else what it cannot: a slot that names a
 * field neither its set nor any family its round selects members of (`memberFieldNames`)
 * has, a picture that does not exist or does not read its set, the picture of the members
 * admitted (`CONTENT_PICTURES`) for a round that selects none. Names the exercise and the field.
 * It is not part of `validateExercise` because its words are code of the application layer.
 */
export function presentationProblem(definition: ExerciseDefinition): string | null {
	const presentation = definition.presentation;
	if (!presentation) return null;
	const { id } = definition;
	const set = exerciseSetId(definition);
	const families = memberFamilies(definition);
	const offered = families.flatMap((family) => memberFieldNames(family));
	const known = [...(Object.hasOwn(ITEM_FIELDS, set) ? ITEM_FIELDS[set].names : []), ...offered];
	// The families are named once one of them offers fields: a slot could have read one.
	const owners =
		offered.length === 0
			? `which ${set} does not have`
			: `which neither ${[set, ...families].join(' nor ')} has`;
	const slots: [string, Slot | undefined][] = [
		['primary', presentation.primary],
		['secondary', presentation.secondary],
		['detail', presentation.detail],
		['target', presentation.target],
		['band', presentation.band],
		['preview', presentation.preview],
		['aided.line', presentation.aided?.line]
	];
	for (const [path, slot] of slots) {
		if (slot === undefined) continue;
		const unknown = placeholders(slot).find((name) => !known.includes(name));
		if (unknown !== undefined) {
			return `${id}: presentation.${path} names field "${unknown}", ${owners}`;
		}
	}
	const pictures: [string, string | undefined][] = [
		['aided.picture', presentation.aided?.picture],
		['fading.picture', presentation.fading?.picture]
	];
	for (const [path, name] of pictures) {
		if (name === undefined) continue;
		if (CONTENT_PICTURES.includes(name)) {
			if (families.length > 0) continue;
			return `${id}: presentation.${path} names picture "${name}", which draws the members its round admits, and no expectation of its round has a member content`;
		}
		const picture = Object.hasOwn(PICTURES, name) ? PICTURES[name] : undefined;
		if (!picture) {
			return `${id}: presentation.${path} names picture "${name}", which does not exist`;
		}
		if (!picture.reads.includes(set)) {
			return `${id}: presentation.${path} names picture "${name}", which does not read ${set}`;
		}
	}
	return null;
}

/**
 * Null when the exercise can be drawn, else what cannot, naming the exercise and the field: a
 * view the screen does not have (`PLAY_VIEW_NAMES`); the figure view for a round that plays no
 * figure (`writesFigure`), which it draws with or without a prompt; a presentation drawn by a
 * view that does not draw one (`PROMPT_STAGE_VIEWS`), or such a view with no presentation to
 * read; a response exercise (one that writes its `round`) with neither a presentation nor a
 * screen of its presenter (`stageOf`); a level of the figure view that shows the tab of
 * a figure with a note it cannot fret (`tabProblem`); a view that draws a passage
 * (`PASSAGE_VIEWS`) on an exercise that writes no `passages`. The view is the exercise's, else
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
	if (PASSAGE_VIEWS.includes(drawn) && definition.passages === undefined) {
		return `${id}: view "${drawn}" draws a passage, and the exercise writes no passages`;
	}
	if (drawn === FIGURE_VIEW) {
		return writesFigure(definition)
			? tabProblem(definition)
			: `${id}: view "${drawn}" draws the figure of its round, and the round plays none`;
	}
	const readsPrompt = PROMPT_STAGE_VIEWS.includes(drawn);
	if (definition.presentation !== undefined) {
		return readsPrompt
			? null
			: `${id}: view "${drawn}" cannot draw a presentation (the views that do: ${PROMPT_STAGE_VIEWS.join(', ')})`;
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
 */
export function previewProblem(
	definition: ExerciseDefinition,
	registries: PresenterRegistries
): string | null {
	if (definition.round === undefined || definition.flow?.previewBeats !== undefined) return null;
	const presenter = lookUpPresenter(definition, registries);
	const previewBeats = previewBeatsOf(definition, presenter?.previewBeats) ?? 0;
	const problem = validateExercise({
		...definition,
		flow: { ...definition.flow, previewBeats }
	});
	return problem === null
		? null
		: `${problem} (its preview is ${exerciseSetId(definition)}'s, ${previewBeats} beats)`;
}
