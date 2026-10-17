import type { ExerciseDefinition } from '$lib/domain/exercise';
import {
	figureFromJson,
	levelRange,
	type CycleVerdict,
	type Figure,
	type LevelState
} from '$lib/domain/time';
import type { Attempt, ExerciseSummary } from '$lib/domain/types';
import { levelAided, type CyclePlanRecord, type RhythmAttemptData } from './recordCycle';
import { levelParamsOf, rhythmLevels } from './rhythmExercise';
import { levelView } from './rhythmStage';

/** The figure and bars of a cycle as its attempt's plan keeps them; none when the plan is not readable. */
function playedOf(
	attempt: Attempt
): { figure: Figure; cycleBars: number; tempoBpm: number } | null {
	const plan = attempt.plan as Partial<CyclePlanRecord> | null;
	const tempoBpm = plan?.tempo?.bpm ?? attempt.tempoBpm;
	if (!plan || typeof plan.cycleBars !== 'number' || !plan.figure || !tempoBpm) return null;
	try {
		return {
			figure: figureFromJson(plan.figure),
			cycleBars: plan.cycleBars,
			tempoBpm
		};
	} catch {
		return null;
	}
}

/**
 * What a rhythm session did: the cycles it played, those that succeeded, the successes played
 * with an aid the level does not give, and the level held when it ended. That level is the
 * session's own (`levelReached`, kept on its record when it ended, so a later session does not
 * change it); for a record without it, the stored level (`state`, the latest, written after each
 * cycle), else the level of the last cycle played, else the first level.
 */
export function summarizeExercise(input: {
	exercise: ExerciseDefinition;
	/** The session's attempts. */
	attempts: readonly Attempt[];
	/** The level the session ended on (`SessionRecord.levelReached`). */
	levelReached?: number;
	state: LevelState | undefined;
}): ExerciseSummary {
	const { exercise } = input;
	const { levels } = rhythmLevels(exercise);
	const cycles = input.attempts.filter(
		(attempt): attempt is Attempt<RhythmAttemptData> => attempt.exerciseId === exercise.id
	);
	const { lowest, highest } = levelRange(levels);
	const last = cycles.at(-1);
	const held = input.levelReached ?? input.state?.level ?? last?.data.level ?? 0;
	const value = last?.verdict?.value as CycleVerdict | undefined;
	// An attempt stored before the report existed, or by a test double, has neither: no report then.
	const verdict =
		typeof value === 'object' && value !== null && 'passed' in value ? value : undefined;
	const played = last ? playedOf(last) : null;
	const readable = Array.isArray(last?.data.report?.expectations);
	return {
		exerciseId: exercise.id,
		levelReached: levelView(levels, Math.min(highest, Math.max(lowest, held))),
		cycles: cycles.length,
		successes: cycles.filter((attempt) => attempt.success).length,
		aided: cycles.filter(
			(attempt) =>
				attempt.success && levelAided(attempt.aids, levelParamsOf(exercise, attempt.data.level))
		).length,
		...(last?.data.report &&
			verdict &&
			readable && {
				lastCycle: {
					report: last.data.report,
					verdict,
					thresholds: levelParamsOf(exercise, last.data.level).thresholds,
					...(played && { played })
				}
			})
	};
}
