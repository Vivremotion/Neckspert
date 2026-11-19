import { describe, expect, it } from 'vitest';

// The session module as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/session/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MODULE = '/src/lib/domain/session/';

/** The files that serve what exercises write, and so name none of it. */
const GUARDED = [`${MODULE}passageSource.ts`];

/** What they never name: they read families, sets and skills by the names the data gives. */
const NAMES = [
	'grid-changes',
	'note-places',
	'chord-shapes',
	'inversion-run',
	'grid-in-direction',
	'grid-in-zone',
	'grid-reading',
	'chord-anchor',
	'chord-zone',
	'note-on-string',
	'placed-note',
	'voicing-on-strings',
	'placed-voicing',
	'placed-shape',
	'change',
	'figure',
	'direction',
	'zone',
	'grid'
];

/** What they never import: the instrument, the music, the sets, and the families built on them. */
const IMPORTS: readonly RegExp[] = [
	/families\/guitar/,
	/families\/music/,
	/(^|\/)grid(\/|$)/,
	/(^|\/)sets(\/|$)/,
	/(^|\/)music(\/|$)/,
	/(^|\/)triads(\/|$)/,
	/(^|\/)gesture(\/|$)/,
	/catalogIds/
];

const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]*)['"]/g;

function offendersIn(files: Record<string, string>, guarded: readonly string[]): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!guarded.includes(path)) continue;
		for (const name of NAMES) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const match of text.matchAll(IMPORT_SPECIFIER)) {
			if (IMPORTS.some((pattern) => pattern.test(match[1])))
				offenders.push(`${path}: imports ${match[1]}`);
		}
	}
	return offenders;
}

describe('the passage source', () => {
	it('names no family, no set, no exercise, no skill and no instrument', () => {
		expect(offendersIn(sources, GUARDED)).toEqual([]);
	});

	it('actually scans the source, and flags what it must not name', () => {
		for (const path of GUARDED) expect(Object.keys(sources)).toContain(path);
		const [file] = GUARDED;
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` }, GUARDED)).toEqual([
				`${file}: ${name}`
			]);
		}
		expect(
			offendersIn({ [file]: `import { gridById } from '$lib/domain/grid';` }, GUARDED)
		).toEqual([`${file}: imports $lib/domain/grid`]);
		expect(
			offendersIn(
				{ [file]: `import { openElements } from '$lib/domain/gesture/opening';` },
				GUARDED
			)
		).toEqual([`${file}: imports $lib/domain/gesture/opening`]);
		expect(
			offendersIn({ [file]: `import { familyNamed } from '$lib/domain/families';` }, GUARDED)
		).toEqual([]);
	});
});
