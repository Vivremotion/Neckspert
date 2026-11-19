import { describe, expect, it } from 'vitest';

// The passage module as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/exercise/passage/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MODULE = '/src/lib/domain/exercise/passage/';

/** What the module never names: it looks sets and families up by the names the data gives, and names no exercise. */
const NAMES = [
	'grid-changes',
	'inversion-run',
	'grid-in-direction',
	'grid-in-zone',
	'grid-reading',
	'chord-anchor',
	'chord-zone',
	'note-on-string',
	'placed-note',
	'voicing-on-strings',
	'placed-voicing',
	'placed-shape',
	'change',
	'figure',
	'note-places',
	'chord-shapes'
];

/** What it never imports: the instrument, the music, the sets, and the families built on them. */
const IMPORTS: readonly RegExp[] = [
	/families\/guitar/,
	/families\/music/,
	/(^|\/)grid(\/|$)/,
	// The correspondences alone, a registry looked up by the names the data gives.
	/(^|\/)sets(\/(?!correspondences$)|$)/,
	/(^|\/)music(\/|$)/,
	/(^|\/)triads(\/|$)/
];

/** What a module imports: `from '…'`, a bare `import '…'` or a dynamic `import('…')`. */
const IMPORT_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]*)['"]/g;

function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!path.startsWith(MODULE) || path.endsWith('.spec.ts')) continue;
		for (const name of NAMES) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const match of text.matchAll(IMPORT_SPECIFIER)) {
			if (IMPORTS.some((pattern) => pattern.test(match[1])))
				offenders.push(`${path}: imports ${match[1]}`);
		}
	}
	return offenders;
}

describe('the passage module', () => {
	it('names no set, no family and no instrument', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the module, and flags what it must not name', () => {
		expect(Object.keys(sources)).toContain(`${MODULE}indices.ts`);
		expect(Object.keys(sources)).toContain(`${MODULE}validate.ts`);
		const file = `${MODULE}x.ts`;
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
		}
		expect(
			offendersIn({ [file]: `import { notePlaces } from '../../families/guitar/notePlaces';` })
		).toEqual([`${file}: imports ../../families/guitar/notePlaces`]);
		expect(offendersIn({ [file]: `import '../../families/guitar/notes';` })).toEqual([
			`${file}: imports ../../families/guitar/notes`
		]);
		expect(
			offendersIn({ [file]: `import { correspondingCard } from '../../sets/correspondences';` })
		).toEqual([]);
		expect(offendersIn({ [file]: `import { itemSet } from '../../sets';` })).toEqual([
			`${file}: imports ../../sets`
		]);
		expect(offendersIn({ [file]: `const m = import("../../music");` })).toEqual([
			`${file}: imports ../../music`
		]);
		expect(offendersIn({ [file]: `import { midiOnString } from '../../music';` })).toEqual([
			`${file}: imports ../../music`
		]);
		expect(
			offendersIn({ [file]: `import { admitted, familyNamed } from '../../families';` })
		).toEqual([]);
		expect(
			offendersIn({
				[file]: `import { gridChangesFamily } from '../../families/music/gridChanges';`
			})
		).toEqual([`${file}: imports ../../families/music/gridChanges`]);
		expect(
			offendersIn({ [file]: `import { admitted } from '../../families/core/select';` })
		).toEqual([]);
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'note-places';` })).toEqual([]);
	});
});
