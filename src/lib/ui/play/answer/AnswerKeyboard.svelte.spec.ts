import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { AnswerChoice } from '$lib/application/session/contract';
import { i18n } from '$lib/i18n/index.svelte';
import AnswerKeyboard from './AnswerKeyboard.svelte';
import { identifyChoices } from './choices';

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

function renderKeyboard(disabled: boolean, choices: AnswerChoice[] = identifyChoices()) {
	const onanswer = vi.fn<(value: string) => void>();
	const result = render(AnswerKeyboard, { props: { choices, disabled, onanswer } });
	const keys = () => within(screen.getByRole('group', { name: 'Nom de la note' }));
	const setDisabled = (value: boolean) => result.rerender({ choices, disabled: value, onanswer });
	return { onanswer, keys, setDisabled };
}

describe('AnswerKeyboard', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it("writes each key's name", () => {
		const { keys } = renderKeyboard(false);
		expect(keys().getByRole('button', { name: 'C' }).textContent?.trim()).toBe('C');
		const black = keys().getByRole('button', { name: 'F# / Gb' });
		expect(black.textContent).toContain('F#');
		expect(black.textContent).toContain('Gb');
	});

	it('sends the pitch of the key pressed', async () => {
		const { onanswer, keys } = renderKeyboard(false);
		await fireEvent.click(keys().getByRole('button', { name: 'F# / Gb' }));
		expect(onanswer).toHaveBeenCalledWith('F#');
	});

	it('takes only the first press, and keeps it marked until the next prompt', async () => {
		const { onanswer, keys, setDisabled } = renderKeyboard(false);
		void fireEvent.click(keys().getByRole('button', { name: 'F' }));
		void fireEvent.click(keys().getByRole('button', { name: 'G' }));
		await tick();
		expect(onanswer).toHaveBeenCalledTimes(1);
		expect(onanswer).toHaveBeenCalledWith('F');
		expect(keys().getByRole('button', { name: 'F' }).classList.contains('picked')).toBe(true);

		await setDisabled(true);
		expect(keys().getByRole('button', { name: 'F' }).classList.contains('picked')).toBe(true);
		await setDisabled(false);
		expect(keys().getByRole('button', { name: 'F' }).classList.contains('picked')).toBe(false);
		await fireEvent.click(keys().getByRole('button', { name: 'A' }));
		expect(onanswer.mock.calls).toEqual([['F'], ['A']]);
	});

	it('ignores presses while disabled', async () => {
		const { onanswer, keys } = renderKeyboard(true);
		await fireEvent.click(keys().getByRole('button', { name: 'C' }));
		expect(onanswer).not.toHaveBeenCalled();
		expect(keys().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('is a group of buttons named for the screen reader', () => {
		i18n.locale = 'en';
		render(AnswerKeyboard, {
			props: { choices: identifyChoices(), disabled: false, onanswer: vi.fn() }
		});
		const group = within(screen.getByRole('group', { name: 'Note name' }));
		expect(group.getAllByRole('button')).toHaveLength(12);
	});
});
