import { CHANGE_SKILL_IDS, GESTURE_EXERCISE_IDS } from '$lib/domain/exercise/catalogIds';
import type { ChordGridItem, ChordReading } from '$lib/domain/mechanics';
import { expectedShape } from '$lib/domain/mechanics/chordGrid';
import type { VoicingOccurrence } from '$lib/domain/music';
import { occurrenceOfId } from '$lib/domain/triads';
import type { Attempt, Execution, GestureSummary } from '$lib/domain/types';
import { passageSucceeded } from './passages';

/** Throws on an exercise the track does not list, rather than invent it. */
function assertGestureExercise(exerciseId: string): void {
	if (!(GESTURE_EXERCISE_IDS as readonly string[]).includes(exerciseId))
		throw new Error(`${exerciseId}: not an exercise of the gesture track`);
}

function fretsOf(occurrence: VoicingOccurrence | null): string | null {
	return occurrence && occurrence.notes.map((note) => note.fret).join('-');
}

function itemOf(attempt: Attempt): ChordGridItem {
	return (attempt.data as { item: ChordGridItem }).item;
}

function decidedOf(attempt: Attempt): string | null {
	return (attempt.data as { answer: ChordReading | null }).answer?.decided ?? null;
}

/**
 * A gesture session by exercise and grid played (spec 2026-10-10, section 7): passages succeeded of those
 * played, the share of changes right and in time, the tempo of its first round and of its last
 * one (its level may move it in session, plan H6 D4); then the missed changes, with the shape
 * heard and the shape due.
 */
export function summarizeGesture(
	executions: readonly Execution[],
	attempts: readonly Attempt[]
): GestureSummary {
	const changes = attempts.filter((attempt) =>
		(CHANGE_SKILL_IDS as readonly string[]).includes(attempt.skill)
	);
	const exercises = executions.flatMap(({ exerciseId, scope, tempoBpm }) => {
		const own = changes.filter(
			(attempt) => attempt.exerciseId === exerciseId && (attempt.scope ?? null) === (scope ?? null)
		);
		if (own.length === 0 || tempoBpm === null) return [];
		// Only an exercise of the gesture track is summed up here.
		assertGestureExercise(exerciseId);
		const passages = new Map<string, Attempt[]>();
		for (const attempt of own) {
			const id = itemOf(attempt).passageId;
			passages.set(id, [...(passages.get(id) ?? []), attempt]);
		}
		return [
			{
				exerciseId,
				...(scope !== undefined && { scope }),
				passagesPlayed: passages.size,
				passagesSucceeded: [...passages.values()].filter(passageSucceeded).length,
				changeSuccessRate: own.filter((attempt) => attempt.success).length / own.length,
				tempoBpm,
				lastTempoBpm: own[own.length - 1].tempoBpm ?? tempoBpm
			}
		];
	});
	const misses = changes
		.filter((attempt) => attempt.correct !== true && attempt.id !== undefined)
		.map((attempt) => {
			const decided = decidedOf(attempt);
			return {
				attemptId: attempt.id as number,
				exerciseId: attempt.exerciseId,
				symbol: itemOf(attempt).symbol,
				heard: fretsOf(decided === null ? null : occurrenceOfId(decided)),
				expected: fretsOf(expectedShape(itemOf(attempt), decided)),
				contested: attempt.contested ?? false
			};
		});
	return { exercises, misses };
}
