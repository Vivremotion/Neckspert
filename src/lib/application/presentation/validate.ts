import { previewBeatsOf } from '$lib/domain/exercise/pacing';
import type { ExerciseDefinition, Slot } from '$lib/domain/exercise/types';
import { validateExercise } from '$lib/domain/exercise/validate';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import { ITEM_FIELDS } from './itemFields';
import { PICTURES } from './pictures';

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
 * Null when a response exercise (one that writes its `round`) has a screen: the model every
 * presentation shares, else its mechanic presenter's own (`stageOf`); else that it has none,
 * naming the exercise. An exercise without a round is played another way and passes.
 */
export function screenProblem(
	definition: ExerciseDefinition,
	presenters: Readonly<Record<string, Pick<MechanicPresenter, 'stageOf'>>>
): string | null {
	if (definition.round === undefined || definition.presentation !== undefined) return null;
	const presenter = Object.hasOwn(presenters, definition.mechanic)
		? presenters[definition.mechanic]
		: undefined;
	if (presenter?.stageOf) return null;
	return `${definition.id}: writes a round but no presentation, and ${definition.mechanic} draws no screen of its own`;
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
