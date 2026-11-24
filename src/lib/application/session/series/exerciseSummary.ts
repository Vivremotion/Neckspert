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
import type { Attempt, PlayedExercise, SessionSummary } from '$lib/domain/types';
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
				skill: attempt.skill,
				exerciseLevel: attempt.data.level,
				item: attempt.data.item,
				// The figure reads no phase; an exercise session serves its rounds free.
				phase: 'free',
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
 * Whether a round had an aid beyond its level's own (`levelAided`): the cursor counts as the
 * level's when the level it was played at (`data.level`, else the first) gives one in its
 * exercise (`find`); for an exercise no file defines, that is unknown, and the cursor counts as
 * an aid, as for a level that gives none.
 */
export function aidedBeyondItsLevel(
	find: (id: string) => ExerciseDefinition | undefined
): (attempt: Attempt) => boolean {
	return (attempt) => {
		const exercise = find(attempt.exerciseId);
		const level = (attempt.data as { level?: unknown } | null)?.level;
		let cursor = false;
		try {
			cursor = exercise
				? figureParamsOf(exercise, typeof level === 'number' ? level : 0).cursor
				: false;
		} catch {
			cursor = false;
		}
		return levelAided(attempt.aids, cursor);
	};
}

/**
 * What the summary tells of an exercise played alone whose round writes a figure, beside its
 * line's counts: the level held when it ended, and its last cycle in full. That level is the
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
}): { level: NonNullable<PlayedExercise['level']>; lastCycle?: SessionSummary['lastCycle'] } {
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
		level: levelView(levels, Math.min(highest, Math.max(lowest, held))),
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
