import type { ExerciseDefinition } from '$lib/domain/exercise';
import { levelRange, type LevelState } from '$lib/domain/time';
import type { Attempt, RhythmSummary } from '$lib/domain/types';
import { levelAided, type RhythmAttemptData } from './recordCycle';
import { levelParamsOf, rhythmLevels } from './rhythmExercise';
import { levelView } from './rhythmStage';

/**
 * What a rhythm session did: the cycles it played, those that succeeded, the successes played
 * with an aid the level does not give, and the level held when it ended. That level is the
 * session's own (`levelReached`, kept on its record when it ended, so a later session does not
 * change it); for a record without it, the stored level (`state`, the latest, written after each
 * cycle), else the level of the last cycle played, else the first level.
 */
export function summarizeRhythm(input: {
	exercise: ExerciseDefinition;
	/** The session's attempts. */
	attempts: readonly Attempt[];
	/** The level the session ended on (`SessionRecord.levelReached`). */
	levelReached?: number;
	state: LevelState | undefined;
}): RhythmSummary {
	const { exercise } = input;
	const { levels } = rhythmLevels(exercise);
	const cycles = input.attempts.filter(
		(attempt): attempt is Attempt<RhythmAttemptData> => attempt.exerciseId === exercise.id
	);
	const { lowest, highest } = levelRange(levels);
	const last = cycles.at(-1);
	const held = input.levelReached ?? input.state?.level ?? last?.data.level ?? 0;
	return {
		exerciseId: exercise.id,
		levelReached: levelView(levels, Math.min(highest, Math.max(lowest, held))),
		cycles: cycles.length,
		successes: cycles.filter((attempt) => attempt.success).length,
		aided: cycles.filter(
			(attempt) =>
				attempt.success && levelAided(attempt.aids, levelParamsOf(exercise, attempt.data.level))
		).length
	};
}
