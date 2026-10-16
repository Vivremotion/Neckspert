import { describe, expect, it } from 'vitest';

// Every source file of the project as raw text, keyed by its path from the project root
// (Vite resolves the glob, so the test needs no Node typings).
const sources = import.meta.glob('/src/**/*.{ts,js,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const ALLOWED_PREFIX = '/src/lib/ui/notation/';

// Any way of naming the package: `vexflow`, `vexflow/bravura`, a require or a dynamic import.
const REACHES_VEXFLOW = /['"]vexflow(?:\/[^'"\n]*)?['"]/;

function offendersIn(files: Record<string, string>): string[] {
	return Object.entries(files)
		.filter(([path]) => !path.startsWith(ALLOWED_PREFIX))
		.filter(([, text]) => REACHES_VEXFLOW.test(text))
		.map(([path]) => path);
}

describe('vexflow boundary', () => {
	it('is imported only by the notation adapter', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the source tree and finds the adapter importing it', () => {
		const paths = Object.keys(sources);
		expect(paths.length).toBeGreaterThan(50);
		expect(paths).toContain('/src/lib/ui/notation/renderFigure.ts');
		expect(REACHES_VEXFLOW.test(sources['/src/lib/ui/notation/renderFigure.ts'])).toBe(true);
	});

	it('flags every way of reaching the package from outside', () => {
		const imports = [
			`import { Renderer } from 'vexflow';`,
			`import VexFlow from "vexflow/bravura";`,
			`const vf = await import('vexflow/core');`,
			`export * from 'vexflow';`
		];
		for (const line of imports) {
			expect(offendersIn({ '/src/lib/ui/play/x.ts': line }), line).toEqual([
				'/src/lib/ui/play/x.ts'
			]);
		}
	});

	it('allows the adapter itself and unrelated words', () => {
		expect(offendersIn({ '/src/lib/ui/notation/x.ts': `import 'vexflow/bravura';` })).toEqual([]);
		expect(
			offendersIn({ '/src/lib/ui/play/x.ts': '// engraved with vexflow, see notation' })
		).toEqual([]);
	});
});
