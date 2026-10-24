import { describe, expect, it } from 'vitest';
import { EXERCISES } from '$lib/domain/exercise/catalog';
import { MECHANIC_RULES } from '$lib/domain/mechanics';

// The response series as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/application/session/series/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MODULE = '/src/lib/application/session/series/';

/** The ids of mechanics and exercises the series never names: every one of the registry and the catalog. */
const NAMES = [
	...new Set([
		'locate',
		'identify',
		'triad-anchor',
		'triad-zone',
		'chord-grid',
		...MECHANIC_RULES.map((rules) => rules.id),
		...EXERCISES.map((exercise) => exercise.id)
	])
];

/** What the series never imports, from `src/lib/`: the old timing and the metronome port. */
const FORBIDDEN = ['domain/timing', 'application/ports/metronome'];

/** Words of the old one-answer timing the series never writes (a direct import is forbidden). */
const FORBIDDEN_WORDS = ['MetronomePort', 'TimingRelation'];

// Rule R6: only the text of the series' own files is checked. Type-only transitive
// imports through `../SessionDeps` or `../AttemptRecorder` stay allowed until H5.

function specifiersOf(path: string, text: string): string[] {
	const specifiers = [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
		(match) => match[1]
	);
	return specifiers.map((specifier) => {
		if (specifier.startsWith('$lib/')) return specifier.slice('$lib/'.length);
		if (!specifier.startsWith('.')) return specifier;
		const parts = path.split('/').slice(0, -1);
		for (const part of specifier.split('/')) {
			if (part === '..') parts.pop();
			else if (part !== '.') parts.push(part);
		}
		return parts.join('/').replace(/^\/src\/lib\//, '');
	});
}

function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!path.startsWith(MODULE) || /\.spec\.ts$/.test(path)) continue;
		for (const name of NAMES) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const word of FORBIDDEN_WORDS) {
			if (new RegExp(`\\b${word}\\b`).test(text)) offenders.push(`${path}: ${word}`);
		}
		for (const module of specifiersOf(path, text)) {
			if (FORBIDDEN.some((entry) => module === entry || module.startsWith(`${entry}/`)))
				offenders.push(`${path}: ${module}`);
		}
	}
	return offenders;
}

describe('the response series', () => {
	it('names no mechanic nor exercise, and imports no old timing', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the series folder', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${MODULE}roundRunner.ts`);
		expect(paths).toContain(`${MODULE}ResponseSeriesController.svelte.ts`);
		const file = `${MODULE}x.ts`;
		for (const module of FORBIDDEN) {
			expect(offendersIn({ [file]: `import { x } from '$lib/${module}/y';` })).toEqual([
				`${file}: ${module}/y`
			]);
		}
		expect(offendersIn({ [file]: `import { x } from '../../../domain/timing/grid';` })).toEqual([
			`${file}: domain/timing/grid`
		]);
		expect(offendersIn({ [file]: `import type { M } from '../../ports/metronome';` })).toEqual([
			`${file}: application/ports/metronome`
		]);
		expect(offendersIn({ [file]: `let r: TimingRelation;` })).toEqual([`${file}: TimingRelation`]);
		expect(offendersIn({ [file]: `let m: MetronomePort;` })).toEqual([`${file}: MetronomePort`]);
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = "${name}";` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = \`${name}\`;` })).toEqual([`${file}: ${name}`]);
		}
		expect(NAMES).toEqual(expect.arrayContaining(['locate-neck', 'triads-anchor']));
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
	});
});
