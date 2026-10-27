import type { ExerciseDefinition, Slot } from '$lib/domain/exercise/types';
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
