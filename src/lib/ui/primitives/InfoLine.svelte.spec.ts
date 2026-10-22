import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import InfoLine from './InfoLine.svelte';

afterEach(cleanup);

describe('InfoLine', () => {
	it('joins the parts with a middle dot', () => {
		const { container } = render(InfoLine, { props: { parts: ['Apprentissage', '♩ = 100'] } });
		expect(container.querySelector('.info-parts')?.textContent).toBe('Apprentissage · ♩ = 100');
	});

	it('skips empty parts', () => {
		const { container } = render(InfoLine, { props: { parts: ['', '♩ = 100'] } });
		expect(container.querySelector('.info-parts')?.textContent).toBe('♩ = 100');
	});

	it('renders its end slot', () => {
		const end = createRawSnippet(() => ({
			render: () => '<button type="button">Quitter</button>'
		}));
		render(InfoLine, { props: { parts: ['A'], end } });
		expect(screen.getByRole('button', { name: 'Quitter' })).toBeTruthy();
	});
});
