import type { Attempt, SessionGrade } from '$lib/domain/types';

const PLUS = { S: 'S+', A: 'A+', B: 'B+', C: 'C+', D: 'D+' } as const;

/** An off-beat answer (right, too late) counts as half a miss: between a timed answer and a miss. */
const OFFBEAT_MISS_WEIGHT = 0.5;

function missWeight(attempt: Attempt): number {
	if (!attempt.correct) return 1;
	return attempt.verdict === 'offbeat' ? OFFBEAT_MISS_WEIGHT : 0;
}

export function sessionGrade(attempts: readonly Attempt[]): SessionGrade | null {
	if (attempts.length === 0) return null;
	const correct = attempts.filter((attempt) => attempt.correct);
	if (correct.length === 0) return 'F+';
	const wrongRatio =
		attempts.reduce((sum, attempt) => sum + missWeight(attempt), 0) / attempts.length;
	const letter =
		wrongRatio === 0
			? 'S'
			: wrongRatio < 0.25
				? 'A'
				: wrongRatio < 0.5
					? 'B'
					: wrongRatio < 0.75
						? 'C'
						: 'D';
	const clean = correct.filter((attempt) => attempt.verdict === 'perfect').length;
	return clean / correct.length >= 0.5 ? PLUS[letter] : letter;
}
