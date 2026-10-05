import { isSuccess, type Attempt, type CardKey } from '$lib/domain/types';
import { NEW_NOTE_CARD_WINDOW, SUCCESS_WINDOW } from './constants';

/** Share of successes (`isSuccess`); null without attempts. */
export function successRate(attempts: readonly Attempt[]): number | null {
	if (attempts.length === 0) return null;
	return attempts.filter(isSuccess).length / attempts.length;
}

/**
 * Rolling success of a session: its last SUCCESS_WINDOW locate prompts, probes left out
 * (a missed probe measures what was never learned). `attempts`: this session's, oldest first.
 */
export function sessionSuccessRate(attempts: readonly Attempt[]): number | null {
	const locate = attempts.filter(
		(attempt) => attempt.mechanic === 'locate' && attempt.phase !== 'probe'
	);
	return successRate(locate.slice(-SUCCESS_WINDOW));
}

/** Success of one card over its last NEW_NOTE_CARD_WINDOW attempts of the session, probe left out. */
export function cardSuccessRate(attempts: readonly Attempt[], key: CardKey): number | null {
	const own = attempts.filter((attempt) => attempt.cardKey === key && attempt.phase !== 'probe');
	return successRate(own.slice(-NEW_NOTE_CARD_WINDOW));
}
