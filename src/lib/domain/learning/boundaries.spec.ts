import { describe, expect, it } from 'vitest';

// The learning module as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/learning/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const DOMAIN = '/src/lib/domain/';
const MODULE = `${DOMAIN}learning/`;

/** The ids of mechanics and exercises the procedure never names. */
const NAMES = ['locate', 'identify', 'triad-anchor', 'triad-zone', 'chord-grid'];

/** What the procedure never imports, from `src/lib/`. */
const FORBIDDEN = [
	'domain/music',
	'domain/triads',
	'domain/gesture',
	'domain/mechanics',
	'domain/timing',
	'application'
];

/** What it may import outside itself, from `src/lib/domain/` (a trailing `/` allows a folder). */
const ALLOWED = [
	'exercise/types',
	'exercise/tempo',
	'progress/selector',
	'progress/constants',
	'progress/review',
	'progress/success',
	'progress/cards',
	'progress/scheduling',
	'types',
	'time/'
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

/** Inside the module, or one of the allowed modules of the domain. */
function allowed(module: string): boolean {
	if (!module.startsWith('domain/')) return false;
	const inDomain = module.slice('domain/'.length);
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
			if (text.includes(`'${name}'`) || text.includes(`"${name}"`))
				offenders.push(`${path}: ${name}`);
		}
		for (const imported of importsOf(path, text)) {
			if ('package' in imported) continue;
			const module = imported.lib;
			const forbidden = FORBIDDEN.some(
				(entry) => module === entry || module.startsWith(`${entry}/`)
			);
			if (forbidden || !allowed(module)) offenders.push(`${path}: ${module}`);
		}
	}
	return offenders;
}

describe('the learning procedure', () => {
	it('names no mechanic nor exercise and imports no music', () => {
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
		expect(offendersIn({ [file]: `import { x } from '../progress/learnSelector';` })).toEqual([
			`${file}: domain/progress/learnSelector`
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
		}
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
	});
});
