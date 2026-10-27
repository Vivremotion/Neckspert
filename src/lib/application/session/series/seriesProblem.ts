import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { ROUND_MODES } from '$lib/domain/time';

/**
 * Null when the response series can play the exercise's round as written, else what it cannot,
 * naming the exercise and the field. The domain accepts these rounds (another session may play
 * them); the series cannot: it closes a round on its answers (`unit: 'response'`), gives its
 * rounds no level thresholds (`RoundRunner`), and clicks every bar (no muted bar). An exercise
 * without a round is played another way and passes.
 */
export function seriesProblem(definition: ExerciseDefinition): string | null {
	const round = definition.round;
	if (round === undefined) return null;
	const { id } = definition;
	if (round.policy.unit !== 'response') {
		return `${id}: round.policy.unit "${round.policy.unit}" cannot be played by the response series, which closes a round on its answers (unit "response")`;
	}
	const verdict = Object.hasOwn(ROUND_MODES.verdicts, round.policy.verdict)
		? ROUND_MODES.verdicts[round.policy.verdict]
		: undefined;
	if (verdict?.readsThresholds) {
		return `${id}: round.policy.verdict "${round.policy.verdict}" judges against a level's thresholds, which the response series does not give`;
	}
	if (round.mutedBars !== undefined && round.mutedBars.length > 0) {
		return `${id}: round.mutedBars [${round.mutedBars.join(', ')}] cannot be played by the response series, which never mutes its click`;
	}
	return null;
}
