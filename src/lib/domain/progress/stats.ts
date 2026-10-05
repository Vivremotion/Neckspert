import { LEARNABLE_FRETS } from '$lib/domain/music';
import { median } from '$lib/domain/stats';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	cardKey,
	isSuccess,
	type Attempt,
	type CardState,
	type HomeStats,
	type NeckMapCell,
	type SessionRecord,
	type SessionSummary,
	type Settings
} from '$lib/domain/types';
import { TREND_RATIO, TREND_WINDOW_MS } from './constants';
import { cardStatus } from './cards';
import { sessionGrade } from './grade';
import { lastAttemptByCard, nextReviewAt, reviewableCards } from './review';

function locateOffsets(attempts: readonly Attempt[], pool: 'cold' | 'all' = 'cold'): number[] {
	return attempts.flatMap((attempt) => {
		if (pool === 'cold' && attempt.temperature !== 'cold') return [];
		// Off-beat answers are far past the window: they would hide the distance to the beat.
		if (!isSuccess(attempt)) return [];
		if (attempt.target.direction !== 'locate' || attempt.timingOffsetMs === null) return [];
		return [Math.abs(attempt.timingOffsetMs)];
	});
}

/**
 * Lead of the latest cold success (`isSuccess`) of a locate card, in ms at the tempo of that
 * attempt's session. Successes from sessions without a tempo are skipped.
 */
function lastColdRecallMs(
	key: string,
	attempts: readonly Attempt[],
	sessions: ReadonlyMap<string, { tempoBpm?: number | null }>
): number | null {
	let latest: { at: number; ms: number } | null = null;
	for (const attempt of attempts) {
		if (attempt.cardKey !== key || attempt.temperature !== 'cold' || !isSuccess(attempt)) continue;
		if (attempt.leadBeats === null) continue;
		const tempo = sessions.get(attempt.sessionId)?.tempoBpm;
		if (tempo == null || tempo <= 0) continue;
		if (latest && attempt.promptedAt < latest.at) continue;
		latest = { at: attempt.promptedAt, ms: Math.round((attempt.leadBeats * 60_000) / tempo) };
	}
	return latest?.ms ?? null;
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
	now: number;
}): HomeStats {
	const medianColdOffsetMs = median(locateOffsets(input.attempts));
	const trend = trendFor(input.attempts, input.now);

	const last = lastAttemptByCard(input.attempts);
	return {
		dueCount: reviewableCards(input.cards, last, input.now).length,
		nextReviewAt: nextReviewAt(input.cards, last),
		medianColdOffsetMs,
		trend
	};
}

export function summarizeSession(input: {
	record: SessionRecord;
	/** This session's attempts. */
	attempts: readonly Attempt[];
	/** Every stored attempt, for the next review time. */
	allAttempts: readonly Attempt[];
	cards: readonly CardState[];
	now: number;
}): SessionSummary {
	const pool = input.record.kind === 'free' ? 'all' : 'cold';
	// Cold figures measure reviews: probes are shown apart, as notes already known.
	const scored =
		pool === 'all' ? input.attempts : input.attempts.filter((attempt) => attempt.phase !== 'probe');
	const counted =
		pool === 'all' ? scored : scored.filter((attempt) => attempt.temperature === 'cold');
	const startedAt = input.record.startedAt;
	const endedAt = input.record.endedAt ?? input.now;
	const presented = new Set(
		input.attempts.filter((attempt) => attempt.phase === 'learning').map((a) => a.cardKey)
	);
	return {
		sessionId: input.record.id,
		pool,
		attemptCount: counted.length,
		correctCount: counted.filter(isSuccess).length,
		medianOffsetMs: median(locateOffsets(scored, pool)),
		identifyMedianReactionMs: median(identifyReactions(scored, pool)),
		learnedCount: input.cards.filter(
			(card) => card.learnedAt !== null && card.learnedAt >= startedAt && card.learnedAt <= endedAt
		).length,
		pendingCount: input.cards.filter((card) => card.learnedAt === null && presented.has(card.key))
			.length,
		knownCount: input.attempts.filter(
			(attempt) => attempt.phase === 'probe' && attempt.temperature === 'cold'
		).length,
		fatigueDetected: input.record.fatigueDetected,
		nextReviewAt: nextReviewAt(input.cards, lastAttemptByCard(input.allAttempts)),
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
		for (const fret of LEARNABLE_FRETS) {
			const pitch = input.pitchAt(string, fret);
			const locateKey = cardKey({ direction: 'locate', string, pitch });
			const identifyKey = cardKey({ direction: 'identify', string, fret });
			const locateCard = byKey.get(locateKey);
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
				locateRecallMs: locateCard ? lastColdRecallMs(locateKey, input.attempts, bySession) : null,
				identifyMedianReactionMs: median(identifyReaction),
				coldAccuracy: cold.length === 0 ? null : cold.filter(isSuccess).length / cold.length
			});
		}
	}
	return cells;
}
