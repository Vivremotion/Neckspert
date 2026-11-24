/**
 * The neck's old lists and helpers, for the tests only: the code reads the neck's places from the
 * items its exercises list (`neckOf`, `domain/progress/neck.ts`).
 */
import type { ExerciseId } from '$lib/domain/exercise/types';
import {
	identifyItemKey,
	locateItemKey,
	pitchOnString,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music';
import { MAX_PROMPT_FRET, type StringNumber } from '$lib/domain/music/types';
import { cardKey, type CardKey, type PlannedItem, type SkillId } from '$lib/domain/types';
import { IDENTIFY_NECK_ID, IDENTIFY_SKILL_ID, LOCATE_NECK_ID, LOCATE_SKILL_ID } from './catalogIds';

/**
 * A card of the neck: one item of a skill that locates notes (a `LocateItem`) or names places (an
 * `IdentifyItem`); the item tells which.
 */
export type NeckCard =
	{ skill: SkillId; item: LocateItem } | { skill: SkillId; item: IdentifyItem };

function isLocateItem(item: LocateItem | IdentifyItem): item is LocateItem {
	return 'pitch' in item;
}

/** A neck card's key: its skill, then its item's key. */
export function neckCardKey(card: NeckCard): CardKey {
	return cardKey(
		card.skill,
		isLocateItem(card.item) ? locateItemKey(card.item) : identifyItemKey(card.item)
	);
}

/** A card, attempt-free prompt or planned item of the neck, read as a `NeckCard`. */
export function asNeckCard(x: { skill: string; item: unknown }): NeckCard {
	const item = x.item as Partial<LocateItem & IdentifyItem> | null;
	if (item && typeof item.string === 'number') {
		if (typeof item.pitch === 'string') return { skill: x.skill, item: item as LocateItem };
		if (typeof item.fret === 'number') return { skill: x.skill, item: item as IdentifyItem };
	}
	throw new Error(`Not a neck item: ${x.skill}`);
}

/** Teaching order: low E string first. */
export const CURRICULUM_STRINGS: readonly StringNumber[] = [6, 5, 4, 3, 2, 1];

/** Frets taught and prompted. Fret 0 is left out: open strings are assumed known. */
export const LEARNABLE_FRETS: readonly number[] = Array.from(
	{ length: MAX_PROMPT_FRET },
	(_, index) => index + 1
);

function locateItem(string: StringNumber, fret: number): LocateItem {
	return { string, pitch: pitchOnString(string, fret) };
}

/** Every locate item: strings 6 to 1, frets 1 to 11 on each (66 items). */
export function locateItems(): LocateItem[] {
	return CURRICULUM_STRINGS.flatMap((string) =>
		LEARNABLE_FRETS.map((fret) => locateItem(string, fret))
	);
}

/** Every card of the notes' two catalog skills: 66 locate, then 66 identify. */
export function practiceCards(): NeckCard[] {
	return [
		...locateItems().map((item): NeckCard => ({ skill: LOCATE_SKILL_ID, item })),
		...CURRICULUM_STRINGS.flatMap((string) =>
			LEARNABLE_FRETS.map((fret): NeckCard => ({
				skill: IDENTIFY_SKILL_ID,
				item: { string, fret }
			}))
		)
	];
}

/** The catalog exercise of a neck card's skill. */
export function neckExerciseId(skill: SkillId): ExerciseId {
	if (skill === LOCATE_SKILL_ID) return LOCATE_NECK_ID;
	if (skill === IDENTIFY_SKILL_ID) return IDENTIFY_NECK_ID;
	throw new Error(`Not a neck skill: ${skill}`);
}

/** A neck card with its key, as `introduceCard` takes it. */
export function keyed(card: NeckCard): {
	key: CardKey;
	skill: NeckCard['skill'];
	item: NeckCard['item'];
} {
	return { key: neckCardKey(card), skill: card.skill, item: card.item };
}

/** A prompt of a neck card, in the catalog exercise of its skill. */
export function plannedFor(
	card: NeckCard,
	fields: Omit<PlannedItem, 'exerciseId' | 'skill' | 'item'>
): PlannedItem {
	return {
		exerciseId: neckExerciseId(card.skill),
		skill: card.skill,
		item: card.item,
		...fields
	};
}
