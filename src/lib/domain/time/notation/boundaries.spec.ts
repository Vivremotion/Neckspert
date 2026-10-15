import { describe, expect, it } from 'vitest';

// Every source file of the project as raw text, keyed by its path from the project root
// (Vite resolves the glob, so the test needs no Node typings).
const sources = import.meta.glob('/src/**/*.{ts,js,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MARKER = 'time/notation/lilypond';
const ALLOWED_PREFIXES = ['/src/lib/domain/time/notation/', '/src/lib/domain/exercise/'];

describe('lilypond boundary', () => {
	it('is imported only by the notation folder and the exercise catalog', () => {
		const offenders = Object.entries(sources)
			.filter(([path]) => !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)))
			.filter(([, text]) => text.includes(MARKER))
			.map(([path]) => path);
		expect(offenders).toEqual([]);
	});

	it('actually scans the source tree', () => {
		const paths = Object.keys(sources);
		expect(paths.length).toBeGreaterThan(50);
		expect(paths).toContain('/src/lib/domain/time/notation/lilypond.ts');
	});
});
