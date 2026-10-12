import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PlayFrame from './PlayFrame.svelte';
import { PLAY_VIEWS } from './views';
import FakeView from './views/testing/FakeView.svelte';
import { StageController } from './views/testing/StageController.svelte';

afterEach(() => cleanup());

describe('PlayFrame', () => {
	it('explains the gesture track and starts it', async () => {
		const controller = new StageController();
		render(PlayFrame, { props: { controller } });
		expect(screen.getByText(/attaque chaque accord/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /commencer/i }));
		expect(controller.calls).toEqual(['start']);
	});

	it('shows the view its exercise names, from the registry', () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		controller.view.stage = { view: 'fake-view', model: { chord: 'Dm7' } };
		render(PlayFrame, { props: { controller, views: { ...PLAY_VIEWS, 'fake-view': FakeView } } });
		expect(screen.getByTestId('fake-view').textContent).toBe('{"chord":"Dm7"}');
	});

	it('pauses and resumes with Space, and with its buttons', async () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		render(PlayFrame, { props: { controller } });
		await fireEvent.keyDown(window, { code: 'Space', key: ' ' });
		expect(controller.view.status).toBe('paused');
		await fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
		expect(controller.view.status).toBe('count-in');
		await fireEvent.click(screen.getByRole('button', { name: /pause/i }));
		await fireEvent.keyDown(window, { code: 'Space', key: ' ' });
		expect(controller.calls).toEqual(['pause', 'resume', 'pause', 'resume']);
	});

	it('counts the bar down, then shows the verdict and offers « Joué juste » on Enter', async () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		controller.view.countdown = 3;
		render(PlayFrame, { props: { controller } });
		expect(document.querySelector('.countdown')).toBeTruthy();
		controller.view.status = 'verdict';
		controller.view.countdown = null;
		controller.view.lastVerdict = {
			verdict: 'wrong',
			offsetMs: null,
			reactionMs: null,
			answerLabel: null,
			correction: null,
			heard: null,
			expected: {
				notes: [
					{ string: 3, fret: 7 },
					{ string: 2, fret: 7 },
					{ string: 1, fret: 5 }
				]
			},
			gap: 'pas plus haut'
		};
		controller.view.contest = 'available';
		await fireEvent.keyDown(window, { key: 'Enter' });
		expect(controller.calls).toEqual(['contest']);
		expect(screen.getByText('Mauvaise note')).toBeTruthy();
		expect(screen.getByText('pas plus haut')).toBeTruthy();
		expect(screen.getByText('Contesté')).toBeTruthy();
	});

	it('says when no audio input opens, and when fatigue is detected', () => {
		const controller = new StageController();
		controller.view.audioError = 'input';
		render(PlayFrame, { props: { controller } });
		expect(screen.getByRole('alert').textContent).toMatch(/aucune entrée audio/i);
		cleanup();
		const tired = new StageController();
		tired.view.status = 'awaiting';
		tired.view.fatigueDetected = true;
		render(PlayFrame, { props: { controller: tired } });
		expect(screen.getByRole('status').textContent).toMatch(/fatigue/i);
	});

	it('writes the count as a sentence', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		controller.view.countdown = 3;
		render(PlayFrame, { props: { controller } });
		expect(document.querySelector('.counting')?.textContent?.trim()).toBe('Départ dans 3 temps');
	});

	it('keeps counting, big, until the change itself, after its round has opened', () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		controller.view.countdown = 1;
		render(PlayFrame, { props: { controller } });
		const count = document.querySelector('.countdown');
		expect(count?.getAttribute('aria-label')).toBe('1');
	});

	it('tells an exercise instruction, on the start screen and at its own stop', async () => {
		const controller = new StageController();
		controller.view.briefing = { text: 'Joue les formes.' };
		render(PlayFrame, { props: { controller } });
		expect(screen.getByText('Joue les formes.')).toBeTruthy();
		cleanup();
		const stopped = new StageController();
		stopped.view.status = 'paused';
		stopped.view.briefing = { text: 'Joue la grille.' };
		render(PlayFrame, { props: { controller: stopped } });
		expect(screen.getByText('Joue la grille.')).toBeTruthy();
		await fireEvent.keyDown(window, { code: 'Space', key: ' ' });
		expect(stopped.calls).toEqual(['resume']);
		stopped.view.status = 'paused';
		await fireEvent.click(await screen.findByRole('button', { name: /c’est parti/i }));
		expect(stopped.calls).toEqual(['resume', 'resume']);
	});
});
