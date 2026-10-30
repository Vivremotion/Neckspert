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
// The engraving adapter's own folder, `ui/notation`, is another thing and may be imported freely.
const REACHES_PARSER =
	/notation\/lilypond|['"](?![^'"\n]*\/ui\/notation['"])[^'"\n]*\/notation(?:\/index)?(?:\.js|\.ts)?['"]/;

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
			`import { parseLilyPond } from '$lib/domain/time/notation/lilypond';`,
			`import { parseLilyPond } from './notation/lilypond';`,
			`import { parseLilyPond } from "../time/notation/lilypond";`,
			`export * from './notation';`,
			`export { parseLilyPond } from "./notation/index";`
		];
		for (const line of imports) {
			expect(offendersIn({ '/src/lib/domain/time/x.ts': line }), line).toEqual([
				'/src/lib/domain/time/x.ts'
			]);
		}
	});

	it('allows the catalog and the notation folder, and unrelated words', () => {
		const line = `import { parseLilyPond } from '../time/notation/lilypond';`;
		expect(offendersIn({ '/src/lib/domain/exercise/catalog.ts': line })).toEqual([]);
		expect(offendersIn({ '/src/lib/domain/time/notation/other.ts': line })).toEqual([]);
		expect(
			offendersIn({ '/src/lib/domain/music/x.ts': '// staff notation is out of scope' })
		).toEqual([]);
		expect(
			offendersIn({
				'/src/routes/dev/x.ts': `import { renderFigure } from '$lib/ui/notation';`,
				'/src/lib/ui/play/y.ts': `import { renderFigure } from '$lib/ui/notation';`
			})
		).toEqual([]);
	});

	it('flags a relative import of the notation barrel from ui/play: use $lib/ui/notation', () => {
		// Intended: a relative `../notation` cannot be told from the parser's barrel by its text,
		// so the engraving adapter is imported by its alias, which this boundary lets through.
		expect(
			offendersIn({ '/src/lib/ui/play/y.ts': `import { renderFigure } from '../notation';` })
		).toEqual(['/src/lib/ui/play/y.ts']);
		expect(
			offendersIn({ '/src/lib/ui/play/y.ts': `import { renderFigure } from '$lib/ui/notation';` })
		).toEqual([]);
	});
});
