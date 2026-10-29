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
 * The level a located note is free-played at: its level, brought into the ladder the locate
 * exercise writes, as the learning procedure serves it; a note without a level is at level 0,
 * the procedure's default.
 */
export function freeLevelOf(input: {
	subject: LearningSubject;
	levels: readonly LevelState[];
}): (item: LocateItem) => number {
	const { subject, levels } = input;
	const exerciseId = subject.exerciseOf('locate');
	const ladder = subject.ladder('locate');
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
		return ladderLevel(held, ladder).level;
	};
}

/** The lead a located note is free-played at: the lead of its level (`freeLevelOf`). */
export function freeLeadOf(input: {
	subject: LearningSubject;
	levels: readonly LevelState[];
}): (item: LocateItem) => LeadBeats {
	const ladder = input.subject.ladder('locate');
	const { lowest } = levelRange(ladder);
	const levelOf = freeLevelOf(input);
	return (item) => {
		const { leadBeats } = ladder[levelOf(item) - lowest].params as LadderParams;
		if (leadBeats === null) throw new Error('The locate ladder gives every level a lead');
		return leadBeats;
	};
}

/**
 * Free-play prompts drawn from every position; a located note at the lead `leadOf` gives it,
 * and at the ladder level `levelOf` gives it, when given.
 */
export function buildFreePlan(input: {
	leadOf: (item: LocateItem) => LeadBeats;
	levelOf?: (item: LocateItem) => number;
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
				leadBeats: card.mechanic === 'locate' ? input.leadOf(card.item) : null,
				...(card.mechanic === 'locate' && input.levelOf && { level: input.levelOf(card.item) }),
				exerciseLevel: 0
			})
		);
}
