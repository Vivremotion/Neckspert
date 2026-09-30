import {
	cardKey,
	type CardState,
	type Curriculum,
	type CurriculumSet,
	type Target
} from '$lib/domain/types';
import { UNLOCK_RATIO } from './constants';

function acquiredKeys(cards: readonly CardState[]): Set<string> {
	return new Set(cards.filter((card) => card.acquiredAt !== null).map((card) => card.key));
}

function isSetAcquiredEnough(
	set: CurriculumSet,
	acquired: ReadonlySet<string>
): boolean {
	if (set.targets.length === 0) return true;
	let count = 0;
	for (const target of set.targets) {
		if (acquired.has(cardKey(target))) count++;
	}
	return count / set.targets.length >= UNLOCK_RATIO;
}

export function unlockedSets(
	curriculum: Curriculum,
	cards: readonly CardState[]
): CurriculumSet[] {
	const acquired = acquiredKeys(cards);
	const byId = new Map(curriculum.map((set) => [set.id, set]));
	const unlocked: CurriculumSet[] = [];

	for (const set of curriculum) {
		if (set.requires === null) {
			unlocked.push(set);
			continue;
		}
		const required = byId.get(set.requires);
		if (required && isSetAcquiredEnough(required, acquired)) {
			unlocked.push(set);
		}
	}
	return unlocked;
}

export function nextNewTargets(
	curriculum: Curriculum,
	cards: readonly CardState[],
	count: number
): Target[] {
	const existing = new Set(cards.map((card) => card.key));
	const result: Target[] = [];
	for (const set of unlockedSets(curriculum, cards)) {
		for (const target of set.targets) {
			if (existing.has(cardKey(target))) continue;
			result.push(target);
			if (result.length >= count) return result;
		}
	}
	return result;
}
