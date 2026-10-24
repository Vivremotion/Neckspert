import { describe, expect, it } from 'vitest';

// The time core as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/time/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const CORE = '/src/lib/domain/time/';

/** What the time core never imports: the music, the judges, the old timing, the application. */
const FORBIDDEN = [
	'$lib/domain/music',
	'$lib/domain/mechanics',
	'$lib/domain/judges',
	'$lib/domain/triads',
	'$lib/domain/gesture',
	'$lib/domain/timing',
	'$lib/domain/scoring',
	'$lib/application'
];

/** The core files (specs aside) that import something forbidden. */
function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => path.startsWith(CORE) && !/\.spec\.ts$/.test(path))
		.filter(([, text]) => FORBIDDEN.some((module) => text.includes(module)))
		.map(([path]) => path);
}

describe('the time core', () => {
	it('imports nothing of the music, the judges, the old timing nor the application', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the time core', () => {
		const paths = Object.keys(sources);
		expect(paths).toContain(`${CORE}round.ts`);
		expect(paths).toContain(`${CORE}modes/firstAnswer.ts`);
		for (const module of FORBIDDEN) {
			expect(offendersIn({ [`${CORE}x.ts`]: `import { x } from '${module}/y';` })).toEqual([
				`${CORE}x.ts`
			]);
		}
		expect(
			offendersIn({ [`${CORE}x.spec.ts`]: `import { x } from '$lib/domain/judges';` })
		).toEqual([]);
	});
});
