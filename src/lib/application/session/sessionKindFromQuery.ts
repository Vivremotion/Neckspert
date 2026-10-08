import type { SessionKind } from '$lib/domain/types';

/**
 * `?kind=` of /session: free play or the triads when asked, learn otherwise (old links such as
 * `placement` included).
 */
export function sessionKindFromQuery(kind: string | null): SessionKind {
	return kind === 'free' || kind === 'triads' ? kind : 'learn';
}
