import { describe, expect, it } from 'vitest';

// Every source of the app as raw text (Vite resolves the glob, so the test needs no Node typings).
const sources = import.meta.glob('/src/**/*.{ts,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const SELF = '/src/lib/application/session/noSessionKind.spec.ts';
/** The names of the kinds of session the code held before plan 5a (Task 4). */
const GONE = /\b(SessionKind|sessionKindOf)\b/;

describe('a session is told by what it plays', () => {
	it('names no kind of session anywhere in src/', () => {
		const offenders = Object.entries(sources)
			.filter(([path, text]) => path !== SELF && GONE.test(text))
			.map(([path]) => path);
		expect(offenders).toEqual([]);
	});

	it('actually scans the sources, the screens included', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain('/src/lib/domain/types.ts');
		expect(paths).toContain('/src/lib/ui/play/PlayFrame.svelte');
		expect(paths).toContain('/src/routes/session/+page.svelte');
	});
});
