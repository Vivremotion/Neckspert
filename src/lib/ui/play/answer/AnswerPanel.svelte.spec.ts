import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import AnswerPanel from './AnswerPanel.svelte';
import type { PlaySessionController, PlayView } from '$lib/application/session/contract';
import { identifyChoices } from './choices';

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

const keys = () => within(screen.getByRole('group', { name: 'Nom de la note' }));

/** A mode 2 controller on PlayScreen's fields: one answer per prompt, `next` opens the next one. */
function panelController() {
	const view: PlayView = $state({
		status: 'idle',
		prompt: null,
		lastVerdict: null,
		tempoBpm: 80,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		followUp: null,
		chordDiagram: 'strings',
		contest: null,
		leadBeats: null,
		history: [],
		answerChoices: identifyChoices(),
		fatigueDetected: false,
		scene: 'screen',
		countdown: null,
		preview: null,
		audioError: null
	});
	return {
		sessionId: 'panel',
		view,
		timeline: { nowBeat: () => 0 },
		start: async () => {
			view.status = 'awaiting';
		},
		next: () => {
			view.status = 'awaiting';
		},
		pause: () => {},
		resume: () => {},
		answer(_value: string) {
			if (view.status === 'awaiting') view.status = 'verdict';
		},
		contest: () => {},
		quit: () => {}
	} satisfies PlaySessionController & { next(): void };
}

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
		const demo = panelController();
		render(AnswerPanel, { props: { controller: demo } });
		expect(keys().getAllByRole('button').every(isDisabled)).toBe(true);

		await demo.start();
		await tick();
		expect(keys().getAllByRole('button')).toHaveLength(12);
		expect(keys().getAllByRole('button').some(isDisabled)).toBe(false);
	});

	it('sends a double tap to the controller once', async () => {
		const demo = panelController();
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
		expect(keys().getAllByRole('button').every(isDisabled)).toBe(true);
	});

	it('re-enables the keyboard for the next prompt', async () => {
		const demo = panelController();
		const answer = vi.spyOn(demo, 'answer');
		render(AnswerPanel, { props: { controller: demo } });
		await demo.start();
		await tick();
		await fireEvent.click(keys().getByRole('button', { name: 'F' }));
		expect(keys().getAllByRole('button').every(isDisabled)).toBe(true);

		demo.next();
		await tick();
		expect(keys().getAllByRole('button').some(isDisabled)).toBe(false);
		await fireEvent.click(keys().getByRole('button', { name: 'F# / Gb' }));
		expect(answer).toHaveBeenLastCalledWith('F#');
	});
});
