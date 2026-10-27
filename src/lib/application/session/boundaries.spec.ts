import { describe, expect, it } from 'vitest';

// The session core as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/application/session/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const CORE = '/src/lib/application/session/';
const PLAN = `${CORE}plan/`;
/** The pieces of the rhythm's cycle (plan H6, D8): an exception, until the sequence absorbs it. */
const CYCLE = `${CORE}cycle/`;

/** The core files (outside `plan/` and `cycle/`, specs aside) that name the rhythm mechanic. */
function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => path.startsWith(CORE) && !path.startsWith(PLAN) && !path.startsWith(CYCLE))
		.filter(([path]) => !/\.spec\.ts$/.test(path))
		.filter(([, text]) => text.includes('rhythm-figure'))
		.map(([path]) => path);
}

describe('the session core', () => {
	it('never names the rhythm mechanic: the plan controller receives what it needs', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the core, the plan and the cycle folders', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${CORE}series/ResponseSeriesController.svelte.ts`);
		expect(paths).toContain(`${PLAN}PlanSessionController.svelte.ts`);
		expect(paths).toContain(`${CYCLE}recordCycle.ts`);
		expect(offendersIn({ [`${CYCLE}x.ts`]: `const id = 'rhythm-figure';` })).toEqual([]);
		expect(offendersIn({ [`${CORE}x.ts`]: `const id = 'rhythm-figure';` })).toEqual([
			`${CORE}x.ts`
		]);
		expect(offendersIn({ [`${PLAN}x.ts`]: `const id = 'rhythm-figure';` })).toEqual([]);
	});
});
