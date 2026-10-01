import type { SessionKind } from '$lib/domain/types';

export function finishDestination(kind: SessionKind, sessionId: string): string | null {
	if (kind !== 'free') return null;
	return `/summary?sessionId=${encodeURIComponent(sessionId)}`;
}
