import { nextTempo } from '$lib/domain/exercise/tempo';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { ChordGridItem, ChordReading } from '$lib/domain/mechanics';
import { expectedShape } from '$lib/domain/mechanics/chordGrid';
import type { VoicingOccurrence } from '$lib/domain/music';
import { occurrenceOfId } from '$lib/domain/triads';
import type { Attempt, Execution, GestureSummary } from '$lib/domain/types';
import { GESTURE_EXERCISES } from './exercises';
import { passageSucceeded } from './passages';

/** The gesture exercise of an id; throws on one the track does not list, rather than invent it. */
function gestureDefinition(exerciseId: string): ExerciseDefinition {
	const definition = GESTURE_EXERCISES.find((exercise) => exercise.id === exerciseId);
	if (!definition) throw new Error(`${exerciseId}: not an exercise of the gesture track`);
	return definition;
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
 * played, the share of changes right and in time, the tempo played and the next one; then the
 * missed changes, with the shape heard and the shape due.
 */
export function summarizeGesture(
	executions: readonly Execution[],
	attempts: readonly Attempt[]
): GestureSummary {
	const changes = attempts.filter((attempt) => attempt.mechanic === 'chord-grid');
	const exercises = executions.flatMap(({ exerciseId, scope, tempoBpm }) => {
		const own = changes.filter(
			(attempt) =>
				attempt.exerciseId === exerciseId && (attempt.tempoScope ?? null) === (scope ?? null)
		);
		if (own.length === 0 || tempoBpm === null) return [];
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
				nextTempoBpm: nextTempo(gestureDefinition(exerciseId), tempoBpm, own)
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
