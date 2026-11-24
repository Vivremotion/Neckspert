import { median } from '$lib/domain/stats';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	cardKey,
	type Attempt,
	type CardKey,
	type CardState,
	type NeckMapCell,
	type PlayedExercise,
	type SessionRecord,
	type SessionSummary
} from '$lib/domain/types';
import { summarizePlayed } from '$lib/domain/session/played';
import { summaryMisses } from '$lib/domain/session/misses';
import { setOfSkill } from '$lib/domain/sets';
import { isLocated, isNamed, neckOf, type Neck } from './neck';
import { cardStatus } from './cards';
import { sessionGrade } from './grade';
import { lastAttemptByCard, nextReviewAt } from './review';
import { sessionPlayed } from './sessionPlayed';

function locateOffsets(attempts: readonly Attempt[], pool: 'cold' | 'all' = 'cold'): number[] {
	return attempts.flatMap((attempt) => {
		if (pool === 'cold' && attempt.temperature !== 'cold') return [];
		// Off-beat answers are far past the window: they would hide the distance to the beat.
		if (!attempt.success) return [];
		if (!isLocated(attempt.skill) || attempt.timingOffsetMs === null) return [];
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
		if (!isNamed(attempt.skill)) return [];
		if (attempt.reactionMs === null) return [];
		return [attempt.reactionMs];
	});
}

/**
 * Whether a round had an aid beyond its level's, when the caller does not tell: any aid but the
 * aid level, as for an exercise whose levels give no cursor (the default of `figureParamsOf`).
 */
const anyAidButTheLevel = (attempt: Attempt) => attempt.aids.some((aid) => aid !== 'aid-level');

/**
 * A session summed up from what it played (`sessionPlayed`): free play scores every attempt; a
 * session of chords counts triads; every session by exercise and scope (`summarizePlayed`), with
 * its missed changes.
 */
export function summarizeSession(input: {
	record: SessionRecord;
	/** This session's attempts. */
	attempts: readonly Attempt[];
	/** Every stored attempt, for the next review time. */
	allAttempts: readonly Attempt[];
	/** The cards the session's exercises list. */
	cards: readonly CardState[];
	now: number;
	/** A round had an aid beyond its level's own. */
	aided?: (attempt: Attempt) => boolean;
	/** The level a line held at the end, when the caller knows it. */
	level?: (played: { exerciseId: string; scope?: string }) => PlayedExercise['level'];
	/** The exercises and scopes that changed air and left, while the session is in memory. */
	left?: readonly { exerciseId: string; scope?: string }[];
}): SessionSummary {
	const played = sessionPlayed(input.record, input.attempts);
	const pool = input.record.free === true ? 'all' : 'cold';
	// Cold figures measure reviews. Nothing serves a probe any more (issue #19), but attempts stored
	// before kept their phase: a passed probe measured no forgetting, so it stays out.
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
		fatigueDetected: input.record.fatigueDetected,
		nextReviewAt: nextReviewAt(input.cards, lastAttemptByCard(input.allAttempts)),
		grade: pool === 'all' ? sessionGrade(input.attempts) : null,
		tempoBpm:
			input.record.executions.find(
				(execution) => playedIds.has(execution.exerciseId) && execution.tempoBpm !== null
			)?.tempoBpm ?? null,
		chords,
		memory: played.memory,
		exercises: summarizePlayed({
			executions: input.record.executions,
			attempts: input.attempts,
			aided: input.aided ?? anyAidButTheLevel,
			alone: input.record.exercise,
			level: input.level,
			left: input.left
		}),
		misses: summaryMisses(input.attempts)
	};
}

/**
 * The neck map: a cell per place its exercises list (`neckOf`), each with the card of the note
 * located there (its pitch read by `pitchAt`) and of the place named.
 */
export function buildNeckMap(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	pitchAt: (string: StringNumber, fret: number) => PitchName;
	/** The neck's places and skills; the registered exercises' by default. */
	neck?: Neck;
}): NeckMapCell[] {
	const neck = input.neck ?? neckOf();
	const byKey = new Map(input.cards.map((card) => [card.key, card]));
	const keyOf = (skill: string | null, item: unknown): CardKey | null =>
		skill === null ? null : cardKey(skill, setOfSkill(skill).itemKey(item));

	return neck.places.map(({ string, fret }) => {
		const pitch = input.pitchAt(string, fret);
		const locateKey = keyOf(neck.located, { string, pitch });
		const identifyKey = keyOf(neck.named, { string, fret });
		const locateCard = locateKey === null ? undefined : byKey.get(locateKey);
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
		return {
			string,
			fret,
			pitch,
			locate: cardStatus(locateCard),
			identify: cardStatus(identifyKey === null ? undefined : byKey.get(identifyKey)),
			locateRecallMs:
				locateCard && locateKey !== null ? lastColdRecallMs(locateKey, input.attempts) : null,
			identifyMedianReactionMs: median(identifyReaction),
			coldAccuracy:
				cold.length === 0 ? null : cold.filter((attempt) => attempt.success).length / cold.length
		};
	});
}
