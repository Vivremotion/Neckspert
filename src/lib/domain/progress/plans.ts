import { ladderLevel } from '$lib/domain/learning/ladder';
import type { LadderParams, LearningSubject } from '$lib/domain/learning/subject';
import { practiceCards, type LocateItem } from '$lib/domain/music';
import { levelRange, type LevelState } from '$lib/domain/time/levels';
import type { LeadBeats, PlannedItem } from '$lib/domain/types';
import { FREE_PLAY_COUNT } from './constants';
import { plannedFor } from './neck';

function shuffle<T>(items: readonly T[], random: () => number): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

/**
 * The lead a located note is free-played at: the lead of its level, brought into the ladder the
 * locate exercise writes, as the learning procedure serves it; a note without a level is at
 * level 0, the procedure's default.
 */
export function freeLeadOf(input: {
	subject: LearningSubject;
	levels: readonly LevelState[];
}): (item: LocateItem) => LeadBeats {
	const { subject, levels } = input;
	const exerciseId = subject.exerciseOf('locate');
	const ladder = subject.ladder('locate');
	const { lowest } = levelRange(ladder);
	return (item) => {
		const key = subject.itemKey({ mechanic: 'locate', item });
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
		const { level } = ladderLevel(held, ladder);
		const { leadBeats } = ladder[level - lowest].params as LadderParams;
		if (leadBeats === null) throw new Error('The locate ladder gives every level a lead');
		return leadBeats;
	};
}

/** Free-play prompts drawn from every position; a located note at the lead `leadOf` gives it. */
export function buildFreePlan(input: {
	leadOf: (item: LocateItem) => LeadBeats;
	count?: number;
	random?: () => number;
}): PlannedItem[] {
	const random = input.random ?? Math.random;
	const count = input.count ?? FREE_PLAY_COUNT;
	return shuffle(practiceCards(), random)
		.slice(0, count)
		.map((card) =>
			plannedFor(card, {
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				leadBeats: card.mechanic === 'locate' ? input.leadOf(card.item) : null
			})
		);
}
