import { median } from '$lib/domain/stats';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	cardKey,
	type Attempt,
	type CardState,
	type Curriculum,
	type HomeStats,
	type NeckMapCell,
	type SessionRecord,
	type SessionSummary,
	type Settings
} from '$lib/domain/types';
import { NEXT_SESSION_GAP_MS, TREND_RATIO, TREND_WINDOW_MS } from './constants';
import { cardStatus } from './cards';
import { nextNewTargets } from './curriculum';
import { nextSuggestedAt } from './plans';

function coldWithReaction(attempts: readonly Attempt[]): Attempt[] {
	return attempts.filter(
		(attempt) => attempt.temperature === 'cold' && attempt.reactionMs !== null
	);
}

function medianReaction(attempts: readonly Attempt[]): number | null {
	return median(coldWithReaction(attempts).map((attempt) => attempt.reactionMs!));
}

function trendFor(attempts: readonly Attempt[], now: number): HomeStats['trend'] {
	const recentStart = now - TREND_WINDOW_MS;
	const previousStart = now - 2 * TREND_WINDOW_MS;
	const recent = medianReaction(
		attempts.filter((a) => a.promptedAt >= recentStart && a.promptedAt <= now)
	);
	const previous = medianReaction(
		attempts.filter((a) => a.promptedAt >= previousStart && a.promptedAt < recentStart)
	);
	if (recent === null || previous === null) return null;
	if (recent <= previous * (1 - TREND_RATIO)) return 'improving';
	if (recent >= previous * (1 + TREND_RATIO)) return 'worsening';
	return 'stable';
}

export function computeHomeStats(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	settings: Settings;
	curriculum: Curriculum;
	now: number;
}): HomeStats {
	const medianColdReactionMs = medianReaction(input.attempts);
	const trend = trendFor(input.attempts, input.now);

	if (input.settings.placementDoneAt === null) {
		return {
			nextAction: 'placement',
			nextReviewAt: null,
			medianColdReactionMs,
			trend
		};
	}

	const hasDue = input.cards.some((card) => card.scheduling.due <= input.now);
	const hasNew = nextNewTargets(input.curriculum, input.cards, 1).length > 0;
	if (hasDue || hasNew) {
		return {
			nextAction: 'session',
			nextReviewAt: null,
			medianColdReactionMs,
			trend
		};
	}

	return {
		nextAction: 'wait',
		nextReviewAt: nextSuggestedAt(input.cards, input.now),
		medianColdReactionMs,
		trend
	};
}

export function summarizeSession(input: {
	record: SessionRecord;
	attempts: readonly Attempt[];
	cards: readonly CardState[];
	now: number;
}): SessionSummary {
	const cold = input.attempts.filter((attempt) => attempt.temperature === 'cold');
	const earliest = nextSuggestedAt(input.cards, input.now);
	return {
		sessionId: input.record.id,
		coldCount: cold.length,
		coldCorrect: cold.filter((attempt) => attempt.correct).length,
		medianColdReactionMs: medianReaction(input.attempts),
		learnedCount: input.cards.filter((card) => card.introducedInSession === input.record.id)
			.length,
		fatigueDetected: input.record.fatigueDetected,
		nextSuggestedAt:
			earliest === null
				? input.now + NEXT_SESSION_GAP_MS
				: Math.max(earliest, input.now + NEXT_SESSION_GAP_MS)
	};
}

export function buildNeckMap(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	pitchAt: (string: StringNumber, fret: number) => PitchName;
}): NeckMapCell[] {
	const byKey = new Map(input.cards.map((card) => [card.key, card]));
	const cells: NeckMapCell[] = [];

	for (let string = 1 as StringNumber; string <= 6; string = (string + 1) as StringNumber) {
		for (let fret = 0; fret <= 11; fret++) {
			const pitch = input.pitchAt(string, fret);
			const locateKey = cardKey({ direction: 'locate', string, pitch });
			const identifyKey = cardKey({ direction: 'identify', string, fret });
			const cold = input.attempts.filter(
				(attempt) =>
					attempt.temperature === 'cold' &&
					(attempt.cardKey === locateKey || attempt.cardKey === identifyKey)
			);
			const withReaction = cold.filter((attempt) => attempt.reactionMs !== null);
			cells.push({
				string,
				fret,
				pitch,
				locate: cardStatus(byKey.get(locateKey)),
				identify: cardStatus(byKey.get(identifyKey)),
				medianColdReactionMs: median(withReaction.map((a) => a.reactionMs!)),
				coldAccuracy:
					cold.length === 0
						? null
						: cold.filter((attempt) => attempt.correct).length / cold.length
			});
		}
	}
	return cells;
}
