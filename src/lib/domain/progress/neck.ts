import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import { allExercises } from '$lib/domain/exercise/registry';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { fretsForPitch, type IdentifyItem, type LocateItem } from '$lib/domain/music';
import { MAX_PROMPT_FRET, type StringNumber } from '$lib/domain/music/types';
import { noteOnStringSet, placedNoteSet, setOfSkill } from '$lib/domain/sets';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SkillId } from '$lib/domain/types';

/**
 * The neck domain (stats, neck map, free play's reviews order) knows the neck by the item sets of
 * its skills, never by a skill or an exercise of the catalog: a note to locate on a string
 * (`note-on-string`), and a place on the neck to name (`placed-note`), read from the sets
 * themselves.
 */
export const LOCATED_NOTES: string = noteOnStringSet.id;
export const NAMED_NOTES: string = placedNoteSet.id;

/** The set a skill's items belong to, when a loaded file defines the skill. */
function setNameOf(skill: SkillId): string | null {
	return hasSkill(skill) ? skillById(skill).items : null;
}

/** Whether a skill locates notes on a string (its items are `note-on-string`). */
export function isLocated(skill: SkillId): boolean {
	return setNameOf(skill) === LOCATED_NOTES;
}

/** Whether a skill names the note at a place (its items are `placed-note`). */
export function isNamed(skill: SkillId): boolean {
	return setNameOf(skill) === NAMED_NOTES;
}

/** Whether a card, an attempt or a skill belongs to the neck, not to another track (triads). */
export function isNeck(x: { skill: SkillId }): boolean {
	return isLocated(x.skill) || isNamed(x.skill);
}

/** The registered exercises whose skill's items are of `set`, in the registry's order. */
export function exercisesOnSet(
	set: string,
	exercises: readonly ExerciseDefinition[] = allExercises()
): ExerciseDefinition[] {
	return exercises.filter((exercise) => setNameOf(exercise.practices) === set);
}

/** A place of the neck: a string and a fret. */
export interface NeckPlace {
	string: StringNumber;
	fret: number;
}

/** What the neck map reads: its places, and the skill each of its two senses is read on. */
export interface Neck {
	/** The skill of the first exercise that locates notes; null when none does. */
	located: SkillId | null;
	/** The skill of the first exercise that names places; null when none does. */
	named: SkillId | null;
	/** Every place an exercise of the neck lists, by string then fret. */
	places: NeckPlace[];
}

/** The fret a located note is prompted at on its string: the lowest one above the open string. */
function fretOfLocated(item: LocateItem): number | null {
	return fretsForPitch(item.string, item.pitch, MAX_PROMPT_FRET).find((fret) => fret > 0) ?? null;
}

/**
 * The neck the exercises write: the places their items list (`definition.items`, read by their
 * skill's set), a located note at the fret it is prompted at, a named place as it is.
 */
export function neckOf(exercises: readonly ExerciseDefinition[] = allExercises()): Neck {
	const located = exercisesOnSet(LOCATED_NOTES, exercises);
	const named = exercisesOnSet(NAMED_NOTES, exercises);
	const places = new Map<string, NeckPlace>();
	const add = (string: StringNumber, fret: number | null) => {
		if (fret !== null) places.set(`${string}:${fret}`, { string, fret });
	};
	for (const exercise of located) {
		const set = setOfSkill(exercise.practices);
		for (const entry of exercise.items ?? []) {
			const item = set.parseItem(itemEntryKey(entry)) as LocateItem;
			add(item.string, fretOfLocated(item));
		}
	}
	for (const exercise of named) {
		const set = setOfSkill(exercise.practices);
		for (const entry of exercise.items ?? []) {
			const item = set.parseItem(itemEntryKey(entry)) as IdentifyItem;
			add(item.string, item.fret);
		}
	}
	return {
		located: located[0]?.practices ?? null,
		named: named[0]?.practices ?? null,
		places: [...places.values()].sort((a, b) => a.string - b.string || a.fret - b.fret)
	};
}
