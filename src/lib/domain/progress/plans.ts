import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { ladderLevel } from '$lib/domain/learning/ladder';
import type { CardRef, LadderParams, LearningSubject } from '$lib/domain/learning/subject';
import { setOfSkill } from '$lib/domain/sets';
import { levelRange, type LevelState } from '$lib/domain/time/levels';
import { cardKey, type LeadBeats, type PlannedItem } from '$lib/domain/types';
import { FREE_PLAY_COUNT } from './constants';

function shuffle<T>(items: readonly T[], random: () => number): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/**
 * The level an item is free-played at: its level, brought into the ladder its exercise writes, as
 * the learning procedure serves it; an item without a level is at level 0, the procedure's default.
 */
export function freeLevelOf(input: {
	subject: LearningSubject;
	levels: readonly LevelState[];
}): (card: CardRef) => number {
	const { subject, levels } = input;
	return (card) => {
		const exerciseId = subject.exerciseOf(card.skill);
		const key = subject.itemKey(card);
		const held = levels.find(
			(state) => state.exerciseId === exerciseId && state.scope === '' && state.item === key
		) ?? {
			exerciseId,
			scope: '',
			item: key,
			level: 0,
			successes: 0,
			failures: 0,
			resumeAfter: null
		};
		return ladderLevel(held, subject.ladder(card.skill)).level;
	};
}

/**
 * The lead an item is free-played at: the lead of its level (`freeLevelOf`) on its exercise's
 * ladder; null when that level gives none (an item answered in free time).
 */
export function freeLeadOf(input: {
	subject: LearningSubject;
	levels: readonly LevelState[];
}): (card: CardRef) => LeadBeats | null {
	const levelOf = freeLevelOf(input);
	return (card) => {
		const ladder = input.subject.ladder(card.skill);
		const { lowest } = levelRange(ladder);
		return (ladder[levelOf(card) - lowest].params as LadderParams).leadBeats;
	};
}

/**
 * Free-play prompts drawn among the items the given exercises list (`definition.items`, read by
 * their skill's set), with or without a card. Every item is played at its level (`freeLevelOf`):
 * its screen, and whether its attempt may count cold, are that level's; at that level's lead
 * (`freeLeadOf`), none for an item answered in free time. A prompt that asks a member of its item
 * (`subject.promptItem`) is drawn once the plan is.
 */
export function buildFreePlan(input: {
	exercises: readonly ExerciseDefinition[];
	subject: LearningSubject;
	levels: readonly LevelState[];
	count?: number;
	random?: () => number;
}): PlannedItem[] {
	const random = input.random ?? Math.random;
	const count = input.count ?? FREE_PLAY_COUNT;
	const leadOf = freeLeadOf(input);
	const levelOf = freeLevelOf(input);
	const candidates = input.exercises.flatMap((definition) => {
		const skill = definition.practices;
		const set = setOfSkill(skill);
		return (definition.items ?? []).map((entry) => {
			const item = set.parseItem(itemEntryKey(entry));
			return { key: cardKey(skill, set.itemKey(item)), exerciseId: definition.id, skill, item };
		});
	});
	return shuffle(candidates, random)
		.slice(0, count)
		.map(({ exerciseId, skill, item }) => {
			const card = { skill, item };
			const level = levelOf(card);
			const asked = input.subject.promptItem?.(card, random, level) ?? item;
			return {
				exerciseId,
				skill,
				item: asked,
				phase: 'free',
				temperature: 'hot',
				leadBeats: leadOf(card),
				level,
				exerciseLevel: 0
			};
		});
}
