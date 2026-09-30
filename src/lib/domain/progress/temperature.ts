import type { Temperature } from '$lib/domain/types';
import { MIN_COLD_DELAY_MS } from './constants';

export function classifyTemperature(input: {
	lastAttemptAt: number | null;
	attemptedInSession: boolean;
	now: number;
}): Temperature {
	if (input.attemptedInSession) return 'hot';
	if (input.lastAttemptAt === null) return 'cold';
	return input.now - input.lastAttemptAt >= MIN_COLD_DELAY_MS ? 'cold' : 'hot';
}
