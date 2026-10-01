import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PlayScreen from './PlayScreen.svelte';
import { DemoPlaySession, ManualDemoClock } from './demo/DemoPlaySession.svelte';

afterEach(() => cleanup());

describe('PlayScreen', () => {
	it('renders the prompt and unlabeled past tiles', async () => {
		const clock = new ManualDemoClock();
		const demo = new DemoPlaySession({ clock });
		await demo.start();
		clock.setBeat(4);
		demo.tick();
		clock.setBeat(12.25);
		demo.tick();
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getAllByText('F').length).toBeGreaterThan(0);
		expect(screen.getByText(/corde de B/i)).toBeTruthy();
	});

	it('shows a start control while idle', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByRole('button', { name: /commencer/i })).toBeTruthy();
	});

	it('offers to restart once the series is finished', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		demo.quit();
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByRole('button', { name: /recommencer/i })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^commencer$/i })).toBeNull();
	});

	it('shows whichever note the prompt carries', () => {
		const controller = {
			sessionId: 'note-g',
			view: {
				status: 'awaiting' as const,
				prompt: {
					direction: 'locate' as const,
					primary: 'G',
					secondary: 'corde de G',
					aid: null
				},
				lastVerdict: null,
				tempoBpm: 80,
				beatsPerBar: 4 as const,
				promptBeatIndex: 0,
				targetBeatIndex: 8,
				leadBeats: 8 as const,
				history: [],
				answerChoices: null,
				fatigueDetected: false
			},
			timeline: { nowBeat: () => 1 },
			start: async () => {},
			pause: () => {},
			resume: () => {},
			answer: () => {},
			quit: () => {}
		};
		render(PlayScreen, { props: { controller } });
		expect(screen.getAllByText('G').length).toBeGreaterThan(0);
		expect(screen.getByText(/corde de G/i)).toBeTruthy();
		expect(screen.queryByText('F')).toBeNull();
	});

	function awaitingController() {
		let quitCalls = 0;
		const controller = {
			sessionId: 'note-g',
			view: {
				status: 'awaiting' as const,
				prompt: {
					direction: 'locate' as const,
					primary: 'G',
					secondary: 'corde de G',
					aid: null
				},
				lastVerdict: null,
				tempoBpm: 80,
				beatsPerBar: 4 as const,
				promptBeatIndex: 0,
				targetBeatIndex: 8,
				leadBeats: 8 as const,
				history: [],
				answerChoices: null,
				fatigueDetected: false
			},
			timeline: { nowBeat: () => 1 },
			start: async () => {},
			pause: () => {},
			resume: () => {},
			answer: () => {},
			quit: () => {
				quitCalls += 1;
			}
		};
		return { controller, quitCount: () => quitCalls };
	}

	function clickQuit(): { event: MouseEvent; link: HTMLElement } {
		const link = screen.getByRole('link', { name: /quitter/i });
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		link.dispatchEvent(event);
		return { event, link };
	}

	it('prevents default on quit when quitToSummary is true and the session is awaiting', () => {
		const { controller, quitCount } = awaitingController();
		render(PlayScreen, { props: { controller, quitToSummary: true } });
		const { event } = clickQuit();
		expect(quitCount()).toBe(1);
		expect(event.defaultPrevented).toBe(true);
	});

	it('lets the quit link go home when quitToSummary is false', () => {
		const { controller, quitCount } = awaitingController();
		render(PlayScreen, { props: { controller, quitToSummary: false } });
		const { event } = clickQuit();
		expect(quitCount()).toBe(1);
		expect(event.defaultPrevented).toBe(false);
	});
});
