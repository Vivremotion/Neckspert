import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import AnswerPanel from './AnswerPanel.svelte';
import { DEMO_VERDICT_MS, DemoIdentifySession } from './DemoIdentifySession.svelte';

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

const keys = () => within(screen.getByRole('group', { name: 'Nom de la note' }));

describe('AnswerPanel', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it('keeps the keyboard disabled until a prompt is awaiting', async () => {
		const demo = new DemoIdentifySession();
		render(AnswerPanel, { props: { controller: demo } });
		expect(keys().getAllByRole('button').every(isDisabled)).toBe(true);

		await demo.start();
		await tick();
		expect(keys().getAllByRole('button')).toHaveLength(12);
		expect(keys().getAllByRole('button').some(isDisabled)).toBe(false);
	});

	it('sends a double tap to the controller once', async () => {
		const demo = new DemoIdentifySession();
		const answer = vi.spyOn(demo, 'answer');
		render(AnswerPanel, { props: { controller: demo } });
		await demo.start();
		await tick();

		vi.advanceTimersByTime(600);
		void fireEvent.click(keys().getByRole('button', { name: 'F' }));
		void fireEvent.click(keys().getByRole('button', { name: 'G' }));
		await tick();

		expect(answer).toHaveBeenCalledTimes(1);
		expect(answer).toHaveBeenCalledWith('F');
		expect(demo.view.lastVerdict?.verdict).toBe('perfect');
		expect(keys().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('re-enables the keyboard for the next prompt and reports a slow answer late', async () => {
		const demo = new DemoIdentifySession();
		render(AnswerPanel, { props: { controller: demo } });
		await demo.start();
		await tick();
		await fireEvent.click(keys().getByRole('button', { name: 'F' }));

		vi.advanceTimersByTime(DEMO_VERDICT_MS);
		await tick();
		expect(keys().getAllByRole('button').some(isDisabled)).toBe(false);

		vi.advanceTimersByTime(3100);
		await fireEvent.click(keys().getByRole('button', { name: 'F# / Gb' }));
		expect(demo.view.lastVerdict?.verdict).toBe('late');
	});
});
