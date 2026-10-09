import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShapeView } from '$lib/application/session/contract';
import ChordShape from './ChordShape.svelte';

afterEach(() => cleanup());

/** D, root on B: 2-3-2 on G-B-E. */
const D_232: ShapeView = {
	notes: [
		{ string: 3, fret: 2 },
		{ string: 2, fret: 3 },
		{ string: 1, fret: 2 }
	]
};
/** C, root on G: 5-5-3. */
const C_553: ShapeView = {
	notes: [
		{ string: 3, fret: 5 },
		{ string: 2, fret: 5 },
		{ string: 1, fret: 3 }
	]
};
/** C, root on B: 0-1-0. */
const C_010: ShapeView = {
	notes: [
		{ string: 3, fret: 0 },
		{ string: 2, fret: 1 },
		{ string: 1, fret: 0 }
	]
};

describe('ChordShape on strings', () => {
	it('draws six strings, the shape on its own with each name and fret', () => {
		const { container } = render(ChordShape, {
			props: { shape: D_232, style: 'strings', locale: 'fr' }
		});
		expect(container.querySelectorAll('.row')).toHaveLength(6);
		const played = [...container.querySelectorAll('.row.played')].map((row) => [
			row.querySelector('.name')?.textContent,
			row.querySelector('.fret')?.textContent
		]);
		expect(played).toEqual([
			['mi', '2'],
			['si', '3'],
			['sol', '2']
		]);
	});

	it('names the strings in English', () => {
		const { container } = render(ChordShape, {
			props: { shape: D_232, style: 'strings', locale: 'en' }
		});
		expect([...container.querySelectorAll('.row.played .name')].map((n) => n.textContent)).toEqual([
			'E',
			'B',
			'G'
		]);
	});
});

describe('ChordShape on a grid', () => {
	const dots = (container: HTMLElement) =>
		[...container.querySelectorAll('.dot')].map((dot) => [
			Number(dot.getAttribute('data-string')),
			Number(dot.getAttribute('data-fret'))
		]);

	it('puts a dot on each pressed fret, from the nut when the shape fits there', () => {
		const { container } = render(ChordShape, {
			props: { shape: D_232, style: 'grid', locale: 'fr' }
		});
		expect(dots(container)).toEqual([
			[3, 2],
			[2, 3],
			[1, 2]
		]);
		expect(container.querySelector('.nut')).not.toBeNull();
		expect(container.querySelector('.base')).toBeNull();
	});

	it('writes the fret it starts from when the shape lies up the neck', () => {
		const { container } = render(ChordShape, {
			props: { shape: C_553, style: 'grid', locale: 'fr' }
		});
		expect(container.querySelector('.base')?.textContent).toBe('3');
		expect(container.querySelector('.nut')).toBeNull();
	});

	it('rings an open string above the nut', () => {
		const { container } = render(ChordShape, {
			props: { shape: C_010, style: 'grid', locale: 'fr' }
		});
		expect(container.querySelectorAll('.open')).toHaveLength(2);
		expect(dots(container)).toEqual([[2, 1]]);
	});
});
