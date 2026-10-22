import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Page from './Page.svelte';

afterEach(cleanup);

const body = createRawSnippet(() => ({ render: () => '<p>Contenu</p>' }));
const side = createRawSnippet(() => ({ render: () => '<span>Total</span>' }));

describe('Page', () => {
	it('is a section named by its single h1, holding its children', () => {
		render(Page, { props: { title: 'Réglages', children: body } });
		expect(screen.getByRole('region', { name: 'Réglages' })).toBeTruthy();
		expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
		expect(screen.getByText('Contenu')).toBeTruthy();
	});

	it('shows its aside only when given', () => {
		const first = render(Page, { props: { title: 'A', children: body } });
		expect(screen.queryByText('Total')).toBeNull();
		first.unmount();
		render(Page, { props: { title: 'A', children: body, aside: side } });
		expect(screen.getByText('Total')).toBeTruthy();
	});

	it('widens its column only when asked', () => {
		const first = render(Page, { props: { title: 'A', children: body } });
		expect(screen.getByRole('region').getAttribute('data-wide')).toBe('false');
		first.unmount();
		render(Page, { props: { title: 'A', children: body, wide: true } });
		expect(screen.getByRole('region').getAttribute('data-wide')).toBe('true');
	});
});
