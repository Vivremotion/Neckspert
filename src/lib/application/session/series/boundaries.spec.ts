import { describe, expect, it } from 'vitest';
import { EXERCISES } from '$lib/domain/exercise/catalog';
import { MECHANIC_RULES } from '$lib/domain/mechanics';
import { GESTURE_PRESENTERS, NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { RHYTHM_PRESENTERS } from '$lib/application/session/cycle/presenter';

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
const CONTROLLER = '/src/lib/application/session/SessionController.svelte.ts';
const PROMPT_STAGE = '/src/lib/application/presentation/promptStage.ts';
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
	LANE_VIEW.includes(path);

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
		[NECK_PRESENTERS, TRIAD_PRESENTERS, GESTURE_PRESENTERS, RHYTHM_PRESENTERS].flatMap(
			(presenters) => Object.values(presenters).flatMap((presenter) => presenter.sensors)
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

/** The only files of the series that reach the rhythm's cycle (plan H6, D8): its compiler and its screen. */
const CYCLE_GATES = [`${MODULE}compilePlan.ts`, `${MODULE}stage.ts`];

/** The series' files (specs aside) that import from the cycle's folder, the gates aside. */
function cycleReachedFrom(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(
			([path]) => (path.startsWith(MODULE) || path === CONTROLLER) && !/\.spec\.ts$/.test(path)
		)
		.filter(([path]) => !CYCLE_GATES.includes(path))
		.filter(([, text]) => /from '(\.\.?\/cycle\/|\$lib\/application\/session\/cycle\/)/.test(text))
		.map(([path]) => path);
}

describe('the session controller and its series', () => {
	it('reaches the cycle only through its compiler and its stage dispatch', () => {
		const paths = Object.keys(sources);
		for (const gate of CYCLE_GATES) expect(paths).toContain(gate);
		expect(cycleReachedFrom(sources)).toEqual([]);
		const file = `${MODULE}x.ts`;
		expect(cycleReachedFrom({ [file]: `import { a } from '../cycle/presenter';` })).toEqual([file]);
		expect(
			cycleReachedFrom({ [file]: `import { a } from '$lib/application/session/cycle/x';` })
		).toEqual([file]);
		expect(cycleReachedFrom({ [CYCLE_GATES[0]]: `import { a } from '../cycle/x';` })).toEqual([]);
	});

	it('names no mechanic nor exercise, nor do the prompt stage and the lane view', () => {
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
		expect(cycleReachedFrom({ [CONTROLLER]: `import { a } from './cycle/presenter';` })).toEqual([
			CONTROLLER
		]);
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
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = "${name}";` })).toEqual([`${file}: ${name}`]);
			expect(offendersIn({ [file]: `const m = \`${name}\`;` })).toEqual([`${file}: ${name}`]);
		}
		expect(NAMES).toEqual(expect.arrayContaining(['locate-neck', 'triads-anchor']));
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
	});
});
