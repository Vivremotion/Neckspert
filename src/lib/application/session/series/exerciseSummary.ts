import { exerciseLevelsOf, figureParamsOf, type ExerciseDefinition } from '$lib/domain/exercise';
import { roundFigureOf } from '$lib/domain/exercise/round';
import {
	Fraction,
	METER_4_4,
	barLength,
	levelRange,
	type CycleVerdict,
	type Figure,
	type LevelState
} from '$lib/domain/time';
import type { Attempt, ExerciseSummary } from '$lib/domain/types';
import { levelAided } from '../aids';
import type { FigureAttemptData, RoundPlanRecord } from './recordResponse';
import { levelView } from './figureStage';

/**
 * A cycle as played, to engrave it: the figure its item names in `exercise` at the level played,
 * over the bars of the plan its attempt keeps, at its tempo; none when either is not readable.
 */
function playedOf(
	exercise: ExerciseDefinition,
	attempt: Attempt<FigureAttemptData>
): { figure: Figure; cycleBars: number; tempoBpm: number } | null {
	const plan = attempt.plan as Partial<RoundPlanRecord> | null;
	const tempoBpm = plan?.tempo?.bpm ?? attempt.tempoBpm;
	if (!plan || typeof plan.length !== 'string' || !tempoBpm) return null;
	try {
		const meter = exercise.meter ?? METER_4_4;
		const played = roundFigureOf(
			exercise,
			{
				exerciseId: exercise.id,
				mechanic: attempt.mechanic,
				exerciseLevel: attempt.data.level,
				item: attempt.data.item,
				phase: attempt.phase,
				temperature: attempt.temperature,
				aid: 'none',
				leadBeats: null
			},
			meter
		);
		if (!played) return null;
		const cycleBars = Fraction.parse(plan.length).div(barLength(meter)).toNumber();
		return { figure: played.figure, cycleBars, tempoBpm };
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
	const levels = exerciseLevelsOf(exercise);
	const cycles = input.attempts.filter(
		(attempt): attempt is Attempt<FigureAttemptData> => attempt.exerciseId === exercise.id
	);
	const { lowest, highest } = levelRange(levels);
	const last = cycles.at(-1);
	const held = input.levelReached ?? input.state?.level ?? last?.data.level ?? 0;
	const value = last?.verdict?.value as CycleVerdict | undefined;
	// An attempt stored before the report existed, or by a test double, has neither: no report then.
	const verdict =
		typeof value === 'object' && value !== null && 'passed' in value ? value : undefined;
	const played = last ? playedOf(exercise, last) : null;
	const readable = Array.isArray(last?.data.report?.expectations);
	return {
		exerciseId: exercise.id,
		levelReached: levelView(levels, Math.min(highest, Math.max(lowest, held))),
		cycles: cycles.length,
		successes: cycles.filter((attempt) => attempt.success).length,
		aided: cycles.filter(
			(attempt) =>
				attempt.success &&
				levelAided(attempt.aids, figureParamsOf(exercise, attempt.data.level).cursor)
		).length,
		...(last?.data.report &&
			verdict &&
			readable && {
				lastCycle: {
					report: last.data.report,
					verdict,
					thresholds: figureParamsOf(exercise, last.data.level).thresholds,
					...(played && { played })
				}
			})
	};
}
