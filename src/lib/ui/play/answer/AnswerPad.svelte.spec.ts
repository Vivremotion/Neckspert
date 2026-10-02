import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { AnswerChoice } from '$lib/application/session/contract';
import type { PitchName } from '$lib/domain/music/types';
import { i18n } from '$lib/i18n/index.svelte';
import AnswerPad from './AnswerPad.svelte';
import { identifyChoices } from './choices';

const LABELS = [
	'C',
	'C# / Db',
	'D',
	'D# / Eb',
	'E',
	'F',
	'F# / Gb',
	'G',
	'G# / Ab',
	'A',
	'A# / Bb',
	'B'
];

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

function renderPad(disabled: boolean, choices: AnswerChoice[] = identifyChoices()) {
	const onanswer = vi.fn<(pitch: PitchName) => void>();
	const result = render(AnswerPad, { props: { choices, disabled, onanswer } });
	const pad = () => within(screen.getByRole('group', { name: 'Nom de la note' }));
	const setDisabled = (value: boolean) => result.rerender({ choices, disabled: value, onanswer });
	return { onanswer, pad, setDisabled };
}

describe('AnswerPad', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it('renders the twelve choices from C to B, whatever the input order', () => {
		const { pad } = renderPad(false, [...identifyChoices()].reverse());
		const labels = pad()
			.getAllByRole('button')
			.map((button) => button.textContent?.trim());
		expect(labels).toEqual(LABELS);
	});

	it('answers with the first tapped pitch only', async () => {
		const { onanswer, pad } = renderPad(false);
		void fireEvent.click(pad().getByRole('button', { name: 'F' }));
		void fireEvent.click(pad().getByRole('button', { name: 'G' }));
		await tick();
		expect(onanswer).toHaveBeenCalledTimes(1);
		expect(onanswer).toHaveBeenCalledWith('F');
		expect(pad().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('keeps the tapped button marked until the pad is enabled again', async () => {
		const { onanswer, pad, setDisabled } = renderPad(false);
		const cellOf = (name: string) => pad().getByRole('button', { name }).closest('.cell');

		await fireEvent.click(pad().getByRole('button', { name: 'F# / Gb' }));
		expect(cellOf('F# / Gb')?.classList.contains('picked')).toBe(true);

		await setDisabled(true);
		expect(cellOf('F# / Gb')?.classList.contains('picked')).toBe(true);

		await setDisabled(false);
		expect(cellOf('F# / Gb')?.classList.contains('picked')).toBe(false);
		expect(pad().getAllByRole('button').some(isDisabled)).toBe(false);

		await fireEvent.click(pad().getByRole('button', { name: 'A' }));
		expect(onanswer.mock.calls).toEqual([['F#'], ['A']]);
	});

	it('ignores taps while disabled', async () => {
		const { onanswer, pad } = renderPad(true);
		await fireEvent.click(pad().getByRole('button', { name: 'C' }));
		expect(onanswer).not.toHaveBeenCalled();
		expect(pad().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('uses native focusable buttons in chromatic tab order', () => {
		const { pad } = renderPad(false);
		const buttons = pad().getAllByRole('button');
		expect(buttons.every((button) => button.tagName === 'BUTTON')).toBe(true);
		expect(buttons.every((button) => button.tabIndex === 0)).toBe(true);
		buttons[0].focus();
		expect(document.activeElement).toBe(buttons[0]);
	});

	it('names the group in the current locale', () => {
		i18n.locale = 'en';
		render(AnswerPad, {
			props: { choices: identifyChoices(), disabled: false, onanswer: vi.fn() }
		});
		expect(screen.getByRole('group', { name: 'Note name' })).toBeTruthy();
	});
});
