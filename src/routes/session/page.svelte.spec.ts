import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import type { PlaySessionController } from '$lib/application/session/contract';
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
		view: { status: 'idle', stage: null, briefing: null },
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
