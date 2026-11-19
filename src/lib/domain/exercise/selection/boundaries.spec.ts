import { describe, expect, it } from 'vitest';

// The selection's module as raw text, keyed by its path from the project root.
const sources = import.meta.glob('/src/lib/domain/exercise/selection/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const MODULE = '/src/lib/domain/exercise/selection/';

/** What the module never names: it looks sets and families up by the names the data gives. */
const NAMES = [
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

/** What it never imports: the instrument, and the families built on it. */
const IMPORTS: readonly RegExp[] = [/families\/guitar/, /(^|\/)music(\/|$)/, /(^|\/)triads(\/|$)/];

function offendersIn(files: Record<string, string>): string[] {
	const offenders: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		if (!path.startsWith(MODULE) || path.endsWith('.spec.ts')) continue;
		for (const name of NAMES) {
			if (["'", '"', '`'].some((quote) => text.includes(`${quote}${name}${quote}`)))
				offenders.push(`${path}: ${name}`);
		}
		for (const match of text.matchAll(/from\s*['"]([^'"]*)['"]/g)) {
			if (IMPORTS.some((pattern) => pattern.test(match[1])))
				offenders.push(`${path}: imports ${match[1]}`);
		}
	}
	return offenders;
}

describe('the selection module', () => {
	it('names no set, no family and no instrument', () => {
		expect(offendersIn(sources)).toEqual([]);
	});

	it('actually scans the module, and flags what it must not name', () => {
		expect(Object.keys(sources)).toContain(`${MODULE}compile.ts`);
		expect(Object.keys(sources)).toContain(`${MODULE}validate.ts`);
		const file = `${MODULE}x.ts`;
		for (const name of NAMES) {
			expect(offendersIn({ [file]: `const m = '${name}';` })).toEqual([`${file}: ${name}`]);
		}
		expect(
			offendersIn({ [file]: `import { notePlaces } from '../../families/guitar/notePlaces';` })
		).toEqual([`${file}: imports ../../families/guitar/notePlaces`]);
		expect(offendersIn({ [file]: `import { midiOnString } from '../../music';` })).toEqual([
			`${file}: imports ../../music`
		]);
		expect(
			offendersIn({ [file]: `import { admitted, familyNamed } from '../../families';` })
		).toEqual([]);
		expect(offendersIn({ [`${MODULE}x.spec.ts`]: `const m = 'note-places';` })).toEqual([]);
	});
});
