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

/** The figure mechanic's id as code writes it, quoted (a backquoted `figure` in a comment is the word). */
const FIGURE_MECHANIC = [`'figure'`, `"figure"`];

/** The core files (specs aside) that name the figure mechanic. */
function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => path.startsWith(CORE))
		.filter(([path]) => !/\.spec\.ts$/.test(path))
		.filter(([, text]) => FIGURE_MECHANIC.some((name) => text.includes(name)))
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
	it('never names the figure mechanic: its screen and its summary receive what they need', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('has no cycle folder left: the sequence absorbed the cycle (plan S)', () => {
		expect(Object.keys(everywhere).filter((path) => path.startsWith(`${CORE}cycle/`))).toEqual([]);
	});

	it('actually scans the core, the figure stage included', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${CORE}SessionController.svelte.ts`);
		expect(paths).toContain(`${CORE}series/figureStage.ts`);
		expect(offendersIn({ [`${CORE}x.ts`]: `const id = 'figure';` })).toEqual([`${CORE}x.ts`]);
		expect(offendersIn({ [`${CORE}y.ts`]: `const id = "figure";` })).toEqual([`${CORE}y.ts`]);
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
