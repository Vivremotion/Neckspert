import { median } from '$lib/domain/stats';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	cardKey,
	type Attempt,
	type CardState,
	type Curriculum,
	type HomeStats,
	type LeadBeats,
	type NeckMapCell,
	type SessionRecord,
	type SessionSummary,
	type Settings
} from '$lib/domain/types';
import { NEXT_SESSION_GAP_MS, TREND_RATIO, TREND_WINDOW_MS } from './constants';
import { cardStatus } from './cards';
import { nextNewTargets } from './curriculum';
import { sessionGrade } from './grade';
import { nextSuggestedAt } from './plans';

function locateOffsets(attempts: readonly Attempt[], pool: 'cold' | 'all' = 'cold'): number[] {
	return attempts.flatMap((attempt) => {
		if (pool === 'cold' && attempt.temperature !== 'cold') return [];
		if (!attempt.correct) return [];
		if (attempt.target.direction !== 'locate' || attempt.timingOffsetMs === null) return [];
		return [Math.abs(attempt.timingOffsetMs)];
	});
}

function locateLead(card: CardState | undefined): LeadBeats | null {
	if (!card || card.target.direction !== 'locate') return null;
	return card.leadBeats;
}

function leadTempoBpm(
	card: CardState,
	attempts: readonly Attempt[],
	sessions: ReadonlyMap<string, { tempoBpm?: number | null }>
): number | null {
	if (card.target.direction !== 'locate') return null;
	let latest: Attempt | null = null;
	for (const attempt of attempts) {
		if (
			attempt.cardKey !== card.key ||
			attempt.phase !== 'review' ||
			attempt.temperature !== 'cold'
		) {
			continue;
		}
		if (!latest || attempt.promptedAt >= latest.promptedAt) latest = attempt;
	}
	const tempo = sessions.get(latest?.sessionId ?? card.introducedInSession)?.tempoBpm;
	return tempo == null || tempo <= 0 ? null : tempo;
}

function identifyReactions(attempts: readonly Attempt[], pool: 'cold' | 'all' = 'cold'): number[] {
	return attempts.flatMap((attempt) => {
		if (pool === 'cold' && attempt.temperature !== 'cold') return [];
		if (attempt.target.direction !== 'identify') return [];
		if (attempt.reactionMs === null) return [];
		return [attempt.reactionMs];
	});
}

function trendFor(attempts: readonly Attempt[], now: number): HomeStats['trend'] {
	const recentStart = now - TREND_WINDOW_MS;
	const previousStart = now - 2 * TREND_WINDOW_MS;
	const recent = median(
		locateOffsets(attempts.filter((a) => a.promptedAt >= recentStart && a.promptedAt <= now))
	);
	const previous = median(
		locateOffsets(
			attempts.filter((a) => a.promptedAt >= previousStart && a.promptedAt < recentStart)
		)
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
	const medianColdOffsetMs = median(locateOffsets(input.attempts));
	const trend = trendFor(input.attempts, input.now);

	if (input.settings.placementDoneAt === null) {
		return {
			nextAction: 'placement',
			nextReviewAt: null,
			medianColdOffsetMs,
			trend
		};
	}

	const hasDue = input.cards.some((card) => card.scheduling.due <= input.now);
	const hasNew = nextNewTargets(input.curriculum, input.cards, 1).length > 0;
	if (hasDue || hasNew) {
		return {
			nextAction: 'session',
			nextReviewAt: null,
			medianColdOffsetMs,
			trend
		};
	}

	return {
		nextAction: 'wait',
		nextReviewAt: nextSuggestedAt(input.cards, input.now),
		medianColdOffsetMs,
		trend
	};
}

export function summarizeSession(input: {
	record: SessionRecord;
	attempts: readonly Attempt[];
	cards: readonly CardState[];
	now: number;
}): SessionSummary {
	const pool = input.record.kind === 'free' ? 'all' : 'cold';
	const counted =
		pool === 'all' ? input.attempts : input.attempts.filter((attempt) => attempt.temperature === 'cold');
	const earliest = nextSuggestedAt(input.cards, input.now);
	return {
		sessionId: input.record.id,
		pool,
		attemptCount: counted.length,
		correctCount: counted.filter((attempt) => attempt.correct).length,
		medianOffsetMs: median(locateOffsets(input.attempts, pool)),
		identifyMedianReactionMs: median(identifyReactions(input.attempts, pool)),
		learnedCount: input.cards.filter((card) => card.introducedInSession === input.record.id).length,
		fatigueDetected: input.record.fatigueDetected,
		nextSuggestedAt:
			earliest === null
				? input.now + NEXT_SESSION_GAP_MS
				: Math.max(earliest, input.now + NEXT_SESSION_GAP_MS),
		grade: pool === 'all' ? sessionGrade(input.attempts) : null
	};
}

export function buildNeckMap(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessions: readonly { id: string; tempoBpm?: number | null }[];
	pitchAt: (string: StringNumber, fret: number) => PitchName;
}): NeckMapCell[] {
	const byKey = new Map(input.cards.map((card) => [card.key, card]));
	const bySession = new Map(input.sessions.map((session) => [session.id, session]));
	const cells: NeckMapCell[] = [];

	for (let string = 1 as StringNumber; string <= 6; string = (string + 1) as StringNumber) {
		for (let fret = 0; fret <= 11; fret++) {
			const pitch = input.pitchAt(string, fret);
			const locateKey = cardKey({ direction: 'locate', string, pitch });
			const identifyKey = cardKey({ direction: 'identify', string, fret });
			const locateCard = byKey.get(locateKey);
			const tempo = locateCard ? leadTempoBpm(locateCard, input.attempts, bySession) : null;
			const cold = input.attempts.filter(
				(attempt) =>
					attempt.temperature === 'cold' &&
					(attempt.cardKey === locateKey || attempt.cardKey === identifyKey)
			);
			const identifyReaction = input.attempts.flatMap((attempt) => {
				if (attempt.temperature !== 'cold' || attempt.cardKey !== identifyKey) return [];
				if (attempt.reactionMs === null) return [];
				return [attempt.reactionMs];
			});
			cells.push({
				string,
				fret,
				pitch,
				locate: cardStatus(locateCard),
				identify: cardStatus(byKey.get(identifyKey)),
				locateLeadBeats: locateLead(locateCard),
				locateLeadMs:
					tempo == null || !locateCard ? null : Math.round((locateCard.leadBeats * 60_000) / tempo),
				identifyMedianReactionMs: median(identifyReaction),
				coldAccuracy:
					cold.length === 0 ? null : cold.filter((attempt) => attempt.correct).length / cold.length
			});
		}
	}
	return cells;
}
