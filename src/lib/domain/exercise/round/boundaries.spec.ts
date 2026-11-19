import { describe, expect, it } from 'vitest';

// The round compiler as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/exercise/round/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MODULE = '/src/lib/domain/exercise/round/';

/**
 * The sets the compiler never names, by their ids and their old ones: the vocabulary of
 * derivations does. The figure set (`figure`) is not among them: its id is also the word of a figure entry (its key
 * `figure`, the content `{ from: 'figure' }`), which the compiler writes; it reads a figure on an
 * item only through `ITEM_FIGURES`.
 */
const SETS = [
	'note-on-string',
	'placed-note',
	'voicing-on-strings',
	'placed-voicing',
	'placed-shape',
	'locate',
	'identify',
	'triad-anchor',
	'triad-zone',
	'chord-grid',
	'voicing-figure',
	'form-figure'
];

/** The families it never names either: it looks them up by the names the data gives. */
const FAMILY_IDS = ['note-places', 'chord-shapes'];

/** What it may take from the derivations: their registries, looked up by name. */
const REGISTRIES = ['CONTENT_DERIVATIONS', 'ITEM_NUMBERS', 'ITEM_FIGURES', 'ITEM_VALUES'];

function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!path.startsWith(MODULE) || /\.spec\.ts$/.test(path)) continue;
		for (const name of [...SETS, ...FAMILY_IDS]) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const match of text.matchAll(/from\s*['"]([^'"]*families\/guitar[^'"]*)['"]/g))
			offenders.push(`${path}: imports ${match[1]}`);
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
	it('names no set and takes only the registries of the derivations', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the compiler', () => {
		expect(Object.keys(sources)).toContain(`${MODULE}compile.ts`);
		const file = `${MODULE}x.ts`;
		for (const name of SETS) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
		}
		expect(
			offendersIn({ [file]: `import { CONTENT_DERIVATIONS } from '../../derivations';` })
		).toEqual([]);
		expect(
			offendersIn({ [file]: `import { rootPosition } from '$lib/domain/derivations';` })
		).toEqual([`${file}: imports rootPosition from derivations`]);
		for (const name of FAMILY_IDS) {
			expect(offendersIn({ [file]: `const f = "${name}";` })).toEqual([`${file}: ${name}`]);
		}
		expect(
			offendersIn({ [file]: `import { chordShapes } from '../../families/guitar/chordShapes';` })
		).toEqual([`${file}: imports ../../families/guitar/chordShapes`]);
		expect(offendersIn({ [file]: `import { familyNamed } from '../../families';` })).toEqual([]);
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'locate';` })).toEqual([]);
	});
});
