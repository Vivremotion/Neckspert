import { describe, expect, it } from 'vitest';
import { allExercises } from '$lib/domain/exercise/registry';
import { FAMILIES } from '$lib/domain/families';
import { ITEM_SET_NAMES } from '$lib/domain/sets';
import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';

// The session controller and its series as raw text, keyed by its path from the project root.
const sources = {
	...import.meta.glob(
		[
			'/src/lib/application/session/series/**/*.ts',
			'/src/lib/application/session/SessionController.svelte.ts'
		],
		{ query: '?raw', import: 'default', eager: true }
	),
	// The screen model of every response exercise, which the series builds (H5).
	...import.meta.glob(
		[
			'/src/lib/application/presentation/promptStage.ts',
			// The screen model of a passage's round (plan 4c), its sibling.
			'/src/lib/application/presentation/passageStage.ts'
		],
		{
			query: '?raw',
			import: 'default',
			eager: true
		}
	),
	// The generic lane that draws them (H5): a view of the screen, naming no set either.
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
const CONTROLLER = '/src/lib/application/session/SessionController.svelte.ts';
const PROMPT_STAGE = '/src/lib/application/presentation/promptStage.ts';
const PASSAGE_STAGE = '/src/lib/application/presentation/passageStage.ts';
const LANE_VIEW = [
	'/src/lib/ui/play/views/LaneView.svelte',
	'/src/lib/ui/play/views/laneView.ts',
	'/src/lib/ui/play/views/pictures.ts'
];
/** The files held to the series' rules. */
const SCANNED = (path: string) =>
	path.startsWith(MODULE) ||
	path === CONTROLLER ||
	path === PROMPT_STAGE ||
	path === PASSAGE_STAGE ||
	LANE_VIEW.includes(path);

/** The ids of sets, families and exercises the series never names, and the old ids of the sets: every one of the registry and the catalog. */
const NAMES = [
	...new Set([
		'locate',
		'identify',
		'triad-anchor',
		'triad-zone',
		'chord-grid',
		...ITEM_SET_NAMES,
		...Object.keys(FAMILIES),
		...allExercises().map((exercise) => exercise.id)
	])
];

/** The sensors the presenters name: the series never writes them either. */
const SENSORS = [
	...new Set(
		[SET_PRESENTERS, VIEW_PRESENTERS].flatMap((presenters) =>
			Object.values(presenters).flatMap((presenter) => presenter.sensors)
		)
	)
];

function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!SCANNED(path) || /\.spec\.ts$/.test(path)) continue;
		for (const name of [...NAMES, ...SENSORS]) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
	}
	return offenders;
}

describe('the session controller and its series', () => {
	it('names no set nor exercise, nor do the prompt and passage stages and the lane view', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('names no sensor', () => {
		expect(SENSORS).toEqual(expect.arrayContaining(['note', 'tap', 'chord', 'attack']));
		const file = `${MODULE}x.ts`;
		for (const sensor of SENSORS) {
			expect(offendersIn({ [file]: `const s = '${sensor}';` })).toEqual([`${file}: ${sensor}`]);
		}
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the series folder', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${MODULE}roundRunner.ts`);
		expect(paths).toContain(CONTROLLER);
		// The session controller is held to the same rules as its series.
		expect(offendersIn({ [CONTROLLER]: `const s = 'attack';` })).toEqual([`${CONTROLLER}: attack`]);
		expect(offendersIn({ [CONTROLLER]: `const m = 'figure';` })).toEqual([`${CONTROLLER}: figure`]);
		expect(paths).toContain(PROMPT_STAGE);
		expect(paths).toContain(PASSAGE_STAGE);
		for (const name of ['chord-shapes', 'grid-changes', 'change', 'inversion-run', 'chord']) {
			expect(offendersIn({ [PASSAGE_STAGE]: `const m = '${name}';` })).toEqual([
				`${PASSAGE_STAGE}: ${name}`
			]);
		}
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
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = "${name}";` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = \`${name}\`;` })).toEqual([`${file}: ${name}`]);
		}
		expect(NAMES).toEqual(expect.arrayContaining(['locate-note-string', 'chord-anchor']));
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
	});
});
