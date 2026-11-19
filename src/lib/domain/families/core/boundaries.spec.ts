import { describe, expect, it } from 'vitest';

// The core of the families as raw text, keyed by its path from the project root (Vite resolves
// the glob, so the test needs no Node typings).
const sources = import.meta.glob('/src/lib/domain/families/core/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** What the core never names: the instrument's modules and the families built on them. */
const FORBIDDEN: readonly RegExp[] = [
	/domain\/music/,
	/domain\/sets/,
	/domain\/triads/,
	/['"]\.\.\/guitar/,
	/note-places/,
	/chord-shapes/
];

function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => !path.endsWith('.spec.ts'))
		.filter(([, text]) => FORBIDDEN.some((pattern) => pattern.test(text)))
		.map(([path]) => path);
}

describe('families core boundary', () => {
	it('names no instrument, no item set and no family', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the core', () => {
		expect(Object.keys(sources)).toContain('/src/lib/domain/families/core/select.ts');
		expect(Object.keys(sources)).toContain('/src/lib/domain/families/core/types.ts');
	});

	it('flags an import of the instrument and a family named', () => {
		const path = '/src/lib/domain/families/core/x.ts';
		for (const line of [
			`import { midiOnString } from '$lib/domain/music';`,
			`import { rootPosition } from '$lib/domain/sets/voicingOnStrings';`,
			`import { occurrenceId } from '$lib/domain/triads';`,
			`if (family.id === 'note-places') return [];`,
			`const id = "chord-shapes";`
		]) {
			expect(offendersIn({ [path]: line }), line).toEqual([path]);
		}
	});
});
