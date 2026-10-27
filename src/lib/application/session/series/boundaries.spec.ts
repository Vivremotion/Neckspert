import { describe, expect, it } from 'vitest';
import { EXERCISES } from '$lib/domain/exercise/catalog';
import { MECHANIC_RULES } from '$lib/domain/mechanics';
import { GESTURE_PRESENTERS, NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';

// The response series as raw text, keyed by its path from the project root.
const sources = {
	...import.meta.glob('/src/lib/application/session/series/**/*.ts', {
		query: '?raw',
		import: 'default',
		eager: true
	}),
	// The screen model of every response exercise, which the series builds (H5).
	...import.meta.glob('/src/lib/application/presentation/promptStage.ts', {
		query: '?raw',
		import: 'default',
		eager: true
	}),
	// The generic lane that draws them (H5): a view of the screen, naming no mechanic either.
	...import.meta.glob(
		[
			'/src/lib/ui/play/views/LaneView.svelte',
			'/src/lib/ui/play/views/laneView.ts',
			'/src/lib/ui/play/views/pictures.ts'
		],
		{ query: '?raw', import: 'default', eager: true }
	)
} as Record<string, string>;

const MODULE = '/src/lib/application/session/series/';
const PROMPT_STAGE = '/src/lib/application/presentation/promptStage.ts';
const LANE_VIEW = [
	'/src/lib/ui/play/views/LaneView.svelte',
	'/src/lib/ui/play/views/laneView.ts',
	'/src/lib/ui/play/views/pictures.ts'
];
/** The files held to the series' rules. */
const SCANNED = (path: string) =>
	path.startsWith(MODULE) || path === PROMPT_STAGE || LANE_VIEW.includes(path);

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

/** The sensors the presenters name: the series never writes them either. */
const SENSORS = [
	...new Set(
		[NECK_PRESENTERS, TRIAD_PRESENTERS, GESTURE_PRESENTERS].flatMap((presenters) =>
			Object.values(presenters).flatMap((presenter) => presenter.sensors)
		)
	)
];

/** What the series never imports, from `src/lib/`: the old timing and the metronome port. */
const FORBIDDEN = ['domain/timing', 'application/ports/MetronomePort'];

/** Words of the old one-answer timing the series never writes (a direct import is forbidden). */
const FORBIDDEN_WORDS = ['MetronomePort', 'TimingRelation'];

// Rule R6: only the text of the series' own files is checked. Type-only transitive
// imports through `../SessionDeps` stay allowed until H5.

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
		if (!SCANNED(path) || /\.spec\.ts$/.test(path)) continue;
		for (const name of [...NAMES, ...SENSORS]) {
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
	it('names no mechanic nor exercise, and imports no old timing, nor do the prompt stage and the lane view', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('names no sensor', () => {
		expect(SENSORS).toEqual(expect.arrayContaining(['note', 'tap', 'chord']));
		const file = `${MODULE}x.ts`;
		for (const sensor of SENSORS) {
			expect(offendersIn({ [file]: `const s = '${sensor}';` })).toEqual([`${file}: ${sensor}`]);
		}
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the series folder', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${MODULE}roundRunner.ts`);
		expect(paths).toContain(`${MODULE}ResponseSeriesController.svelte.ts`);
		expect(paths).toContain(PROMPT_STAGE);
		for (const path of LANE_VIEW) {
			expect(paths).toContain(path);
			expect(offendersIn({ [path]: `const m = 'chord-grid';` })).toEqual([`${path}: chord-grid`]);
		}
		for (const name of ['locate', 'chord-grid', 'note', 'tap', 'chord']) {
			expect(offendersIn({ [PROMPT_STAGE]: `const m = '${name}';` })).toEqual([
				`${PROMPT_STAGE}: ${name}`
			]);
		}
		const file = `${MODULE}x.ts`;
		for (const module of FORBIDDEN) {
			expect(offendersIn({ [file]: `import { x } from '$lib/${module}/y';` })).toContain(
				`${file}: ${module}/y`
			);
		}
		expect(offendersIn({ [file]: `import { x } from '../../../domain/timing/grid';` })).toEqual([
			`${file}: domain/timing/grid`
		]);
		expect(
			offendersIn({ [file]: `import type { M } from '../../ports/MetronomePort';` })
		).toContain(`${file}: application/ports/MetronomePort`);
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
