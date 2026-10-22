import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Prompt from './Prompt.svelte';

afterEach(cleanup);

describe('Prompt', () => {
	it('shows the note big and its string below', () => {
		const { container } = render(Prompt, { props: { main: 'F', line: 'corde de B' } });
		const root = container.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-size')).toBe('hero');
		expect(root.textContent?.replace(/\s+/g, ' ').trim()).toBe('F corde de B');
	});

	it('recalls the prompt above a correction', () => {
		const { container } = render(Prompt, {
			props: { recall: 'F · corde de B', main: 'corde de B, case 6', size: 'prompt' }
		});
		const root = container.firstElementChild as HTMLElement;
		expect(root.getAttribute('data-size')).toBe('prompt');
		const text = root.textContent ?? '';
		expect(text.indexOf('F · corde de B')).toBeGreaterThanOrEqual(0);
		expect(text.indexOf('F · corde de B')).toBeLessThan(text.indexOf('corde de B, case 6'));
	});

	it('renders its children below', () => {
		const children = createRawSnippet(() => ({ render: () => '<span>diagram</span>' }));
		const { container } = render(Prompt, { props: { main: 'F', children } });
		const root = container.firstElementChild as HTMLElement;
		expect(screen.getByText('diagram')).toBeTruthy();
		expect(root.lastElementChild?.textContent).toBe('diagram');
	});
});
