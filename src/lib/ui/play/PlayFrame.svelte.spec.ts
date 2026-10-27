import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RhythmStageModel } from '$lib/application/session/plan/rhythmStage';
import { RHYTHM_OFFBEATS } from '$lib/domain/exercise/rhythmCatalog';
import PlayFrame from './PlayFrame.svelte';
import { presented, stageModel } from './views/testing/promptStage';
import { PLAY_VIEWS, VIEW_WORLDS } from './views';
import { i18n } from '$lib/i18n/index.svelte';
import FakeView from './views/testing/FakeView.svelte';
import { FigureStageController } from './views/testing/FigureStageController.svelte';
import { StageController } from './views/testing/StageController.svelte';
import { DemoPlaySession, ManualDemoClock } from './demo/DemoPlaySession.svelte';
import { DEMO_IDENTIFY_SCRIPT, DemoIdentifySession } from './answer/DemoIdentifySession.svelte';

afterEach(() => cleanup());

describe('PlayFrame', () => {
	it('explains the gesture track and starts it', async () => {
		const controller = new StageController();
		render(PlayFrame, { props: { controller } });
		expect(screen.getByText(/attaque chaque accord/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /commencer/i }));
		expect(controller.calls).toEqual(['start']);
	});

	it('explains the notes before a learn or a free session', () => {
		const controller = new StageController();
		render(PlayFrame, { props: { controller, kind: 'learn' } });
		expect(screen.getByText(/la note défile/i)).toBeTruthy();
		cleanup();
		render(PlayFrame, { props: { controller, kind: 'free' } });
		expect(screen.getByText(/la note défile/i)).toBeTruthy();
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

	it('offers « Joué juste » with its button when the view draws the miss itself', async () => {
		const controller = new StageController();
		controller.view.status = 'verdict';
		controller.view.lastVerdict = null;
		controller.view.contest = 'available';
		render(PlayFrame, { props: { controller } });
		await fireEvent.click(screen.getByRole('button', { name: /joué juste/i }));
		expect(controller.calls).toEqual(['contest']);
		controller.view.contest = 'done';
		await Promise.resolve();
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

	describe('in the world of its view', () => {
		const waiting = stageModel({
			prompt: presented({ primary: 'F', secondary: 'corde de B', preview: 'corde de B' })
		});

		it('names a world for every view of the registry, quiet for the notes', () => {
			expect(Object.keys(VIEW_WORLDS).sort()).toEqual(Object.keys(PLAY_VIEWS).sort());
			expect(VIEW_WORLDS['lane']).toBe('quiet');
			expect(VIEW_WORLDS['answer-keys']).toBe('quiet');
			expect(VIEW_WORLDS['link-lane']).toBe('pixel');
			expect(VIEW_WORLDS['grid-scroll']).toBe('pixel');
			expect(VIEW_WORLDS['rhythm-figure']).toBe('pixel');
		});

		it('frames a quiet view in the quiet world: info line, start button, countdown in the field', async () => {
			const controller = new StageController();
			controller.view.tempoBpm = 100;
			controller.view.stage = { view: 'lane', model: waiting };
			const { container } = render(PlayFrame, { props: { controller, kind: 'learn' } });
			expect(container.querySelector('[data-world="quiet"]')).toBeTruthy();
			expect(container.querySelector('.frame')).toBeNull();
			expect(container.querySelector('.btn')).toBeNull();
			const info = container.querySelector('.info-line');
			expect(info?.textContent).toContain('Apprentissage');
			expect(info?.textContent).toContain('♩ = 100');
			expect(within(info as HTMLElement).getByRole('link', { name: 'Quitter' })).toBeTruthy();
			expect(screen.getByText(/la note défile/i)).toBeTruthy();
			const start = screen.getByRole('button', { name: 'Commencer' });
			expect(start.getAttribute('data-variant')).toBe('primary');
			await fireEvent.click(start);
			expect(controller.calls).toEqual(['start']);
			controller.view.countdown = 3;
			await Promise.resolve();
			const count = container.querySelector('.lane-view .centre .countdown');
			expect(count?.textContent).toContain('3');
			expect(count?.textContent).toContain('corde de B');
			expect(container.querySelector('.btn')).toBeNull();
			expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('data-variant')).toBe(
				'quiet'
			);
		});

		it('pauses and resumes a quiet view on Space, and on its light page', async () => {
			const controller = new StageController();
			controller.view.status = 'awaiting';
			controller.view.stage = { view: 'lane', model: waiting };
			const { container } = render(PlayFrame, { props: { controller, kind: 'free' } });
			await fireEvent.keyDown(window, { code: 'Space', key: ' ' });
			expect(controller.view.status).toBe('paused');
			expect(container.querySelector('[data-world="quiet"].light')).toBeTruthy();
			await fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
			expect(controller.calls).toEqual(['pause', 'resume']);
		});

		it('tells a quiet view the end, no input, fatigue and « Joué juste » in its own world', async () => {
			const controller = new StageController();
			controller.view.stage = { view: 'lane', model: waiting };
			controller.view.audioError = 'input';
			const { container } = render(PlayFrame, { props: { controller, kind: 'learn' } });
			expect(screen.getByRole('alert').textContent).toMatch(/aucune entrée audio/i);
			controller.view.audioError = null;
			controller.view.status = 'finished';
			await Promise.resolve();
			expect(screen.getByText('Série terminée')).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Recommencer' })).toBeTruthy();
			controller.view.status = 'verdict';
			controller.view.fatigueDetected = true;
			controller.view.contest = 'available';
			await Promise.resolve();
			expect(screen.getByRole('status').textContent).toMatch(/fatigue/i);
			await fireEvent.keyDown(window, { key: 'Enter' });
			expect(controller.calls).toEqual(['contest']);
			expect(screen.getByText('Contesté')).toBeTruthy();
			expect(container.querySelector('.btn')).toBeNull();
		});

		it('keeps the pixel frame for a pixel view', () => {
			const controller = new StageController();
			controller.view.status = 'count-in';
			controller.view.countdown = 3;
			controller.view.stage = { view: 'link-lane', model: null };
			const { container } = render(PlayFrame, {
				props: { controller, kind: 'learn', views: { ...PLAY_VIEWS, 'link-lane': FakeView } }
			});
			expect(container.querySelector('.frame[data-world="pixel"]')).toBeTruthy();
			expect(container.querySelector('.info-line')).toBeNull();
			expect(container.querySelector('.btn')?.textContent?.trim()).toBe('Pause');
			expect(container.querySelector('.counting')?.textContent?.trim()).toBe('Départ dans 3 temps');
		});
	});

	describe('with a controller that plays figures', () => {
		function playing() {
			const controller = new FigureStageController();
			controller.view.status = 'awaiting';
			return controller;
		}

		it('listens to the figure on E in French, L in English', async () => {
			const controller = playing();
			render(PlayFrame, { props: { controller, kind: 'exercise' } });
			await fireEvent.keyDown(window, { key: 'e', code: 'KeyE' });
			expect(controller.calls).toEqual(['listen']);
			i18n.locale = 'en';
			try {
				await fireEvent.keyDown(window, { key: 'e', code: 'KeyE' });
				await fireEvent.keyDown(window, { key: 'l', code: 'KeyL' });
				expect(controller.calls).toEqual(['listen', 'listen']);
			} finally {
				i18n.locale = 'fr';
			}
		});

		it('replays on R, once until the replay comes back', async () => {
			const controller = playing();
			render(PlayFrame, { props: { controller, kind: 'exercise' } });
			await fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
			controller.view.status = 'paused';
			await fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
			expect(controller.calls).toEqual(['replay']);
			const busy = await screen.findByRole('button', { name: /réécoute…/i });
			expect((busy as HTMLButtonElement).disabled).toBe(true);
			controller.finishReplay();
			await screen.findByRole('button', { name: /réécouter/i });
			await fireEvent.keyDown(window, { key: 'r', code: 'KeyR' });
			expect(controller.calls).toEqual(['replay', 'replay']);
		});

		it('pauses on Space, resumes on Escape, and quits the exercise from the pause', async () => {
			const controller = playing();
			render(PlayFrame, { props: { controller, kind: 'exercise', quitToSummary: true } });
			await fireEvent.keyDown(window, { code: 'Space', key: ' ' });
			expect(controller.view.status).toBe('paused');
			await fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
			expect(controller.calls).toEqual(['pause', 'resume']);
			controller.view.status = 'paused';
			const quit = await screen.findByRole('button', { name: 'Quitter l’exercice' });
			expect(quit.textContent?.trim()).toBe('Quitter l’exercice');
			expect(quit.getAttribute('aria-keyshortcuts')).toBeNull();
			await fireEvent.click(quit);
			expect(controller.calls).toEqual(['pause', 'resume', 'quit']);
		});

		it('pauses on Space from a focused « Écouter la figure », and does not listen again', async () => {
			// jsdom has no canvas, and VexFlow measures its text on one: a fixed-size stand-in.
			vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
				() =>
					({
						font: '',
						measureText: () => ({
							width: 8,
							actualBoundingBoxLeft: 0,
							actualBoundingBoxRight: 8,
							actualBoundingBoxAscent: 8,
							actualBoundingBoxDescent: 0
						})
					}) as unknown as CanvasRenderingContext2D
			);
			try {
				const controller = playing();
				const figure = RHYTHM_OFFBEATS.figures![0].figure;
				const model: RhythmStageModel = {
					phase: 'play',
					exerciseLabel: 'Contretemps',
					level: { shown: 1, of: 4, aid: false },
					tempo: { bpm: 80, unit: '♩' },
					figure,
					next: null,
					barInCycle: 0,
					cycleBars: 1,
					muted: false,
					cursor: null,
					feedback: 'every-cycle',
					settled: [],
					announcement: null,
					listen: 'free',
					plainWords: true
				};
				controller.view.stage = { view: 'rhythm-figure', model };
				render(PlayFrame, { props: { controller, kind: 'exercise' } });
				const listen = screen.getByRole('button', { name: /écouter la figure/i });
				await fireEvent.click(listen);
				listen.focus();
				// Not prevented, the browser would press the focused button again.
				const pressed = await fireEvent.keyDown(listen, { code: 'Space', key: ' ' });
				expect(pressed).toBe(false);
				// Some browsers press a button on Space's keyup: that one is prevented too.
				expect(await fireEvent.keyUp(listen, { code: 'Space', key: ' ' })).toBe(false);
				expect(controller.calls).toEqual(['listen', 'pause']);
				// Enter on it still presses it.
				controller.view.status = 'awaiting';
				expect(await fireEvent.keyDown(listen, { key: 'Enter', code: 'Enter' })).toBe(true);
			} finally {
				vi.restoreAllMocks();
			}
		});

		it('asks for headphones when the microphone hears the click', () => {
			const controller = new FigureStageController();
			controller.view.audioError = 'bleed';
			render(PlayFrame, { props: { controller, kind: 'exercise' } });
			expect(screen.getByRole('alert').textContent).toBe(
				'Le micro entend le clic : branche un casque ou ta guitare sur une interface, puis relance.'
			);
		});

		it('still tells a first encounter its instruction when the microphone hears the click', () => {
			const controller = new FigureStageController();
			controller.view.audioError = 'bleed';
			controller.view.briefing = { text: 'Joue sur les contretemps.' };
			render(PlayFrame, { props: { controller, kind: 'exercise' } });
			expect(screen.getByRole('alert').textContent).toMatch(/entend le clic/);
			expect(screen.getByText('Joue sur les contretemps.')).toBeTruthy();
		});
	});

	it('binds no figure key, nor Escape, for a controller that offers none', async () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		render(PlayFrame, { props: { controller } });
		for (const key of ['e', 'l', 'r']) await fireEvent.keyDown(window, { key });
		await fireEvent.keyDown(window, { code: 'Space', key: ' ' });
		await fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
		expect(controller.calls).toEqual(['pause']);
		expect(screen.queryByRole('button', { name: /quitter l’exercice/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /réécouter/i })).toBeNull();
	});
});

describe('PlayFrame, the notes demonstrated', () => {
	it('draws the mode 1 demo on the note lane, in the quiet world', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		const { container } = render(PlayFrame, { props: { controller: demo, kind: 'learn' } });
		expect(container.querySelector('[data-world="quiet"] .lane-view')).not.toBeNull();
		expect(screen.getAllByText('F').length).toBeGreaterThan(0);
		expect(screen.getByText(/corde de B/i)).toBeTruthy();
	});

	it('draws the mode 2 demo on the answer keys, which answer it', async () => {
		const demo = new DemoIdentifySession(DEMO_IDENTIFY_SCRIPT, 60_000);
		await demo.start();
		const { container } = render(PlayFrame, { props: { controller: demo, kind: 'learn' } });
		expect(container.querySelector('[data-world="quiet"] .answer-keys')).not.toBeNull();
		expect(screen.getByText('case 8')).toBeTruthy();
		const keys = within(screen.getByRole('group', { name: 'Nom de la note' }));
		expect(keys.getAllByRole('button')).toHaveLength(12);
		await fireEvent.click(keys.getByRole('button', { name: 'C' }));
		expect(screen.getByText(/C joué/)).toBeTruthy();
		demo.quit();
	});
});
