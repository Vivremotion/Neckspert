import type { HomeStats, SessionKind } from '$lib/domain/types';

export function homeSessionKind(nextAction: HomeStats['nextAction']): SessionKind {
	return nextAction === 'placement' ? 'placement' : 'learn';
}
