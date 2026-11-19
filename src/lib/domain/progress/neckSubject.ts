import { ladderOf } from '$lib/domain/exercise/ladder';
import { exerciseRecallOf } from '$lib/domain/exercise/recall';
import { IDENTIFY_SKILL_ID, LOCATE_SKILL_ID } from '$lib/domain/exercise/catalogIds';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import type { SkillId } from '$lib/domain/skill/types';
import { itemLearningOf, type DirectRecall, type LearningSubject } from '$lib/domain/learning';
import type { IdentifyData, LocateData } from '$lib/domain/sets';
import {
	asNeckCard,
	identifyItemKey,
	locateItemKey,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import { nextNewCard } from './introduction';
import { isNeck } from './neck';

/** The neck's exercise of a skill; throws on a skill outside the neck. */
function neckExercise(
	definitions: { locate: ExerciseDefinition; identify: ExerciseDefinition },
	skill: SkillId
): ExerciseDefinition {
	if (skill === LOCATE_SKILL_ID) return definitions.locate;
	if (skill === IDENTIFY_SKILL_ID) return definitions.identify;
	throw new Error(`Not a neck skill: ${skill}`);
}

function itemKeyOf(card: NeckCard): string {
	return card.skill === LOCATE_SKILL_ID ? locateItemKey(card.item) : identifyItemKey(card.item);
}

/**
 * The neck's notes as a subject of the learning procedure: locate and identify, introduced in the
 * neck's order (`priority`, the triads' notes, first). Each climbs the ladder its exercise writes (locate its leads,
 * identify the name shown) and judges direct recall by the time the skill its exercise practises writes.
 */
export function neckSubject(input: {
	definitions: { locate: ExerciseDefinition; identify: ExerciseDefinition };
	priority?: readonly LocateItem[];
}): LearningSubject {
	const { definitions } = input;
	const priority = input.priority ?? [];
	const recalls: Record<NeckCard['skill'], DirectRecall> = {
		[LOCATE_SKILL_ID]: exerciseRecallOf(definitions.locate),
		[IDENTIFY_SKILL_ID]: exerciseRecallOf(definitions.identify)
	};
	const ladders = {
		[LOCATE_SKILL_ID]: ladderOf(definitions.locate),
		[IDENTIFY_SKILL_ID]: ladderOf(definitions.identify)
	};
	const neck = (skill: SkillId): NeckCard['skill'] =>
		neckExercise(definitions, skill) === definitions.locate ? LOCATE_SKILL_ID : IDENTIFY_SKILL_ID;

	return {
		owns: isNeck,
		itemKey: (card) => itemKeyOf(asNeckCard(card)),
		exerciseOf: (skill): ExerciseId => neckExercise(definitions, skill).id,
		nextNew(cards, _history, blocked) {
			const next = nextNewCard(cards.filter(isNeck), priority);
			if (next === null || blocked(next)) return null;
			return next;
		},
		presentsAtOnce: true,
		ladder: (skill) => ladders[neck(skill)],
		itemLearning: (skill) => itemLearningOf(neckExercise(definitions, skill)),
		recall: (skill) => recalls[neck(skill)],
		confused: (attempt) => {
			const data = attempt.data as LocateData | IdentifyData | null;
			return data !== null && data.confusion !== null;
		},
		fadingAid: (skill) => skill === LOCATE_SKILL_ID
	};
}
