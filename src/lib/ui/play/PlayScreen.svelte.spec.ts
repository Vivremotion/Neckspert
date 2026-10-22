import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlayView, ShapeView, VerdictView } from '$lib/application/session/contract';
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
		const { container } = render(PlayScreen, { props: { controller: demo } });
		expect(screen.getAllByText('F').length).toBeGreaterThan(0);
		expect(screen.getByText(/corde de B/i)).toBeTruthy();
		clock.setBeat(12.25);
		demo.tick();
		await tick();
		// The played cell carries its verdict's mark, not the note's name.
		const played = container.querySelector('.lane [data-kind="history"]');
		expect(played?.querySelector('svg')).not.toBeNull();
		expect(played?.textContent).not.toContain('F');
	});

	it('shows a start control while idle', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByRole('button', { name: /commencer/i })).toBeTruthy();
	});

	it('explains the triads before they start: the root alone, then the chord', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo, kind: 'triads' } });
		expect(screen.getByText(/fondamentale seule/i)).toBeTruthy();
		expect(screen.queryByText(/la note défile/i)).toBeNull();
	});

	it('explains the zone before it starts: the whole chord around a fret', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo, kind: 'triads-zone' } });
		expect(screen.getByText(/vers la case 5/i)).toBeTruthy();
		expect(screen.queryByText(/fondamentale sur sol/i)).toBeNull();
	});

	it('explains the notes before a learn session', () => {
		const demo = new DemoPlaySession({ clock: new ManualDemoClock() });
		render(PlayScreen, { props: { controller: demo } });
		expect(screen.getByText(/la note défile/i)).toBeTruthy();
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
				followUp: null,
				chordDiagram: 'strings' as const,
				contest: null,
				leadBeats: 8 as const,
				history: [],
				answerChoices: null,
				fatigueDetected: false,
				scene: 'guitar' as const,
				countdown: null,
				preview: null,
				audioError: null
			},
			timeline: { nowBeat: () => 1 },
			start: async () => {},
			pause: () => {},
			resume: () => {},
			answer: () => {},
			contest: () => {},
			quit: () => {}
		};
		render(PlayScreen, { props: { controller } });
		expect(screen.getAllByText('G').length).toBeGreaterThan(0);
		expect(screen.getByText(/corde de G/i)).toBeTruthy();
		expect(screen.queryByText('F')).toBeNull();
	});

	function aidedController({
		scene,
		...prompt
	}: {
		scene: 'guitar' | 'screen';
		primary: string;
		secondary: string;
		aid: string | null;
		detail?: string;
		target?: string;
		band?: string;
		shape?: ShapeView;
		diagram?: { string: 1 | 2 | 3 | 4 | 5 | 6; label: string } | null;
	}) {
		const view: PlayView = {
			status: 'awaiting',
			prompt: { ...prompt, diagram: prompt.diagram ?? null },
			lastVerdict: null,
			tempoBpm: 80,
			beatsPerBar: 4,
			promptBeatIndex: scene === 'guitar' ? 0 : null,
			targetBeatIndex: scene === 'guitar' ? 8 : null,
			followUp: null,
			chordDiagram: 'strings',
			contest: null,
			leadBeats: scene === 'guitar' ? 8 : null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene,
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
			contests: 0,
			contest() {
				this.contests += 1;
			},
			quit: () => {}
		};
	}

	/** D on G-B-E, root on B. */
	const D_232: ShapeView = {
		notes: [
			{ string: 3, fret: 2 },
			{ string: 2, fret: 3 },
			{ string: 1, fret: 2 }
		]
	};
	const D_775: ShapeView = {
		notes: [
			{ string: 3, fret: 7 },
			{ string: 2, fret: 7 },
			{ string: 1, fret: 5 }
		]
	};

	function triadMiss(
		verdict: Partial<VerdictView>,
		contest: PlayView['contest'] = null
	): ReturnType<typeof aidedController> {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'D',
			secondary: 'fondamentale sur si',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'verdict',
			contest,
			lastVerdict: {
				verdict: 'wrong',
				offsetMs: null,
				reactionMs: null,
				answerLabel: null,
				correction: null,
				...verdict
			}
		};
		return controller;
	}

	it('draws the aid of a triad under its prompt, in the style of the exercise', () => {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'D',
			secondary: 'fondamentale sur si',
			aid: null,
			shape: D_232
		});
		controller.view = { ...controller.view, chordDiagram: 'grid' };
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.centre .chord-shape')?.getAttribute('data-style')).toBe(
			'grid'
		);
		expect(container.querySelector('.aid')).toBeNull();
	});

	it('draws heard and expected shapes in place of the prompt after a triad miss', () => {
		const { container } = render(PlayScreen, {
			props: {
				controller: triadMiss({
					heard: D_775,
					expected: D_232,
					gap: 'autre renversement',
					correction: '2‑3‑2 · A D F#'
				})
			}
		});
		// The drawing says it: no correction in text as well.
		expect(container.querySelector('.correction')).toBeNull();
		const drawn = container.querySelector('.drawn');
		expect([...drawn!.querySelectorAll('.drawn-label')].map((l) => l.textContent)).toEqual([
			'Joué',
			'Attendu'
		]);
		expect(drawn!.querySelectorAll('.chord-shape')).toHaveLength(2);
		expect(container.querySelector('.gap')?.textContent).toBe('autre renversement');
		// In place of the prompt: the prompt recalled above, no big letter of it.
		expect(screen.getByText('D · fondamentale sur si')).toBeTruthy();
		expect(container.querySelector('.centre [data-size="hero"]')).toBeNull();
	});

	it('writes the gap in place of the shape played when nothing was recognized', () => {
		const { container } = render(PlayScreen, {
			props: { controller: triadMiss({ heard: null, expected: D_232, gap: 'rien de reconnu' }) }
		});
		expect(container.querySelectorAll('.drawn .chord-shape')).toHaveLength(1);
		expect(container.querySelector('.drawn .heard-none')?.textContent).toBe('rien de reconnu');
		expect(container.querySelector('.gap')).toBeNull();
	});

	it('offers « Joué juste » after a contestable miss, by click or by Enter', async () => {
		const controller = triadMiss({ heard: D_775, expected: D_232, gap: 'g' }, 'available');
		render(PlayScreen, { props: { controller } });
		const button = screen.getByRole('button', { name: 'Joué juste' });
		await fireEvent.click(button);
		expect(controller.contests).toBe(1);
		await fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' });
		expect(controller.contests).toBe(2);
		await fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
		expect(controller.contests).toBe(2);
	});

	it('says a contested miss is contested, without a button', () => {
		render(PlayScreen, { props: { controller: triadMiss({}, 'done') } });
		expect(screen.queryByRole('button', { name: 'Joué juste' })).toBeNull();
		expect(screen.getByText('Contesté')).toBeTruthy();
	});

	it('draws nothing more after a locate miss', () => {
		const controller = triadMiss({ correction: 'corde de E grave, case 5' });
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.drawn')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Joué juste' })).toBeNull();
	});

	it('shows the position of an aided locate prompt', () => {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'G',
			secondary: 'corde de E grave',
			aid: 'case 3'
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.aid')?.textContent).toBe('case 3');
	});

	it('shows the note name of an aided identify prompt', () => {
		const controller = aidedController({
			scene: 'screen',
			primary: 'case 8',
			secondary: 'corde de A',
			aid: 'F'
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.aid')?.textContent).toBe('F');
	});

	it('shows a triad prompt: its chord drawn whole, its strings in small', () => {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'Em',
			secondary: 'fondamentale sur mi',
			detail: 'sol‑si‑mi',
			aid: null
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.centre [data-size="hero"] .main')?.textContent).toBe('Em');
		expect(screen.getByText('fondamentale sur mi')).toBeTruthy();
		expect(container.querySelector('.detail')?.textContent).toBe('sol‑si‑mi');
	});

	it('lays the band of the chord after the root tile of a triad anchor', () => {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'Cm',
			secondary: 'fondamentale sur sol',
			target: 'C',
			band: 'Cm',
			aid: null
		});
		controller.view = { ...controller.view, followUp: { fromBeat: 9, untilBeat: 12 } };
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.lane [data-kind="target"]')?.textContent?.trim()).toBe('C');
		const band = [...container.querySelectorAll('.lane [data-kind="band"]')];
		expect(band).toHaveLength(3);
		expect(band.map((tile) => tile.textContent?.trim())).toEqual(['Cm', '', '']);
	});

	it('draws no band without a second gesture', () => {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'G',
			secondary: 'corde de E grave',
			aid: null
		});
		const { container } = render(PlayScreen, { props: { controller } });
		expect(container.querySelector('.lane [data-kind="target"]')?.textContent?.trim()).toBe('G');
		expect(container.querySelectorAll('.lane [data-kind="band"]')).toHaveLength(0);
	});

	it('counts down in place of the prompt during a counted bar', () => {
		const controller = aidedController({
			scene: 'guitar',
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
		expect(screen.queryByText('corde de E grave')).toBeNull();
	});

	it('sets the answer keyboard on stage while counting down to a screen prompt', () => {
		const controller = aidedController({
			scene: 'screen',
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
		expect(screen.getByRole('group', { name: 'Nom de la note' })).toBeTruthy();
		expect(container.querySelector('.lane')).toBeNull();
		expect(container.querySelector('.countdown')?.textContent).toContain('4');
	});

	it('shows the string alone, drawn, a beat before the note', () => {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'count-in',
			prompt: null,
			preview: {
				primary: 'A',
				secondary: 'corde de E grave',
				aid: null,
				diagram: { string: 6, label: 'E' }
			}
		};
		const { container } = render(PlayScreen, { props: { controller } });
		expect(screen.getByText('corde de E grave')).toBeTruthy();
		expect(screen.queryByText('A')).toBeNull();
		expect(container.querySelector('.centre [data-size="hero"]')).toBeNull();
		expect(container.querySelector('.diagram')?.getAttribute('data-string')).toBe('6');
	});

	it('draws the string under a learning prompt only when it carries the aid', () => {
		const drawn = aidedController({
			scene: 'guitar',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null,
			diagram: { string: 6, label: 'E' }
		});
		const { container } = render(PlayScreen, { props: { controller: drawn } });
		expect(container.querySelector('.diagram')).not.toBeNull();
		cleanup();
		const plain = aidedController({
			scene: 'guitar',
			primary: 'A',
			secondary: 'corde de E grave',
			aid: null
		});
		const again = render(PlayScreen, { props: { controller: plain } });
		expect(again.container.querySelector('.diagram')).toBeNull();
	});

	function verdictController(
		verdict: Partial<VerdictView>,
		history: PlayView['history'] = [{ beatIndex: 8, verdict: verdict.verdict ?? 'wrong' }]
	) {
		const controller = aidedController({
			scene: 'guitar',
			primary: 'F',
			secondary: 'corde de B',
			aid: null
		});
		controller.view = {
			...controller.view,
			status: 'verdict',
			promptBeatIndex: 0,
			targetBeatIndex: 8,
			history,
			lastVerdict: {
				verdict: 'wrong',
				offsetMs: null,
				reactionMs: null,
				answerLabel: null,
				correction: null,
				...verdict
			}
		};
		controller.timeline = { nowBeat: () => 8.5 };
		return controller;
	}

	function playedCell(container: HTMLElement): string {
		return container.querySelector('.lane [data-kind="history"]')?.textContent?.trim() ?? '';
	}

	it('shows the info line: session, tempo, quit', () => {
		const controller = verdictController({});
		controller.view = { ...controller.view, status: 'awaiting', lastVerdict: null, tempoBpm: 100 };
		const { container } = render(PlayScreen, { props: { controller, kind: 'learn' } });
		expect(container.querySelector('.info-parts')?.textContent).toBe('Apprentissage · ♩ = 100');
		expect(screen.getByRole('link', { name: /quitter/i })).toBeTruthy();
	});

	it('writes the verdict under the played cell', () => {
		const { container } = render(PlayScreen, {
			props: { controller: verdictController({ verdict: 'late', offsetMs: 42, answerLabel: 'F' }) }
		});
		expect(playedCell(container)).toContain('en retard · +42 ms');
	});

	it('writes what was played after a wrong note', () => {
		const { container } = render(PlayScreen, {
			props: { controller: verdictController({ verdict: 'wrong', answerLabel: 'F#' }) }
		});
		expect(playedCell(container)).toContain('F# joué');
	});

	it('says nothing was heard after a silent miss', () => {
		const { container } = render(PlayScreen, {
			props: { controller: verdictController({ verdict: 'wrong', answerLabel: null }) }
		});
		expect(playedCell(container)).toContain('rien entendu');
	});

	it('names a corrected attempt under its cell', () => {
		const { container } = render(PlayScreen, {
			props: { controller: verdictController({ verdict: 'corrected' }) }
		});
		expect(playedCell(container)).toContain('corrigé');
	});

	it('puts the correction in place of the prompt', () => {
		const { container } = render(PlayScreen, {
			props: {
				controller: verdictController({ verdict: 'wrong', correction: 'corde de B, case 6' })
			}
		});
		const centre = container.querySelector('.centre')!;
		expect(centre.querySelector('.recall')?.textContent).toBe('F · corde de B');
		expect(centre.querySelector('.main')?.textContent).toBe('corde de B, case 6');
		expect(centre.querySelector('[data-size="hero"]')).toBeNull();
		expect([...centre.querySelectorAll('p')].some((p) => p.textContent === 'F')).toBe(false);
	});

	it('keeps the centre quiet after a hit', () => {
		const { container } = render(PlayScreen, {
			props: { controller: verdictController({ verdict: 'late', offsetMs: 42, answerLabel: 'F' }) }
		});
		expect(container.querySelector('.centre')?.textContent?.trim()).toBe('');
	});

	it('shows no reaction time', () => {
		const { container } = render(PlayScreen, {
			props: {
				controller: verdictController({
					verdict: 'late',
					offsetMs: 42,
					reactionMs: 1210,
					answerLabel: 'F'
				})
			}
		});
		expect(container.textContent).not.toMatch(/1[,.]21/);
	});

	it('shows no aid on an unaided prompt', () => {
		const controller = aidedController({
			scene: 'guitar',
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
				followUp: null,
				chordDiagram: 'strings' as const,
				contest: null,
				leadBeats: 8 as const,
				history: [],
				answerChoices: null,
				fatigueDetected: false,
				scene: 'guitar' as const,
				countdown: null,
				preview: null,
				audioError: null
			},
			timeline: { nowBeat: () => 1 },
			start: async () => {},
			pause: () => {},
			resume: () => {},
			answer: () => {},
			contest: () => {},
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
