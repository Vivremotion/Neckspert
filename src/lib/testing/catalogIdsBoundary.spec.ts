import { describe, expect, it } from 'vitest';

/**
 * No exercise in the code (spec 2026-11-18, § 11 « La frontière »): no id of a skill, a grid,
 * an exercise or a routine of the catalog is written in `src/` outside the tests and the
 * migrations. The ids are read from the catalog's files themselves, so a new one is guarded
 * as soon as it is written there. A production file may not import, directly or through another
 * module, the tests' catalog constants (`testing/catalogIds.ts`).
 *
 * What the scan does NOT cover: an id inside a longer string literal (`'the notes'`, a template
 * with text around it) — looking for those would flag `notes`, `chords` and `changes` wherever
 * they are everyday words; an id built from parts at run time; and the ids nested in a
 * definition (figures, shapes, levels), which are not read from the catalog.
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

/** The tests' catalog constants. */
const TEST_IDS = '/src/lib/testing/catalogIds.ts';

const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;
const EXTENSIONS = ['', '.ts', '.js', '.svelte', '.svelte.ts', '/index.ts'];

/** The file of `files` an import of `specifier` from `from` names; null outside `src/`. */
function resolve(files: Record<string, string>, from: string, specifier: string): string | null {
	let base: string;
	if (specifier.startsWith('$lib/')) base = `/src/lib/${specifier.slice('$lib/'.length)}`;
	else if (specifier.startsWith('.')) base = new URL(specifier, `file://${from}`).pathname;
	else return null;
	return EXTENSIONS.map((extension) => base + extension).find((path) => path in files) ?? null;
}

function importsOf(files: Record<string, string>, path: string): string[] {
	return [...files[path].matchAll(IMPORT_SPECIFIER)].flatMap((match) => {
		const found = resolve(files, path, match[1]);
		return found === null ? [] : [found];
	});
}

/** The test modules a production file could import: the benches and the storage fixtures. */
const TEST_MODULES = /^\/src\/lib\/(testing|infrastructure\/storage\/testing)\/(?!.*\.spec\.ts$)/;

/** Whether a text writes one of `ids` between quotes. */
function names(text: string, ids: readonly string[]): boolean {
	return ids.some((id) => ["'", '"', '`'].some((quote) => text.includes(`${quote}${id}${quote}`)));
}

/**
 * The tests' catalog constants, the test modules that name catalog ids themselves
 * (`testing/catalog.ts`), and every test module that imports one of them, directly or through
 * another (`testing/neck`, the benches), computed from the imports. Migrations name ids too and
 * are imported by the storage: they are not test modules.
 */
function testIdsModules(files: Record<string, string>, ids: readonly string[]): Set<string> {
	const reaching = new Set([
		TEST_IDS,
		...Object.keys(files).filter((path) => TEST_MODULES.test(path) && names(files[path], ids))
	]);
	for (let grown = true; grown;) {
		grown = false;
		for (const path of Object.keys(files)) {
			if (reaching.has(path) || !TEST_MODULES.test(path)) continue;
			if (importsOf(files, path).some((imported) => reaching.has(imported))) {
				reaching.add(path);
				grown = true;
			}
		}
	}
	return reaching;
}

/** Every guarded file that imports the tests' catalog constants or a module that reaches them. */
function importersOfTestIds(files: Record<string, string>, ids: readonly string[]): string[] {
	const reaching = testIdsModules(files, ids);
	return Object.keys(files)
		.filter((path) => !exempt(path))
		.filter((path) => importsOf(files, path).some((imported) => reaching.has(imported)))
		.flatMap((path) =>
			importsOf(files, path)
				.filter((imported) => reaching.has(imported))
				.map((imported) => `${path} imports ${imported}`)
		)
		.sort();
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
		expect(importersOfTestIds(sources, ids)).toEqual([]);
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
		const bench = '/src/lib/testing/bench.ts';
		const neck = '/src/lib/testing/neckLists.ts';
		const files = {
			[TEST_IDS]: `export const X = 1;`,
			[neck]: `import { X } from './catalogIds';`,
			[bench]: `import { Y } from '$lib/testing/neckLists';`,
			'/src/lib/testing/fakes.ts': `export const F = 1;`,
			'/src/lib/testing/named.ts': `export const N = 'chord-anchor';`
		};
		expect(
			importersOfTestIds(
				{ ...files, [planted]: `import { X } from '$lib/testing/catalogIds';` },
				ids
			)
		).toEqual([`${planted} imports ${TEST_IDS}`]);
		// Through a module that reaches them, two steps away; a testing module that does not is free.
		expect(
			importersOfTestIds(
				{
					...files,
					[planted]: `import { Z } from '$lib/testing/bench';\nimport { F } from '$lib/testing/fakes';`
				},
				ids
			)
		).toEqual([`${planted} imports ${bench}`]);
		// A testing module that names a catalog id itself counts as the constants do.
		expect(
			importersOfTestIds({ ...files, [planted]: `import { N } from '../testing/named';` }, ids)
		).toEqual([`${planted} imports /src/lib/testing/named.ts`]);
		expect([...testIdsModules(sources, ids)]).toEqual(
			expect.arrayContaining([
				TEST_IDS,
				'/src/lib/testing/neck.ts',
				'/src/lib/testing/notesSeries.ts',
				'/src/lib/testing/catalog.ts'
			])
		);
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
