import { describe, expect, it } from 'vitest';

/**
 * No exercise in the code (spec 2026-11-18, § 11 « La frontière »): no id of a skill, a grid,
 * an exercise or a routine of the catalog is written in `src/` outside the tests and the
 * migrations. The ids are read from the catalog's files themselves, so a new one is guarded
 * as soon as it is written there.
 */

// Every source of the app and every catalog file as raw text (Vite resolves the globs).
const sources = import.meta.glob('/src/**/*.{ts,js,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;
const catalog = import.meta.glob('/catalog/*.json', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** The lists of a definition file whose objects carry a catalog id. */
const LISTS = ['skills', 'grids', 'exercises', 'routines'] as const;

/** The files that may name the catalog, each with its reason. */
const EXEMPT: readonly { pattern: RegExp; reason: string }[] = [
	{ pattern: /\.spec\.ts$/, reason: 'tests (node and jsdom) name what they play' },
	{ pattern: /^\/src\/lib\/testing\//, reason: 'test benches and the tests’ catalog constants' },
	{
		pattern: /^\/src\/lib\/infrastructure\/storage\/testing\//,
		reason: 'fixtures of the repository contract suites, run by specs only'
	},
	{
		pattern: /\/migrations\//,
		reason: 'migrations freeze the ids the rows they rewrite carried'
	},
	{ pattern: /\/legacy\//, reason: 'old database and backup steps, frozen likewise' }
];

/**
 * Catalog ids that are also words of the format, each with the files where it is that word and
 * why: there only, the scan does not count it (it is looked for everywhere else).
 */
const WORDS: Readonly<Record<string, { files: readonly string[]; reason: string }>> = {
	chords: {
		files: ['/src/lib/domain/grid/fromJson.ts'],
		reason: 'the key of a grid’s chords in the definition format, not the routine'
	}
};

function catalogIds(files: Record<string, string>): string[] {
	const ids = new Set<string>();
	for (const text of Object.values(files)) {
		const file = JSON.parse(text) as Partial<Record<(typeof LISTS)[number], { id: string }[]>>;
		for (const list of LISTS) for (const object of file[list] ?? []) ids.add(object.id);
	}
	return [...ids].sort();
}

function exempt(path: string): boolean {
	return EXEMPT.some(({ pattern }) => pattern.test(path));
}

/** Every `<path>: <id>` where a guarded file writes a catalog id between quotes. */
function offendersIn(files: Record<string, string>, ids: readonly string[]): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (exempt(path)) continue;
		for (const id of ids) {
			if (WORDS[id]?.files.includes(path)) continue;
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${id}${quote}`)))
				offenders.push(`${path}: ${id}`);
		}
	}
	return offenders.sort();
}

/** Every guarded file that imports the tests' catalog constants. */
function importersOfTestIds(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path, text]) => !exempt(path) && /['"][^'"]*testing\/catalogIds['"]/.test(text))
		.map(([path]) => path);
}

describe('no catalog id in the code', () => {
	const ids = catalogIds(catalog);

	it('reads the ids of every skill, grid, exercise and routine of the catalog', () => {
		expect(ids).toEqual(
			expect.arrayContaining(['locate-note-string', 'iohefy-a', 'rhythm-offbeats', 'notes'])
		);
		expect(ids.length).toBeGreaterThanOrEqual(20);
	});

	it('names none of them in src/ outside the tests and the migrations', () => {
		expect(offendersIn(sources, ids)).toEqual([]);
	});

	it('imports the tests’ catalog ids from tests only', () => {
		expect(importersOfTestIds(sources)).toEqual([]);
	});

	it('actually scans the sources, the screens and the pages included', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain('/src/lib/application/services/createAppServices.ts');
		expect(paths).toContain('/src/lib/ui/play/PlayFrame.svelte');
		expect(paths).toContain('/src/routes/dev/rhythm/+page.svelte');
	});

	it('flags a planted id in any quotes, and leaves the exempt files alone', () => {
		const planted = '/src/lib/domain/planted.ts';
		for (const quote of ["'", '"', '`'])
			expect(offendersIn({ [planted]: `const id = ${quote}chord-anchor${quote};` }, ids)).toEqual([
				`${planted}: chord-anchor`
			]);
		expect(offendersIn({ [planted]: `const id = 'chord-anchors';` }, ids)).toEqual([]);
		for (const path of [
			'/src/lib/domain/planted.spec.ts',
			'/src/lib/ui/planted.svelte.spec.ts',
			'/src/lib/testing/planted.ts',
			'/src/lib/infrastructure/storage/migrations/planted.ts',
			'/src/lib/infrastructure/storage/legacy/planted.ts'
		])
			expect(offendersIn({ [path]: `const id = 'chord-anchor';` }, ids)).toEqual([]);
		expect(
			importersOfTestIds({ [planted]: `import { X } from '$lib/testing/catalogIds';` })
		).toEqual([planted]);
	});

	it('lets a word of the format pass only in the files it is listed for', () => {
		for (const [id, { files }] of Object.entries(WORDS)) {
			expect(ids).toContain(id);
			for (const file of files) {
				expect(Object.keys(sources)).toContain(file);
				expect(offendersIn({ [file]: `const key = '${id}';` }, ids)).toEqual([]);
			}
			const elsewhere = '/src/lib/domain/planted.ts';
			expect(offendersIn({ [elsewhere]: `const key = '${id}';` }, ids)).toEqual([
				`${elsewhere}: ${id}`
			]);
		}
	});
});
