import type { Attempt } from '$lib/domain/types';
import { nextTempo } from '$lib/domain/exercise/tempo';

export {
	TEMPO_MIN_BPM,
	TEMPO_MAX_BPM,
	TEMPO_STEP_BPM,
	TEMPO_RAISE_AT,
	TEMPO_LOWER_AT,
	TEMPO_MIN_PROMPTS,
	clampTempo
} from '$lib/domain/exercise/tempo';

/**
 * Tempo of the next learn session, from this one's mode 1 success (probes left out). The
 * tempo never changes during a session. A tempo set outside the range is never pushed the
 * wrong way by the bound.
 */
export function nextSessionTempo(currentBpm: number, attempts: readonly Attempt[]): number {
	return nextTempo(
		currentBpm,
		attempts.filter((attempt) => attempt.target.direction === 'locate')
	);
}
