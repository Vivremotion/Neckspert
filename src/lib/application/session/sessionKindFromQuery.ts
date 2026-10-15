import type { SessionKind } from '$lib/domain/types';

/**
 * `?kind=` of /session: free play, a triads exercise, the gesture track or one exercise when asked,
 * learn otherwise (old links such as `placement` included).
 */
export function sessionKindFromQuery(kind: string | null): SessionKind {
	return kind === 'free' ||
		kind === 'triads' ||
		kind === 'triads-zone' ||
		kind === 'gesture' ||
		kind === 'exercise'
		? kind
		: 'learn';
}
