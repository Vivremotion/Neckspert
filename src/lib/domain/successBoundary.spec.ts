import { describe, expect, it } from 'vitest';

// Every source file of the domain as raw text, keyed by its path from the project root (Vite
// resolves the glob, so the test needs no Node typings).
const sources = import.meta.glob('/src/lib/domain/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** Deciding a success from the judge's word: reaching for the old recorder's rule... */
const CALLS_RESPONSE_SUCCESS = /\bisResponseSuccess\b/;
/** ...or spelling it again: `correct` and the off-beat exception in one expression. */
const SPELLS_RESPONSE_SUCCESS = /\.correct\b[^;\n]*'offbeat'|'offbeat'[^;\n]*\.correct\b/;

function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => !path.endsWith('.spec.ts'))
		.filter(([, text]) => CALLS_RESPONSE_SUCCESS.test(text) || SPELLS_RESPONSE_SUCCESS.test(text))
		.map(([path]) => path);
}

describe('success boundary', () => {
	it('leaves the success of an attempt to Attempt.success everywhere in the domain', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the domain', () => {
		const paths = Object.keys(sources);
		expect(paths.length).toBeGreaterThan(50);
		expect(paths).toContain('/src/lib/domain/progress/stats.ts');
		expect(paths).toContain('/src/lib/domain/types.ts');
	});

	it('flags a success decided from correct', () => {
		const lines = [
			`const won = attempts.filter(isResponseSuccess);`,
			`if (isResponseSuccess(attempt)) count++;`,
			`return attempt.correct && attempt.verdict !== 'offbeat';`,
			`const late = responseVerdictOf(attempt) !== 'offbeat' && attempt.correct === true;`
		];
		for (const line of lines) {
			expect(
				offendersIn({ '/src/lib/domain/progress/x.ts': `const a = 1;\n${line}` }),
				line
			).toEqual(['/src/lib/domain/progress/x.ts']);
		}
	});

	it('allows reading success, reading correct alone and specs', () => {
		const rule = `return outcome.correct && outcome.verdict !== 'offbeat';`;
		expect(offendersIn({ '/src/lib/domain/x.spec.ts': rule })).toEqual([]);
		expect(
			offendersIn({
				'/src/lib/domain/progress/x.ts': [
					`const won = attempts.filter((attempt) => attempt.success);`,
					`if (attempt.correct !== true) return Rating.Again;`,
					`return responseVerdictOf(attempt) === 'offbeat' ? 0.5 : 0;`
				].join('\n')
			})
		).toEqual([]);
	});
});
