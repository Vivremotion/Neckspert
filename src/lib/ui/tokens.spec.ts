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
	'--np-on-field',
	'--np-rule',
	'--np-field',
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

	it('gives the lane cells fill colours, not sizes', () => {
		expect(css).toMatch(/--np-cell\s*:\s*rgba\(/);
		expect(css).toMatch(/--np-cell-downbeat\s*:\s*rgba\(/);
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
	it('keeps text readable on the middle of the field', () => {
		expect(contrastRatio('#ECE8E2', '#656968')).toBeGreaterThanOrEqual(4.5);
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

/** The Game Boy tokens: the pixel world's only, until plan 3 migrates its last views. */
const GAME_BOY_TOKEN = /--np-(?:bg|mid|shade|ink|tile|font-pixel|type-[a-z]+|space-\d+)\b/;

/**
 * The files still drawn in the pixel world, or bridging it in a migrated screen. The list only
 * shrinks: a migrated view leaves it, and the last one takes the Game Boy tokens with it.
 */
const PIXEL_WORLD_FILES = [
	'/src/lib/ui/play/PixelWord.svelte',
	'/src/lib/ui/play/PlayFrame.svelte',
	'/src/lib/ui/play/views/DrawnMiss.svelte',
	'/src/lib/ui/play/views/FigureView.svelte',
	'/src/lib/ui/play/views/GridScrollView.svelte',
	'/src/lib/ui/play/views/LinkLaneView.svelte',
	'/src/lib/ui/play/views/MarkShape.svelte',
	'/src/lib/ui/play/views/NeckDiagram.svelte',
	'/src/lib/ui/play/views/NeckPicture.svelte',
	'/src/lib/ui/play/views/PlayedCycle.svelte',
	'/src/lib/ui/primitives/ChordShape.svelte',
	'/src/lib/ui/primitives/PixelButton.svelte',
	'/src/lib/ui/primitives/Term.svelte',
	'/src/lib/ui/primitives/VerdictSprite.svelte',
	'/src/lib/ui/screens/summary/SummaryScreen.svelte',
	'/src/lib/ui/tokens.css'
];

/** The rule blocks of a stylesheet, as their selector and body (no nesting in tokens.css). */
function blocks(css: string): { selector: string; body: string }[] {
	const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
	return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
		selector: selector.trim(),
		body
	}));
}

describe('the Game Boy tokens', () => {
	it('are declared only while a frame of the pixel world is on screen', () => {
		const declaring = blocks(css).filter(({ body }) =>
			new RegExp(`${GAME_BOY_TOKEN.source}\\s*:`).test(body)
		);
		expect(declaring.length).toBeGreaterThan(0);
		for (const { selector } of declaring) {
			expect(selector).toBe(":root:has([data-world='pixel'])");
		}
	});

	it('do not paint the page outside the pixel world', () => {
		const page = blocks(css).filter(({ selector }) => /^html,\s*body$/.test(selector));
		expect(page).toHaveLength(1);
		expect(page[0].body).toContain('var(--np-ground)');
		expect(page[0].body).not.toMatch(GAME_BOY_TOKEN);
	});

	it('are read only by the files of the pixel world and their bridges', () => {
		const readers = Object.entries(sources)
			.filter(([, text]) => GAME_BOY_TOKEN.test(text))
			.map(([path]) => path)
			.sort();
		expect(readers).toEqual([...PIXEL_WORLD_FILES].sort());
	});
});
