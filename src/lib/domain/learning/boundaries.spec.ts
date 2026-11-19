import { describe, expect, it } from 'vitest';
import { allExercises } from '../exercise/registry';
import { ITEM_SET_NAMES } from '../sets/names';

// The learning module as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/learning/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const DOMAIN = '/src/lib/domain/';
const MODULE = `${DOMAIN}learning/`;

/** The ids of sets and exercises the procedure never names, and the old ids of the sets: every one of the registry and the catalog. */
const NAMES = [
	...new Set([
		'locate',
		'identify',
		'triad-anchor',
		'triad-zone',
		'chord-grid',
		...ITEM_SET_NAMES,
		...allExercises().map((exercise) => exercise.id)
	])
];

/** What the procedure never imports, from `src/lib/`. */
const FORBIDDEN = ['domain/music', 'domain/triads', 'domain/gesture', 'domain/sets', 'application'];

/** What it may import outside itself, from `src/lib/domain/` (a trailing `/` allows a folder). */
const ALLOWED = [
	'exercise/types',
	'exercise/selection/types',
	'exercise/tempo',
	'progress/selector',
	'progress/constants',
	'progress/review',
	'progress/success',
	'progress/cards',
	'progress/scheduling',
	'skill/types',
	'types',
	'time/'
];

/**
 * What the subject read from the exercises' data may import besides: it alone turns an exercise's
 * items, entry condition and member asked into what the procedure asks, through the registries
 * of sets, families and skills (it names no set, skill nor exercise itself).
 */
const SUBJECT = `${MODULE}exerciseSubject.ts`;
const SUBJECT_ALLOWED = [
	'exercise/itemEntries',
	'exercise/ladder',
	'exercise/levels',
	'exercise/recall',
	'exercise/selection/compile',
	'families',
	'sets',
	'sets/correspondences',
	'skill/registry'
];

/** A package (`ts-fsrs`), or a module of `src/lib/` resolved from there (`domain/time/levels`). */
type Import = { package: string } | { lib: string };

function importsOf(path: string, text: string): Import[] {
	const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
		(match) => match[1]
	);
	return specifiers.map((specifier) => {
		if (specifier.startsWith('$lib/')) return { lib: specifier.slice('$lib/'.length) };
		if (!specifier.startsWith('.')) return { package: specifier };
		const parts = path.split('/').slice(0, -1);
		for (const part of specifier.split('/')) {
			if (part === '..') parts.pop();
			else if (part !== '.') parts.push(part);
		}
		return { lib: parts.join('/').replace(/^\/src\/lib\//, '') };
	});
}

/** Inside the module, or one of the allowed modules of the domain (of the subject's, for its file). */
function allowed(module: string, path: string): boolean {
	if (!module.startsWith('domain/')) return false;
	const inDomain = module.slice('domain/'.length);
	if (path === SUBJECT && SUBJECT_ALLOWED.includes(inDomain)) return true;
	if (inDomain.startsWith('learning/')) return true;
	return ALLOWED.some((entry) =>
		entry.endsWith('/') ? inDomain.startsWith(entry) : inDomain === entry
	);
}

/** The module's files (specs aside) with what they must not hold. */
function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!path.startsWith(MODULE) || /\.spec\.ts$/.test(path)) continue;
		for (const name of NAMES) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const imported of importsOf(path, text)) {
			if ('package' in imported) continue;
			const module = imported.lib;
			const forbidden =
				!(path === SUBJECT && allowed(module, path)) &&
				FORBIDDEN.some((entry) => module === entry || module.startsWith(`${entry}/`));
			if (forbidden || !allowed(module, path)) offenders.push(`${path}: ${module}`);
		}
	}
	return offenders;
}

describe('the learning procedure', () => {
	it('names no set nor exercise and imports no music', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the learning module', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${MODULE}procedure.ts`);
		expect(paths).toContain(`${MODULE}testing/fakeSubject.ts`);
		const file = `${MODULE}x.ts`;
		for (const module of FORBIDDEN) {
			expect(offendersIn({ [file]: `import { x } from '$lib/${module}/y';` })).toEqual([
				`${file}: ${module}/y`
			]);
		}
		// Relative imports that leave the module, from a file and from a nested one.
		expect(offendersIn({ [file]: `import { x } from '../music/fretboard';` })).toEqual([
			`${file}: domain/music/fretboard`
		]);
		expect(
			offendersIn({ [`${MODULE}testing/x.ts`]: `import type { X } from '../../triads';` })
		).toEqual([`${MODULE}testing/x.ts: domain/triads`]);
		expect(offendersIn({ [file]: `import { x } from '../../application/app';` })).toEqual([
			`${file}: application/app`
		]);
		// Only the allowed modules of the domain.
		expect(offendersIn({ [file]: `import { x } from '../progress/stats';` })).toEqual([
			`${file}: domain/progress/stats`
		]);
		expect(
			offendersIn({
				[file]: [
					`import { a } from '../progress/constants';`,
					`import { b } from '$lib/domain/progress/review';`,
					`import { c } from '../time/levels';`,
					`import { d } from './ladder';`,
					`import { e } from 'ts-fsrs';`
				].join('\n')
			})
		).toEqual([]);
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = \`${name}\`;` })).toEqual([`${file}: ${name}`]);
		}
		// The catalog's exercise ids are names too.
		expect(NAMES).toEqual(expect.arrayContaining(['locate-note-string', 'chord-anchor']));
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
		// The subject alone reads the registries of sets and skills; the procedure does not.
		expect(paths).toContain(SUBJECT);
		const registries = `import { a } from '../families';\nimport { b } from '../skill/registry';`;
		expect(offendersIn({ [SUBJECT]: registries })).toEqual([]);
		expect(offendersIn({ [`${MODULE}procedure.ts`]: registries })).toEqual([
			`${MODULE}procedure.ts: domain/families`,
			`${MODULE}procedure.ts: domain/skill/registry`
		]);
		expect(offendersIn({ [SUBJECT]: `import { x } from '../music';` })).toEqual([
			`${SUBJECT}: domain/music`
		]);
		expect(offendersIn({ [SUBJECT]: `const m = 'chord-anchor';` })).toEqual([
			`${SUBJECT}: chord-anchor`
		]);
	});
});

// The domain and the application as raw text: the old subjects and their generators are gone.
const everywhere = import.meta.glob(
	['/src/lib/domain/**/*.{ts,svelte}', '/src/lib/application/**/*.{ts,svelte}'],
	{ query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

/** The hand-written subjects and the code generators of the introduction order, deleted. */
const GONE = [
	'neckSubject',
	'triadSubject',
	'isMirrorPair',
	'mirrorItems',
	'triadNotesToLearn',
	'introductionOrder',
	'triadIntroductionOrder',
	'MARKER_FRETS'
];

const THIS_FILE = `${MODULE}boundaries.spec.ts`;

function namingGone(files: Record<string, string>): string[] {
	return Object.entries(files).flatMap(([path, text]) =>
		path === THIS_FILE
			? []
			: GONE.filter((name) => new RegExp(`\\b${name}\\b`).test(text)).map(
					(name) => `${path}: ${name}`
				)
	);
}

describe('the old subjects', () => {
	it('are named nowhere in the domain or the application', () => {
		expect(Object.keys(everywhere)).toEqual(
			expect.arrayContaining([`${MODULE}procedure.ts`, '/src/lib/application/app.ts'])
		);
		expect(namingGone({ '/src/lib/domain/x.ts': 'neckSubject({})' })).toEqual([
			'/src/lib/domain/x.ts: neckSubject'
		]);
		expect(namingGone(everywhere)).toEqual([]);
	});
});

// Every module of `src/lib/` as raw text: the named draw a selection replaced is gone.
const library = import.meta.glob('/src/lib/**/*.{ts,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** The named draw and its registry, replaced by `params.learning.asks`. */
const DRAW_NAMES = ['drawNamed', 'another-place'];

function namingDraws(files: Record<string, string>): string[] {
	return Object.entries(files).flatMap(([path, text]) =>
		path === THIS_FILE || path.includes('/storage/migrations/')
			? []
			: DRAW_NAMES.filter((name) => text.includes(name)).map((name) => `${path}: ${name}`)
	);
}

describe('the named draw', () => {
	it('is named nowhere in the library, migrations aside', () => {
		expect(Object.keys(library)).toContain(`${MODULE}exerciseSubject.ts`);
		expect(namingDraws({ '/src/lib/x.ts': `drawNamed('another-place', set)` })).toEqual([
			'/src/lib/x.ts: drawNamed',
			'/src/lib/x.ts: another-place'
		]);
		expect(namingDraws(library)).toEqual([]);
	});
});
