import { findExercise } from '$lib/domain/exercise/registry';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import { findRoutine } from '$lib/domain/routine/registry';
import { voicingOnStringsSet } from '$lib/domain/sets';
import { hasCards, hasSkill, skillById } from '$lib/domain/skill/registry';
import type { SkillId } from '$lib/domain/skill/types';
import type { Attempt, SessionRecord } from '$lib/domain/types';

/** The item set of the chord voicings: a session whose skills are on it counts triads. */
const CHORD_VOICINGS_SET: string = voicingOnStringsSet.id;

/** What a stored session played, as its summary reads it. */
export interface SessionPlayed {
	/**
	 * The ids of the exercises it played: those its routine names, gone or not; else those of
	 * `exercises`.
	 */
	exerciseIds: ExerciseId[];
	/** The exercises it played that a file still defines. */
	exercises: ExerciseDefinition[];
	/** The skills it practised: its next reviews are theirs. */
	skills: ReadonlySet<SkillId>;
	/** One of its skills is on the chord voicings: it counts triads, not notes. */
	chords: boolean;
	/**
	 * Its skills have cards, or nothing tells otherwise: none of them is a skill a file defines
	 * without cards (a session whose exercises and skills are all gone sums up as one of memory).
	 */
	memory: boolean;
}

/**
 * What a session played, read from what it records: the exercises of the routine it names, or
 * the exercise it played alone, when a file still defines them; else (a routine or an exercise
 * gone, or a session that names neither) the exercises of its executions and attempts, and the
 * skills of its attempts.
 */
export function sessionPlayed(
	record: Pick<SessionRecord, 'routine' | 'exercise' | 'executions'>,
	attempts: readonly Pick<Attempt, 'exerciseId' | 'skill'>[]
): SessionPlayed {
	const named =
		record.routine !== undefined
			? findRoutine(record.routine)?.exercises
			: record.exercise !== undefined && findExercise(record.exercise)
				? [record.exercise]
				: undefined;
	const ids = named ?? [
		...new Set([
			...record.executions.map((execution) => execution.exerciseId),
			...attempts.map((attempt) => attempt.exerciseId)
		])
	];
	// A registered routine's exercise no file defines any more drops out here, and so does its
	// skill from the skills read: its cards are not served either.
	const exercises = ids.flatMap((id) => findExercise(id) ?? []);
	const skills = new Set([
		...exercises.map((exercise) => exercise.practices),
		...(named ? [] : attempts.map((attempt) => attempt.skill))
	]);
	return {
		exerciseIds: named ?? exercises.map((exercise) => exercise.id),
		exercises,
		skills,
		chords: [...skills].some(
			(skill) => hasSkill(skill) && skillById(skill).items === CHORD_VOICINGS_SET
		),
		memory: ![...skills].some((skill) => hasSkill(skill) && !hasCards(skill))
	};
}
