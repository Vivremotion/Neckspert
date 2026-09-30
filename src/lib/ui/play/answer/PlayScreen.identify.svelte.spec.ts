import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type {
	PlaySessionController,
	PlayView,
	VerdictView
} from '$lib/application/session/contract';
import type { PitchName } from '$lib/domain/music/types';
import PlayScreen from '../PlayScreen.svelte';
import { identifyChoices } from './choices';

function view(overrides: Partial<PlayView>): PlayView {
	return {
		status: 'awaiting',
		prompt: null,
		lastVerdict: null,
		tempoBpm: 80,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		leadBeats: null,
		history: [],
		answerChoices: null,
		fatigueDetected: false,
		...overrides
	};
}

function identifyView(overrides: Partial<PlayView> = {}): PlayView {
	return view({
		prompt: { direction: 'identify', primary: 'case 8', secondary: 'corde de A', aid: null },
		answerChoices: identifyChoices(),
		...overrides
	});
}

function locateView(): PlayView {
	return view({
		prompt: { direction: 'locate', primary: 'F', secondary: 'corde de B', aid: null },
		promptBeatIndex: 0,
		targetBeatIndex: 8,
		leadBeats: 8
	});
}

function fakeController(initial: PlayView) {
	const calls = { answers: [] as PitchName[], pauses: 0 };
	const controller: PlaySessionController = {
		sessionId: 'test',
		view: initial,
		timeline: { nowBeat: () => 0 },
		async start() {},
		pause() {
			calls.pauses += 1;
		},
		resume() {},
		answer(pitch) {
			calls.answers.push(pitch);
		},
		quit() {}
	};
	return { controller, calls };
}

function isDisabled(element: HTMLElement): boolean {
	return (
		(element as HTMLButtonElement).disabled === true ||
		element.getAttribute('aria-disabled') === 'true'
	);
}

const PAD = { name: 'Nom de la note' };

describe('PlayScreen in mode 2', () => {
	afterEach(() => cleanup());

	it('replaces the lane with the answer pad for an identify prompt', async () => {
		const { controller, calls } = fakeController(identifyView());
		render(PlayScreen, { props: { controller } });
		const pad = within(screen.getByRole('group', PAD));
		expect(pad.getAllByRole('button')).toHaveLength(12);
		await fireEvent.click(pad.getByRole('button', { name: 'F' }));
		expect(calls.answers).toEqual(['F']);
	});

	it('shows no answer pad for a locate prompt', () => {
		const { controller } = fakeController(locateView());
		render(PlayScreen, { props: { controller } });
		expect(screen.queryByRole('group', PAD)).toBeNull();
	});

	it('disables the pad outside awaiting', () => {
		const { controller } = fakeController(identifyView({ status: 'verdict' }));
		render(PlayScreen, { props: { controller } });
		const buttons = within(screen.getByRole('group', PAD)).getAllByRole('button');
		expect(buttons.every(isDisabled)).toBe(true);
	});

	it('shows a late verdict for a correct but slow answer, without a timing offset', () => {
		const late: VerdictView = {
			verdict: 'late',
			offsetMs: null,
			reactionMs: 2140,
			answerLabel: 'F'
		};
		const { controller } = fakeController(identifyView({ status: 'verdict', lastVerdict: late }));
		render(PlayScreen, { props: { controller } });
		expect(screen.getAllByText(/en retard/i).length).toBeGreaterThan(0);
		expect(screen.queryAllByText(/^[+\-−]\d+\s*ms$/)).toHaveLength(0);
	});

	it('does not pause when Space activates an answer button', async () => {
		const { controller, calls } = fakeController(identifyView());
		render(PlayScreen, { props: { controller } });
		const button = within(screen.getByRole('group', PAD)).getByRole('button', { name: 'C' });
		button.focus();
		await fireEvent.keyDown(button, { key: ' ', code: 'Space' });
		expect(calls.pauses).toBe(0);
	});
});
