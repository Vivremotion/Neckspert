import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Button from './Button.svelte';

afterEach(cleanup);

const label = createRawSnippet(() => ({ render: () => '<span>Commencer</span>' }));

describe('Button', () => {
	it('renders a button with its label and variant', () => {
		render(Button, { props: { children: label } });
		const button = screen.getByRole('button', { name: 'Commencer' });
		expect(button.getAttribute('data-variant')).toBe('primary');
		expect(button.getAttribute('type')).toBe('button');
	});

	it('takes the quiet variant', () => {
		render(Button, { props: { variant: 'quiet', children: label } });
		expect(screen.getByRole('button').getAttribute('data-variant')).toBe('quiet');
	});

	it('calls onclick', async () => {
		const onclick = vi.fn();
		render(Button, { props: { onclick, children: label } });
		await fireEvent.click(screen.getByRole('button'));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('stays readable when disabled', () => {
		render(Button, { props: { disabled: true, children: label } });
		const button = screen.getByRole('button', { name: 'Commencer' });
		expect(button.hasAttribute('disabled')).toBe(true);
		expect(button.textContent).toBe('Commencer');
	});

	it('names itself with label', () => {
		render(Button, { props: { label: 'Plus fort', children: label } });
		expect(screen.getByRole('button', { name: 'Plus fort' })).toBeTruthy();
	});

	it('exposes pressed only when given', () => {
		const first = render(Button, { props: { pressed: true, children: label } });
		expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
		first.unmount();
		render(Button, { props: { children: label } });
		expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false);
	});

	it('takes the choice variant', () => {
		render(Button, { props: { variant: 'choice', children: label } });
		expect(screen.getByRole('button').getAttribute('data-variant')).toBe('choice');
	});
});
