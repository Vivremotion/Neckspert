import { describe, expect, it } from 'vitest';

// The round compiler as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/exercise/round/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MODULE = '/src/lib/domain/exercise/round/';

/** The mechanics the compiler never names: the vocabulary of derivations does. */
const MECHANICS = ['locate', 'identify', 'triad-anchor', 'triad-zone', 'chord-grid'];

/** What it may take from the derivations: their registries, looked up by name. */
const REGISTRIES = ['CONTENT_DERIVATIONS', 'ITEM_NUMBERS'];

function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!path.startsWith(MODULE) || /\.spec\.ts$/.test(path)) continue;
		for (const name of MECHANICS) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const match of text.matchAll(
			/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]*derivations[^'"]*)['"]/g
		)) {
			const names = match[1].split(',').map((part) => part.trim().replace(/^type\s+/, ''));
			for (const name of names.filter((n) => n && !REGISTRIES.includes(n)))
				offenders.push(`${path}: imports ${name} from derivations`);
		}
		if (/import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]*derivations/.test(text))
			offenders.push(`${path}: imports derivations as a namespace`);
	}
	return offenders;
}

describe('the round compiler', () => {
	it('names no mechanic and takes only the registries of the derivations', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the compiler', () => {
		expect(Object.keys(sources)).toContain(`${MODULE}compile.ts`);
		const file = `${MODULE}x.ts`;
		for (const name of MECHANICS) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
		}
		expect(
			offendersIn({ [file]: `import { CONTENT_DERIVATIONS } from '../../derivations';` })
		).toEqual([]);
		expect(
			offendersIn({ [file]: `import { rootPosition } from '$lib/domain/derivations';` })
		).toEqual([`${file}: imports rootPosition from derivations`]);
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
	});
});
