// @ts-expect-error -- the project carries no @types/node; only this spec reads files
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error -- same
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

// Vitest does not process CSS, so the stylesheet is read as plain text.
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const staticRoot = fileURLToPath(new URL('../../../static', import.meta.url));

const ROLE_TOKENS = [
	'--np-ground',
	'--np-text',
	'--np-muted',
	'--np-earth',
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
	it('keeps the amber button label readable', () => {
		expect(contrastRatio('#23211F', '#D9A13B')).toBeGreaterThanOrEqual(4.5);
	});
});
