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
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import { playViewOf } from '$lib/application/session/contract';
import { ITEM_FIELDS } from './itemFields';
import { PICTURES } from './pictures';
import { FIGURE_VIEW, PLAY_VIEW_NAMES, PROMPT_STAGE_VIEWS } from './playViews';

/** The names of the `{fields}` a slot reads, in each language. */
function placeholders(slot: Slot): string[] {
	const texts = typeof slot === 'string' ? [slot] : [slot.fr, slot.en];
	return texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
}

/**
 * Null when the exercise's presentation can be written, else what it cannot: a slot that names a
 * field its mechanic does not have, a picture that does not exist or does not read its
 * mechanic. Names the exercise and the field. It is not part of `validateExercise` because its
 * words are code of the application layer.
 */
export function presentationProblem(definition: ExerciseDefinition): string | null {
	const presentation = definition.presentation;
	if (!presentation) return null;
	const { id, mechanic } = definition;
	const known = ITEM_FIELDS[mechanic]?.names ?? [];
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
			return `${id}: presentation.${path} names field "${unknown}", which ${mechanic} does not have`;
		}
	}
	const pictures: [string, string | undefined][] = [
		['aided.picture', presentation.aided?.picture],
		['fading.picture', presentation.fading?.picture]
	];
	for (const [path, name] of pictures) {
		if (name === undefined) continue;
		const picture = Object.hasOwn(PICTURES, name) ? PICTURES[name] : undefined;
		if (!picture) {
			return `${id}: presentation.${path} names picture "${name}", which does not exist`;
		}
		if (!picture.reads.includes(mechanic)) {
			return `${id}: presentation.${path} names picture "${name}", which does not read ${mechanic}`;
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
 * screen of its mechanic presenter (`stageOf`); a level of the figure view that shows the tab of
 * a figure with a note it cannot fret (`tabProblem`). The view is the exercise's, else the one the
 * series gives it (`playViewOf`).
 */
export function screenProblem(
	definition: ExerciseDefinition,
	presenters: Readonly<Record<string, Pick<MechanicPresenter, 'stageOf'>>>
): string | null {
	const { id, view } = definition;
	if (view !== undefined && !PLAY_VIEW_NAMES.includes(view)) {
		return `${id}: view "${view}" is not a view of the screen (known: ${PLAY_VIEW_NAMES.join(', ')})`;
	}
	const drawn = playViewOf(definition);
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
	const presenter = Object.hasOwn(presenters, definition.mechanic)
		? presenters[definition.mechanic]
		: undefined;
	if (presenter?.stageOf) return null;
	return `${id}: writes a round but no presentation, and ${definition.mechanic} draws no screen of its own`;
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
 * (`flow.previewBeats`, which `validateExercise` checks), else its mechanic presenter's, else
 * none. With the presenter's, what the round cannot run once that preview is read (a
 * `{ param: 'previewBeats' }` that leaves no listening), naming the exercise and the field.
 */
export function previewProblem(
	definition: ExerciseDefinition,
	presenters: Readonly<Record<string, Pick<MechanicPresenter, 'previewBeats'>>>
): string | null {
	if (definition.round === undefined || definition.flow?.previewBeats !== undefined) return null;
	const presenter = Object.hasOwn(presenters, definition.mechanic)
		? presenters[definition.mechanic]
		: undefined;
	const previewBeats = previewBeatsOf(definition, presenter?.previewBeats) ?? 0;
	const problem = validateExercise({
		...definition,
		flow: { ...definition.flow, previewBeats }
	});
	return problem === null
		? null
		: `${problem} (its preview is ${definition.mechanic}'s, ${previewBeats} beats)`;
}
