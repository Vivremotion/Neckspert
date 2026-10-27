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

describe('/session page, kind exercise', () => {
	beforeEach(() => {
		nav.goto.mockClear();
	});
	afterEach(() => {
		cleanup();
	});

	it('starts the exercise the query names, in the play frame', async () => {
		nav.search = '?kind=exercise&exercise=rhythm-offbeats';
		const startExercise = vi.fn(async () => idleController());
		const startSession = vi.fn();
		const services = createFakeAppServices({ startExercise, startSession });
		render(SessionHarness, { props: { services } });
		await waitFor(() => expect(startExercise).toHaveBeenCalledWith('rhythm-offbeats'));
		expect(startSession).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
		expect(nav.goto).not.toHaveBeenCalled();
	});

	it.each([
		['?kind=exercise&exercise=nope'],
		['?kind=exercise'],
		['?kind=exercise&exercise=locate-neck']
	])(
		'goes back home, starting nothing, when the exercise is missing or unknown (%s)',
		async (search) => {
			nav.search = search;
			const startExercise = vi.fn(async () => idleController());
			const startSession = vi.fn();
			const services = createFakeAppServices({ startExercise, startSession });
			render(SessionHarness, { props: { services } });
			await waitFor(() => expect(nav.goto).toHaveBeenCalledWith('/', { replaceState: true }));
			expect(startExercise).not.toHaveBeenCalled();
			expect(startSession).not.toHaveBeenCalled();
		}
	);
});

describe('/session page, when the session cannot start', () => {
	afterEach(() => {
		cleanup();
	});

	it('says why and links back home, the nav bar being hidden', async () => {
		nav.search = '?kind=learn';
		const startSession = vi.fn(async () => {
			throw new Error('Pas d’entrée audio');
		});
		const services = createFakeAppServices({ startSession });
		render(SessionHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Pas d’entrée audio')).toBeTruthy());
		const home = screen.getByRole('link', { name: 'Retour à l’accueil' });
		expect(home.getAttribute('href')).toBe('/');
	});
});

describe('/session page, the notes and the triads', () => {
	afterEach(() => {
		cleanup();
	});

	it.each([['learn'], ['free'], ['triads'], ['triads-zone']])(
		'shows a %s session in the play frame, its instruction made ready',
		async (kind) => {
			nav.search = `?kind=${kind}`;
			// As the real controller does, `ready` puts its first exercise's view on stage: the frame
			// takes its world from it, whatever the kind.
			const idle = idleController();
			const view = $state(idle.view);
			const ready = vi.fn(async () => {
				view.stage = { view: 'lane', model: stageModel() };
			});
			const startSession = vi.fn(async () => ({ ...idle, view, ready }));
			const services = createFakeAppServices({ startSession });
			const { container } = render(SessionHarness, { props: { services } });
			await waitFor(() => expect(startSession).toHaveBeenCalledWith(kind));
			await waitFor(() => expect(container.querySelector('[data-world="quiet"]')).toBeTruthy());
			expect(ready).toHaveBeenCalled();
		}
	);

	it('renders no frame, no pixel chrome, until ready() has put the first view on stage', async () => {
		nav.search = '?kind=learn';
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
		const startSession = vi.fn(async () => ({ ...idle, view, ready }));
		const services = createFakeAppServices({ startSession });
		const { container } = render(SessionHarness, { props: { services } });
		await waitFor(() => expect(ready).toHaveBeenCalled());
		expect(container.querySelector('[data-world]')).toBeNull();
		finish();
		await waitFor(() => expect(container.querySelector('[data-world="quiet"]')).toBeTruthy());
		expect(container.querySelector('[data-world="pixel"]')).toBeNull();
	});
});
