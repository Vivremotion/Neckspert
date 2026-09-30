import type { HomeStats, SessionKind } from '$lib/domain/types';

export function homeSessionKind(nextAction: HomeStats['nextAction']): SessionKind | null {
	if (nextAction === 'placement') return 'placement';
	if (nextAction === 'session') return 'daily';
	return null;
}

export function isHomeActionEnabled(nextAction: HomeStats['nextAction']): boolean {
	return nextAction !== 'wait';
}
