import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import type { PlaySessionController } from '$lib/application/session/contract';
import { stageModel } from '$lib/ui/play/views/testing/promptStage';
import SessionHarness from './SessionHarness.svelte';

const nav = vi.hoisted(() => ({ search: '', goto: vi.fn(async () => {}) }));

vi.mock('$app/navigation', () => ({ goto: nav.goto }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL(`http://localhost/session${nav.search}`);
		}
	}
}));

/** A controller that never plays: the page only needs to start it and read its view. */
function idleController(): PlaySessionController {
	return {
		sessionId: 's1',
		view: { status: 'idle', stage: null, briefing: null, history: [], beatsPerBar: 4 },
		timeline: { nowBeat: () => 0 },
		start: async () => {},
		pause: () => {},
		resume: () => {},
		quit: () => {},
		ready: async () => {}
	} as unknown as PlaySessionController;
}

describe('/session page, an exercise alone', () => {
	beforeEach(() => {
		nav.goto.mockClear();
	});
	afterEach(() => {
		cleanup();
	});

	it.each([['rhythm-offbeats'], ['locate-note-string']])(
		'starts the exercise the query names, in the play frame (%s)',
		async (id) => {
			nav.search = `?exercise=${id}`;
			const startExercise = vi.fn(async () => idleController());
			const startRoutine = vi.fn();
			const services = createFakeAppServices({ startExercise, startRoutine });
			render(SessionHarness, { props: { services } });
			await waitFor(() => expect(startExercise).toHaveBeenCalledWith(id));
			expect(startRoutine).not.toHaveBeenCalled();
			await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
			expect(nav.goto).not.toHaveBeenCalled();
		}
	);
});

describe('/session page, an address that leads nowhere', () => {
	beforeEach(() => {
		nav.goto.mockClear();
	});
	afterEach(() => {
		cleanup();
	});

	it.each([
		[''],
		['?exercise=nope'],
		['?routine=kazoo'],
		['?routine=kazoo&free=1'],
		['?kind=learn'],
		['?kind=free'],
		['?kind=exercise']
	])('says the session is not found, links home and starts nothing (%s)', async (search) => {
		nav.search = search;
		const startExercise = vi.fn(async () => idleController());
		const startRoutine = vi.fn(async () => idleController());
		const services = createFakeAppServices({ startExercise, startRoutine });
		render(SessionHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Séance introuvable')).toBeTruthy());
		const home = screen.getByRole('link', { name: 'Retour à l’accueil' });
		expect(home.getAttribute('href')).toBe('/');
		expect(startExercise).not.toHaveBeenCalled();
		expect(startRoutine).not.toHaveBeenCalled();
		expect(nav.goto).not.toHaveBeenCalled();
	});
});

describe('/session page, when the session cannot start', () => {
	afterEach(() => {
		cleanup();
	});

	it('says why and links back home, the nav bar being hidden', async () => {
		nav.search = '?routine=notes';
		const startRoutine = vi.fn(async () => {
			throw new Error('Pas d’entrée audio');
		});
		const services = createFakeAppServices({ startRoutine });
		render(SessionHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Pas d’entrée audio')).toBeTruthy());
		const home = screen.getByRole('link', { name: 'Retour à l’accueil' });
		expect(home.getAttribute('href')).toBe('/');
	});
});

describe('/session page, a routine', () => {
	afterEach(() => {
		cleanup();
	});

	it.each([
		['?routine=notes', 'notes', false],
		['?routine=notes&free=1', 'notes', true],
		['?routine=chords', 'chords', false],
		['?routine=chords-zone', 'chords-zone', false]
	] as const)(
		'shows the session of %s in the play frame, its instruction made ready',
		async (search, id, free) => {
			nav.search = search;
			// As the real controller does, `ready` puts its first exercise's view on stage: the frame
			// takes its world from it, whatever the session plays.
			const idle = idleController();
			const view = $state(idle.view);
			const ready = vi.fn(async () => {
				view.stage = { view: 'lane', model: stageModel() };
			});
			const startRoutine = vi.fn(async () => ({ ...idle, view, ready }));
			const services = createFakeAppServices({ startRoutine });
			const { container } = render(SessionHarness, { props: { services } });
			await waitFor(() => expect(startRoutine).toHaveBeenCalledWith(id, { free }));
			await waitFor(() => expect(container.querySelector('[data-world="quiet"]')).toBeTruthy());
			expect(ready).toHaveBeenCalled();
		}
	);

	it('renders no frame, no pixel chrome, until ready() has put the first view on stage', async () => {
		nav.search = '?routine=notes';
		let finish: () => void = () => {};
		const idle = idleController();
		const view = $state(idle.view);
		const ready = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = () => {
						view.stage = { view: 'lane', model: stageModel() };
						resolve();
					};
				})
		);
		const startRoutine = vi.fn(async () => ({ ...idle, view, ready }));
		const services = createFakeAppServices({ startRoutine });
		const { container } = render(SessionHarness, { props: { services } });
		await waitFor(() => expect(ready).toHaveBeenCalled());
		expect(container.querySelector('[data-world]')).toBeNull();
		finish();
		await waitFor(() => expect(container.querySelector('[data-world="quiet"]')).toBeTruthy());
		expect(container.querySelector('[data-world="pixel"]')).toBeNull();
	});
});
