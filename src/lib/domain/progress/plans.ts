import {
	cardKey,
	LEAD_STEPS,
	type CardState,
	type Curriculum,
	type LocateTarget,
	type PlannedItem,
	type SessionPlan,
	type Target
} from '$lib/domain/types';
import { DAILY_COLD_CAP, NEW_PER_SESSION } from './constants';
import { nextNewTargets } from './curriculum';
import { leadForThreshold } from './lead';

function shuffle<T>(items: readonly T[], random: () => number): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

function directionRank(target: Target): number {
	return target.direction === 'locate' ? 0 : 1;
}

function dueCards(cards: readonly CardState[], now: number): CardState[] {
	return cards
		.filter((card) => card.scheduling.due <= now)
		.sort((a, b) => {
			if (a.scheduling.due !== b.scheduling.due) return a.scheduling.due - b.scheduling.due;
			const byDirection = directionRank(a.target) - directionRank(b.target);
			if (byDirection !== 0) return byDirection;
			return a.key.localeCompare(b.key);
		});
}

function reviewItem(card: CardState): PlannedItem {
	return {
		target: card.target,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: card.target.direction === 'locate' ? card.leadBeats : null,
		repeatUntilCorrect: false
	};
}

function learningItem(target: Target): PlannedItem {
	return {
		target,
		phase: 'learning',
		temperature: 'hot',
		aid: target.direction === 'locate' ? 'show-position' : 'none',
		leadBeats: target.direction === 'locate' ? 8 : null,
		repeatUntilCorrect: true
	};
}

export function buildDailyPlan(input: {
	cards: readonly CardState[];
	curriculum: Curriculum;
	now: number;
	sessionId: string;
	skipLearning?: boolean;
}): SessionPlan {
	const reviews = dueCards(input.cards, input.now).slice(0, DAILY_COLD_CAP).map(reviewItem);
	const learning = input.skipLearning
		? []
		: nextNewTargets(input.curriculum, input.cards, NEW_PER_SESSION).map(learningItem);
	return {
		id: input.sessionId,
		kind: 'daily',
		createdAt: input.now,
		items: [...reviews, ...learning]
	};
}

export function buildPlacementPlan(input: {
	targets: readonly LocateTarget[];
	now: number;
	sessionId: string;
	tempoBpm: number;
	random?: () => number;
}): SessionPlan {
	const random = input.random ?? Math.random;
	const leadBeats = leadForThreshold(input.tempoBpm);
	const items = shuffle(input.targets, random).map((target): PlannedItem => ({
		target,
		phase: 'placement',
		temperature: 'cold',
		aid: 'none',
		leadBeats,
		repeatUntilCorrect: false
	}));
	return {
		id: input.sessionId,
		kind: 'placement',
		createdAt: input.now,
		items
	};
}

function curriculumTargets(curriculum: Curriculum): Target[] {
	const seen = new Set<string>();
	const targets: Target[] = [];
	for (const set of curriculum) {
		for (const target of set.targets) {
			const key = cardKey(target);
			if (seen.has(key)) continue;
			seen.add(key);
			targets.push(target);
		}
	}
	return targets;
}

export function buildFreePlan(input: {
	cards: readonly CardState[];
	curriculum: Curriculum;
	now: number;
	sessionId: string;
	count?: number;
	random?: () => number;
}): SessionPlan {
	const random = input.random ?? Math.random;
	const count = input.count ?? DAILY_COLD_CAP;
	const byKey = new Map(input.cards.map((card) => [card.key, card]));
	const picked = shuffle(curriculumTargets(input.curriculum), random).slice(0, count);
	const items = picked.map((target): PlannedItem => {
		const card = byKey.get(cardKey(target));
		return {
			target,
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: target.direction === 'locate' ? (card?.leadBeats ?? LEAD_STEPS[0]) : null,
			repeatUntilCorrect: false
		};
	});
	return {
		id: input.sessionId,
		kind: 'free',
		createdAt: input.now,
		items
	};
}

export function nextSuggestedAt(cards: readonly CardState[], now: number): number | null {
	void now;
	if (cards.length === 0) return null;
	return Math.min(...cards.map((card) => card.scheduling.due));
}
