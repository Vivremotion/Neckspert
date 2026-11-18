import {
	IDENTIFY_NECK_ID,
	IDENTIFY_SKILL_ID,
	LOCATE_NECK_ID,
	LOCATE_SKILL_ID
} from '$lib/domain/exercise/catalogIds';
import type { ExerciseId } from '$lib/domain/exercise/types';
import { neckCardKey, type NeckCard } from '$lib/domain/music';
import type { CardKey, PlannedItem, SkillId } from '$lib/domain/types';

/**
 * The neck domain (learn selector, introduction queue, free plan, stats) knows both of its
 * skills; the core does not. This is where it reads their exercises.
 */
export function neckExerciseId(skill: SkillId): ExerciseId {
	return asNeckSkill(skill) === LOCATE_SKILL_ID ? LOCATE_NECK_ID : IDENTIFY_NECK_ID;
}

/** Whether a card or an attempt belongs to the neck, not to another track (triads). */
export function isNeck(x: { skill: SkillId }): boolean {
	return x.skill === LOCATE_SKILL_ID || x.skill === IDENTIFY_SKILL_ID;
}

/** Throws on a skill outside the neck domain. */
function asNeckSkill(skill: SkillId): NeckCard['skill'] {
	if (skill === LOCATE_SKILL_ID || skill === IDENTIFY_SKILL_ID) return skill;
	throw new Error(`Not a neck skill: ${skill}`);
}

/** A neck card with its key, as `introduceCard` and `probeCard` take it. */
export function keyed(card: NeckCard): {
	key: CardKey;
	skill: NeckCard['skill'];
	item: NeckCard['item'];
} {
	return { key: neckCardKey(card), skill: card.skill, item: card.item };
}

/** A prompt of a neck card, in the exercise of its skill. */
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
