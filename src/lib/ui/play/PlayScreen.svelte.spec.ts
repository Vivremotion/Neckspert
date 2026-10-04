import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayView } from '$lib/application/session/contract';
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

	it('says no audio input opened, in place of the how-to, with the start button', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		demo.view.audioError = 'input';
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByRole('alert').textContent).toMatch(/aucune entrée audio/i);
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
					aid: null,
					diagram: null
				},
				lastVerdict: null,
				tempoBpm: 80,
				beatsPerBar: 4 as const,
				promptBeatIndex: 0,
				targetBeatIndex: 8,
				leadBeats: 8 as const,
				history: [],
				answerChoices: null,
				fatigueDetected: false,
				scene: 'locate' as const,
				countdown: null,
				preview: null,
				audioError: null
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

	function aidedController(prompt: {
		direction: 'locate' | 'identify';
		primary: string;
		secondary: string;
		aid: string | null;
		diagram?: { string: 1 | 2 | 3 | 4 | 5 | 6; label: string } | null;
	}) {
		const view: PlayView = {
			status: 'awaiting',
			prompt: { ...prompt, diagram: prompt.diagram ?? null },
			lastVerdict: null,
			tempoBpm: 80,
			beatsPerBar: 4,
			promptBeatIndex: prompt.direction === 'locate' ? 0 : null,
			targetBeatIndex: prompt.direction === 'locate' ? 8 : null,
			leadBeats: prompt.direction === 'locate' ? 8 : null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene: prompt.direction,
			countdown: null,
			preview: null,
			audioError: null
		};
		return {
			sessionId: 'aided',
			view,
			timeline: { nowBeat: () => 1 },
			start: async () => {},
			pause: () => {},
			resume: () => {},
			answer: () => {},
			quit: () => {}
		};
	}

	it('shows the position of an aided locate prompt', () => {
		const controller = aidedController({
			direction: 'locate',
			primary: 'G',
			secondary: 'corde de E grave',
			aid: 'case 3'
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.aid')?.textContent).toBe('case 3');
	});

	it('shows the note name of an aided identify prompt', () => {
		const controller = aidedController({
			direction: 'identify',
			primary: 'case 8',
			secondary: 'corde de A',
			aid: 'F'
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.aid')?.textContent).toBe('F');
	});

	it('counts down in place of the prompt during a counted bar', () => {
		const controller = aidedController({
			direction: 'locate',
			primary: 'G',
			secondary: 'corde de E grave',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'count-in',
			prompt: null,
			countdown: 3
		};
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.countdown')?.textContent).toContain('3');
		expect(container.querySelector('.string')).toBeNull();
	});

	it('sets the answer pad on stage while counting down to a screen prompt', () => {
		const controller = aidedController({
			direction: 'identify',
			primary: 'case 8',
			secondary: 'corde de A',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'count-in',
			prompt: null,
			countdown: 4
		};
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.lane-slot.answering')).not.toBeNull();
		expect(container.querySelector('.countdown')?.textContent).toContain('4');
	});

	it('shows the string alone, drawn, a beat before the note', () => {
		const controller = aidedController({
			direction: 'locate',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'count-in',
			prompt: null,
			preview: {
				direction: 'locate',
				primary: 'A',
				secondary: 'corde de E grave',
				aid: null,
				diagram: { string: 6, label: 'E' }
			}
		};
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.string')?.textContent).toBe('corde de E grave');
		expect(container.querySelector('.prompt svg, .prompt .primary')).toBeNull();
		expect(container.querySelector('.diagram')?.getAttribute('data-string')).toBe('6');
	});

	it('draws the string under a learning prompt only when it carries the aid', () => {
		const drawn = aidedController({
			direction: 'locate',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null,
			diagram: { string: 6, label: 'E' }
		});
		const { container } = render(PlayScreen, { props: { controller: drawn } });
		expect(container.querySelector('.diagram')).not.toBeNull();
		cleanup();
		const plain = aidedController({
			direction: 'locate',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null
		});
		const again = render(PlayScreen, { props: { controller: plain } });
		expect(again.container.querySelector('.diagram')).toBeNull();
	});

	it('shows the right position with the verdict after a miss', () => {
		const controller = aidedController({
			direction: 'locate',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'verdict',
			lastVerdict: {
				verdict: 'wrong',
				offsetMs: null,
				reactionMs: null,
				answerLabel: null,
				correction: 'corde de E grave, case 5'
			}
		};
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.correction')?.textContent).toBe('corde de E grave, case 5');
	});

	it('shows no aid on an unaided prompt', () => {
		const controller = aidedController({
			direction: 'locate',
			primary: 'G',
			secondary: 'corde de E grave',
			aid: null
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.aid')).toBeNull();
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
					aid: null,
					diagram: null
				},
				lastVerdict: null,
				tempoBpm: 80,
				beatsPerBar: 4 as const,
				promptBeatIndex: 0,
				targetBeatIndex: 8,
				leadBeats: 8 as const,
				history: [],
				answerChoices: null,
				fatigueDetected: false,
				scene: 'locate' as const,
				countdown: null,
				preview: null,
				audioError: null
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
