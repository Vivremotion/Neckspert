import { ladderOf } from '$lib/domain/exercise/ladder';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { IDENTIFY_SKILL_ID, LOCATE_SKILL_ID } from '$lib/domain/exercise/catalogIds';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import { mechanicOfSkill } from '$lib/domain/skill/bridge';
import type { SkillId } from '$lib/domain/skill/types';
import {
	directRecallOf,
	itemLearningOf,
	type CardRef,
	type DirectRecall,
	type LearningSubject
} from '$lib/domain/learning';
import type { IdentifyData, LocateData } from '$lib/domain/mechanics';
import {
	asNeckCard,
	identifyItemKey,
	isMirrorPair,
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

/** The exercise's recall threshold; the neck's exercises must declare one. */
function thresholdOf(definition: ExerciseDefinition, name: string): number {
	const threshold = recallThresholdOf(definition);
	if (threshold === null) throw new Error(`the ${name} exercise must declare its recall threshold`);
	return threshold;
}

function itemKeyOf(card: NeckCard): string {
	return card.skill === LOCATE_SKILL_ID ? locateItemKey(card.item) : identifyItemKey(card.item);
}

/**
 * The neck's notes as a subject of the learning procedure: locate and identify, introduced in the
 * neck's order (`priority`, the triads' notes, first), a note never right after itself nor its
 * mirror, another string preferred. Each climbs the ladder its exercise writes (locate its leads,
 * identify the name shown) and judges direct recall by the threshold its exercise declares.
 */
export function neckSubject(input: {
	definitions: { locate: ExerciseDefinition; identify: ExerciseDefinition };
	priority?: readonly LocateItem[];
}): LearningSubject {
	const { definitions } = input;
	const priority = input.priority ?? [];
	const recalls: Record<NeckCard['skill'], DirectRecall> = {
		[LOCATE_SKILL_ID]: directRecallOf(thresholdOf(definitions.locate, 'locate')),
		[IDENTIFY_SKILL_ID]: directRecallOf(thresholdOf(definitions.identify, 'identify'))
	};
	const ladders = {
		[LOCATE_SKILL_ID]: ladderOf(definitions.locate, mechanicOfSkill(LOCATE_SKILL_ID)),
		[IDENTIFY_SKILL_ID]: ladderOf(definitions.identify, mechanicOfSkill(IDENTIFY_SKILL_ID))
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
		neighbours(a: CardRef, b: CardRef) {
			const x = asNeckCard(a);
			const y = asNeckCard(b);
			return (x.skill === y.skill && itemKeyOf(x) === itemKeyOf(y)) || isMirrorPair(x, y);
		},
		prefers: (candidate, previous) =>
			asNeckCard(candidate).item.string !== asNeckCard(previous).item.string,
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
