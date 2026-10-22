import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { contrastRatio } from '$lib/ui/contrast';
import NavRail from './NavRail.svelte';

afterEach(cleanup);

const items = [
	{ key: 'practice', href: '/', label: 'Pratiquer' },
	{ key: 'library', href: '/session?kind=free', label: 'Bibliothèque' },
	{ key: 'progress', href: '/map', label: 'Progrès' }
];

describe('NavRail', () => {
	it('renders a named nav with one link per item, in order', () => {
		render(NavRail, { props: { label: 'Navigation', brand: 'neckspert', items, current: null } });
		const nav = screen.getByRole('navigation', { name: 'Navigation' });
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((a) => a.textContent?.trim())).toEqual([
			'Pratiquer',
			'Bibliothèque',
			'Progrès'
		]);
	});

	it('marks only the current item', () => {
		render(NavRail, {
			props: { label: 'Navigation', brand: 'neckspert', items, current: 'progress' }
		});
		const marked = screen
			.getAllByRole('link')
			.filter((a) => a.getAttribute('aria-current') === 'page');
		expect(marked.map((a) => a.textContent?.trim())).toEqual(['Progrès']);
	});

	it('writes no number in the links', () => {
		render(NavRail, { props: { label: 'Navigation', brand: 'neckspert', items, current: null } });
		for (const a of screen.getAllByRole('link')) expect(a.textContent).not.toMatch(/\d/);
	});

	it('keeps the brand as aria-hidden decoration', () => {
		const { container } = render(NavRail, {
			props: { label: 'Navigation', brand: 'neckspert', items, current: null }
		});
		const brand = container.querySelector('[aria-hidden="true"]');
		expect(brand?.textContent).toBe('neckspert');
	});

	it('keeps the resting links readable on the ink (opacity 0.62)', () => {
		const ink = [0x23, 0x21, 0x1f];
		const ground = [0xec, 0xe8, 0xe2];
		const hex = ink.map((c, i) =>
			Math.round(c + (ground[i] - c) * 0.62)
				.toString(16)
				.padStart(2, '0')
		);
		expect(contrastRatio(`#${hex.join('')}`, '#23211f')).toBeGreaterThanOrEqual(4.5);
	});
});
