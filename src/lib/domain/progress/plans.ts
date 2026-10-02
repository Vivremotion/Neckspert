import { practiceTargets } from '$lib/domain/music';
import { cardKey, LEAD_STEPS, type CardState, type PlannedItem } from '$lib/domain/types';
import { FREE_PLAY_COUNT } from './constants';

function shuffle<T>(items: readonly T[], random: () => number): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/** Free-play prompts drawn from every position; known locate cards keep their lead. */
export function buildFreePlan(input: {
	cards: readonly CardState[];
	count?: number;
	random?: () => number;
}): PlannedItem[] {
	const random = input.random ?? Math.random;
	const count = input.count ?? FREE_PLAY_COUNT;
	const byKey = new Map(input.cards.map((card) => [card.key, card]));
	return shuffle(practiceTargets(), random)
		.slice(0, count)
		.map((target) => {
			const card = byKey.get(cardKey(target));
			return {
				target,
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				leadBeats: target.direction === 'locate' ? (card?.leadBeats ?? LEAD_STEPS[0]) : null
			};
		});
}
