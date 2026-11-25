// @ts-expect-error -- the project carries no @types/node; only this spec reads files
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error -- same
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

// Vitest does not process CSS, so the stylesheet is read as plain text.
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const staticRoot = fileURLToPath(new URL('../../../static', import.meta.url));

// Every Svelte source as raw text, keyed by its path from the project root, with the stylesheet.
const sources = {
	...(import.meta.glob('/src/**/*.svelte', {
		query: '?raw',
		import: 'default',
		eager: true
	}) as Record<string, string>),
	'/src/lib/ui/tokens.css': css
};

const ROLE_TOKENS = [
	'--np-ground',
	'--np-text',
	'--np-muted',
	'--np-earth',
	'--np-earth-text',
	'--np-muted-text',
	'--np-now',
	'--np-rule',
	'--np-font-text',
	'--np-size-meta',
	'--np-size-body',
	'--np-size-title',
	'--np-size-prompt',
	'--np-size-hero',
	'--np-size-correction',
	'--np-size-cell',
	...Array.from({ length: 8 }, (_, i) => `--np-step-${i + 1}`),
	'--np-motion-imprint',
	'--np-motion-ease',
	'--np-cell',
	'--np-cell-downbeat',
	'--np-cell-band',
	'--np-cell-past-opacity',
	'--np-cell-gap'
];

describe('quiet direction tokens', () => {
	it('defines every role token of the new world', () => {
		for (const name of ROLE_TOKENS) {
			expect(css, name).toMatch(new RegExp(`${name}\\s*:`));
		}
	});

	it('declares the self-hosted text face', () => {
		const faces = css.match(/@font-face\s*{[^}]*Atkinson Hyperlegible Next[^}]*}/g) ?? [];
		expect(faces).toHaveLength(4);
		for (const face of faces) {
			const urls = [...face.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]);
			expect(urls.length).toBeGreaterThan(0);
			for (const url of urls) {
				expect(existsSync(staticRoot + url), url).toBe(true);
			}
		}
	});

	it('gives the lane cells fill colours, not sizes: ink laid thin on the ground', () => {
		expect(css).toMatch(/--np-cell\s*:\s*rgba\(35, 33, 31,/);
		expect(css).toMatch(/--np-cell-downbeat\s*:\s*rgba\(35, 33, 31,/);
		expect(css).toMatch(/--np-cell-band\s*:\s*rgba\(35, 33, 31,/);
	});

	it('declares no custom property twice', () => {
		// A media query may restate a token (reduced motion); only top-level rules count.
		const flat = css.replace(/@media[^{]*{[^{}]*{[^}]*}\s*}/g, '');
		const names = [...flat.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
		const repeated = names.filter((name, i) => names.indexOf(name) !== i);
		expect(repeated).toEqual([]);
	});

	it('keeps the meta size at 16px or more', () => {
		const declaration = css.match(/--np-size-meta\s*:\s*clamp\(\s*([\d.]+)px/);
		expect(declaration).not.toBeNull();
		expect(Number(declaration![1])).toBeGreaterThanOrEqual(16);
	});
});

describe('contrastRatio', () => {
	it('is 21 between black and white', () => {
		expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
	});
	it('keeps the ink readable on the ground', () => {
		expect(contrastRatio('#23211F', '#ECE8E2')).toBeGreaterThanOrEqual(7);
	});
	it('keeps an ink name readable on a band cell', () => {
		// Ink at 30% over the ground, as `--np-cell-band` paints it.
		expect(contrastRatio('#23211F', '#B0ADA7')).toBeGreaterThanOrEqual(4.5);
	});
	it('keeps the text variants of umber and slate readable on the ground', () => {
		for (const name of ['--np-earth-text', '--np-muted-text']) {
			const value = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`))?.[1];
			expect(value, name).toBeDefined();
			expect(contrastRatio(value!, '#ECE8E2'), name).toBeGreaterThanOrEqual(4.5);
		}
	});
	it('keeps the amber button label readable', () => {
		expect(contrastRatio('#23211F', '#D9A13B')).toBeGreaterThanOrEqual(4.5);
	});
});

/** The Game Boy tokens of the old world, gone with plan 3: no file declares or reads them again. */
const GAME_BOY_TOKEN = /--np-(?:bg|mid|shade|ink|tile|font-pixel|type-[a-z]+|space-\d+)\b/;
/** The misty field of the first quiet play screen, gone with the author's test of 2026-11-25. */
const FIELD_TOKEN = /--np-(?:field|on-field)\b/;

describe('the old world', () => {
	it('declares no Game Boy token and paints every page in the quiet world', () => {
		expect(css).not.toMatch(GAME_BOY_TOKEN);
		expect(css).not.toMatch(/VT323|Oxanium/);
		expect(css).toMatch(/html,\s*body\s*{[^}]*var\(--np-ground\)/);
	});

	it('is read by no file: a screen never drifts back to it', () => {
		const readers = Object.entries(sources)
			.filter(([, text]) => GAME_BOY_TOKEN.test(text))
			.map(([path]) => path)
			.sort();
		expect(readers).toEqual([]);
	});
});

describe('the field', () => {
	it('is the ground: no file declares or reads a field token, and play is on the ground', () => {
		expect(css).not.toMatch(FIELD_TOKEN);
		expect(css).not.toMatch(/gradient\(/);
		const readers = Object.entries(sources)
			.filter(([, text]) => FIELD_TOKEN.test(text))
			.map(([path]) => path)
			.sort();
		expect(readers).toEqual([]);
	});
});
