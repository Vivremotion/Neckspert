export function finishDestination(sessionId: string): string {
	return `/summary?sessionId=${encodeURIComponent(sessionId)}`;
}
