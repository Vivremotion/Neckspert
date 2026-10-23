export type Destination = 'practice' | 'library' | 'progress' | 'settings';

/** Paths played full screen: no rail (a session, the mode-2 demo, the diagnostics, the dev play views). */
const RAIL_FREE_PREFIXES = [
	'/session',
	'/dev/identify',
	'/dev/gesture',
	'/dev/rhythm',
	'/diagnostic'
] as const;

/** The pages of each destination; the dev mirrors follow their page. The library is a session: never listed. */
const DESTINATION_PREFIXES: readonly (readonly [string, Destination])[] = [
	['/summary', 'practice'],
	['/map', 'progress'],
	['/settings', 'settings'],
	['/calibration', 'settings']
];

function under(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function stripDev(path: string): string {
	return path === '/dev/home' ? '/' : path.startsWith('/dev/') ? path.slice('/dev'.length) : path;
}

export function showsRail(path: string): boolean {
	return !RAIL_FREE_PREFIXES.some((prefix) => under(path, prefix));
}

export function activeDestination(path: string): Destination | null {
	if (!showsRail(path)) return null;
	const page = stripDev(path);
	if (page === '/') return 'practice';
	return DESTINATION_PREFIXES.find(([prefix]) => under(page, prefix))?.[1] ?? null;
}
