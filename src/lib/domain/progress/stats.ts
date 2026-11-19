import { LEARNABLE_FRETS, neckCardKey } from '$lib/domain/music';
import { median } from '$lib/domain/stats';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	type Attempt,
	type CardState,
	type HomeStats,
	type NeckMapCell,
	type SessionRecord,
	type SessionSummary
} from '$lib/domain/types';
import { IDENTIFY_SKILL_ID, LOCATE_SKILL_ID } from '$lib/domain/exercise/catalogIds';
import { summarizeGesture } from '$lib/domain/gesture/summary';
import { TREND_RATIO, TREND_WINDOW_MS } from './constants';
import { cardStatus } from './cards';
import { sessionGrade } from './grade';
import { lastAttemptByCard, nextReviewAt } from './review';
import { sessionPlayed } from './sessionPlayed';

function locateOffsets(attempts: readonly Attempt[], pool: 'cold' | 'all' = 'cold'): number[] {
	return attempts.flatMap((attempt) => {
		if (pool === 'cold' && attempt.temperature !== 'cold') return [];
		// Off-beat answers are far past the window: they would hide the distance to the beat.
		if (!attempt.success) return [];
		if (attempt.skill !== LOCATE_SKILL_ID || attempt.timingOffsetMs === null) return [];
		return [Math.abs(attempt.timingOffsetMs)];
	});
}

/**
 * Lead of the latest cold success (`Attempt.success`) of a locate card, in ms at the tempo of that
 * attempt. Successes without a tempo are skipped.
 */
function lastColdRecallMs(key: string, attempts: readonly Attempt[]): number | null {
	let latest: { at: number; ms: number } | null = null;
	for (const attempt of attempts) {
		if (attempt.cardKey !== key || attempt.temperature !== 'cold' || !attempt.success) continue;
		if (attempt.leadBeats === null) continue;
		const tempo = attempt.tempoBpm;
		if (tempo === null || tempo <= 0) continue;
		if (latest && attempt.promptedAt < latest.at) continue;
		latest = { at: attempt.promptedAt, ms: Math.round((attempt.leadBeats * 60_000) / tempo) };
	}
	return latest?.ms ?? null;
}

/** |offset| of the cold successes on the beat of a session of chords, whatever their skill. */
function beatOffsets(attempts: readonly Attempt[]): number[] {
	return attempts.flatMap((attempt) => {
		if (attempt.temperature !== 'cold' || !attempt.success) return [];
		return attempt.timingOffsetMs === null ? [] : [Math.abs(attempt.timingOffsetMs)];
	});
}

function identifyReactions(attempts: readonly Attempt[], pool: 'cold' | 'all' = 'cold'): number[] {
	return attempts.flatMap((attempt) => {
		if (pool === 'cold' && attempt.temperature !== 'cold') return [];
		if (attempt.skill !== IDENTIFY_SKILL_ID) return [];
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

/** The gap to the beat of the cold locate notes, and its trend; the reviews are the routines'. */
export function computeHomeStats(input: { attempts: readonly Attempt[]; now: number }): HomeStats {
	return {
		medianColdOffsetMs: median(locateOffsets(input.attempts)),
		trend: trendFor(input.attempts, input.now)
	};
}

/**
 * A session summed up from what it played (`sessionPlayed`): free play scores every attempt; a
 * session of chords counts triads; a session of passages sums its passages up.
 */
export function summarizeSession(input: {
	record: SessionRecord;
	/** This session's attempts. */
	attempts: readonly Attempt[];
	/** Every stored attempt, for the next review time. */
	allAttempts: readonly Attempt[];
	cards: readonly CardState[];
	now: number;
}): SessionSummary {
	const played = sessionPlayed(input.record, input.attempts);
	const pool = input.record.free === true ? 'all' : 'cold';
	// Cold figures measure reviews: probes are shown apart, as notes already known.
	const scored =
		pool === 'all' ? input.attempts : input.attempts.filter((attempt) => attempt.phase !== 'probe');
	const counted =
		pool === 'all' ? scored : scored.filter((attempt) => attempt.temperature === 'cold');
	const startedAt = input.record.startedAt;
	const endedAt = input.record.endedAt ?? input.now;
	const chords = played.chords;
	// The tempo shown is the first of the session's exercises played at one (identify plays in
	// free time). Read from the record's ids, so a session sums up once its exercise's file is gone.
	const playedIds = new Set(played.exerciseIds);
	const presented = new Set(
		input.attempts.filter((attempt) => attempt.phase === 'learning').map((a) => a.cardKey)
	);
	return {
		sessionId: input.record.id,
		pool,
		attemptCount: counted.length,
		correctCount: counted.filter((attempt) => attempt.success).length,
		medianOffsetMs: median(chords ? beatOffsets(counted) : locateOffsets(scored, pool)),
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
		grade: pool === 'all' ? sessionGrade(input.attempts) : null,
		tempoBpm:
			input.record.executions.find(
				(execution) => playedIds.has(execution.exerciseId) && execution.tempoBpm !== null
			)?.tempoBpm ?? null,
		chords,
		...(played.passages && {
			gesture: summarizeGesture(input.record.executions, input.attempts)
		})
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
		for (const fret of LEARNABLE_FRETS) {
			const pitch = input.pitchAt(string, fret);
			const locateKey = neckCardKey({ skill: LOCATE_SKILL_ID, item: { string, pitch } });
			const identifyKey = neckCardKey({ skill: IDENTIFY_SKILL_ID, item: { string, fret } });
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
				locateRecallMs: locateCard ? lastColdRecallMs(locateKey, input.attempts) : null,
				identifyMedianReactionMs: median(identifyReaction),
				coldAccuracy:
					cold.length === 0 ? null : cold.filter((attempt) => attempt.success).length / cold.length
			});
		}
	}
	return cells;
}
