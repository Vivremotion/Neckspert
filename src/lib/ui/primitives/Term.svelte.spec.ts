import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { GLOSSARY } from '$lib/domain/glossary';
import TwoTerms from './testing/TwoTerms.svelte';

afterEach(cleanup);

const definition = GLOSSARY.hold.fr.definition;

describe('Term', () => {
	it('underlines only the first occurrence of a term on a screen', () => {
		render(TwoTerms, { props: { id: 'hold' } });
		expect(screen.getByText('premier').closest('.term')?.classList.contains('term-first')).toBe(
			true
		);
		expect(screen.getByText('second').closest('.term')?.classList.contains('term-first')).toBe(
			false
		);
	});

	it('opens its definition on hover, on keyboard focus and on touch', async () => {
		render(TwoTerms, { props: { id: 'hold' } });
		const word = screen.getByText('premier');
		await fireEvent.mouseEnter(word);
		expect(screen.getByRole('tooltip').textContent).toBe(definition);
		await fireEvent.mouseLeave(word);
		expect(screen.queryByRole('tooltip')).toBeNull();
		await fireEvent.focus(word);
		expect(screen.getByRole('tooltip').textContent).toBe(definition);
		await fireEvent.blur(word);
		await fireEvent.click(word);
		expect(screen.getByRole('tooltip').textContent).toBe(definition);
	});

	it('never opens while inactive (during play)', async () => {
		render(TwoTerms, { props: { id: 'hold', inactive: true } });
		const word = screen.getByText('premier');
		await fireEvent.mouseEnter(word);
		await fireEvent.click(word);
		expect(screen.queryByRole('tooltip')).toBeNull();
	});
});
