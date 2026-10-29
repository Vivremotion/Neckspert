import { describe, expect, it } from 'vitest';

// The session core as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/application/session/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

// Every source of the app, to check what is gone is named nowhere.
const everywhere = import.meta.glob(['/src/**/*.ts', '/src/**/*.svelte'], {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const CORE = '/src/lib/application/session/';
/** The pieces of the rhythm's cycle (plan H6, D8): an exception, until the sequence absorbs it. */
const CYCLE = `${CORE}cycle/`;

/** The core files (outside `cycle/`, specs aside) that name the rhythm mechanic. */
function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => path.startsWith(CORE) && !path.startsWith(CYCLE))
		.filter(([path]) => !/\.spec\.ts$/.test(path))
		.filter(([, text]) => text.includes('rhythm-figure'))
		.map(([path]) => path);
}

/** The two controllers one session controller replaced (plan H6), written apart so this file does not name them. */
const GONE = [['Plan', 'SessionController'].join(''), ['Response', 'SeriesController'].join('')];

/** The files that still name a controller that is gone. */
function namingGone(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([, text]) => GONE.some((name) => text.includes(name)))
		.map(([path]) => path);
}

describe('the session core', () => {
	it('never names the rhythm mechanic: the cycle receives what it needs', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the core and the cycle folder', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${CORE}SessionController.svelte.ts`);
		expect(paths).toContain(`${CYCLE}recordCycle.ts`);
		expect(offendersIn({ [`${CYCLE}x.ts`]: `const id = 'rhythm-figure';` })).toEqual([]);
		expect(offendersIn({ [`${CORE}x.ts`]: `const id = 'rhythm-figure';` })).toEqual([
			`${CORE}x.ts`
		]);
	});

	it('plays every exercise on one session controller: the controllers it replaced are named nowhere', () => {
		expect(Object.keys(everywhere)).toContain('/src/routes/session/+page.svelte');
		expect(namingGone({ 'x.ts': `new ${GONE[0]}()`, 'y.ts': `new ${GONE[1]}()` })).toEqual([
			'x.ts',
			'y.ts'
		]);
		expect(namingGone(everywhere)).toEqual([]);
	});
});
