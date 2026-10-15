import { describe, expect, it } from 'vitest';

// Every source file of the project as raw text, keyed by its path from the project root
// (Vite resolves the glob, so the test needs no Node typings).
const sources = import.meta.glob('/src/**/*.{ts,js,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const ALLOWED_PREFIXES = ['/src/lib/domain/time/notation/', '/src/lib/domain/exercise/'];

// The parser by any path (`$lib/domain/time/notation/lilypond`, `./notation/lilypond`,
// `../notation/lilypond`), or the notation folder itself as a barrel (`./notation`,
// `./notation/index`), which would let the parser through unseen.
const REACHES_PARSER = /notation\/lilypond|['"][^'"\n]*\/notation(?:\/index)?(?:\.js|\.ts)?['"]/;

function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)))
		.filter(([, text]) => REACHES_PARSER.test(text))
		.map(([path]) => path);
}

describe('lilypond boundary', () => {
	it('is imported only by the notation folder and the exercise catalog', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the source tree', () => {
		const paths = Object.keys(sources);
		expect(paths.length).toBeGreaterThan(50);
		expect(paths).toContain('/src/lib/domain/time/notation/lilypond.ts');
	});

	it('flags every way of reaching the parser from outside', () => {
		const imports = [
			`import { parseLilyPondRhythm } from '$lib/domain/time/notation/lilypond';`,
			`import { parseLilyPondRhythm } from './notation/lilypond';`,
			`import { parseLilyPondRhythm } from "../time/notation/lilypond";`,
			`export * from './notation';`,
			`export { parseLilyPondRhythm } from "./notation/index";`
		];
		for (const line of imports) {
			expect(offendersIn({ '/src/lib/domain/time/x.ts': line }), line).toEqual([
				'/src/lib/domain/time/x.ts'
			]);
		}
	});

	it('allows the catalog and the notation folder, and unrelated words', () => {
		const line = `import { parseLilyPondRhythm } from '../time/notation/lilypond';`;
		expect(offendersIn({ '/src/lib/domain/exercise/catalog.ts': line })).toEqual([]);
		expect(offendersIn({ '/src/lib/domain/time/notation/other.ts': line })).toEqual([]);
		expect(
			offendersIn({ '/src/lib/domain/music/x.ts': '// staff notation is out of scope' })
		).toEqual([]);
	});
});
