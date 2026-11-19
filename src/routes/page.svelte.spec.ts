import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { RoutineEntry } from '$lib/application/app';
import { i18n } from '$lib/i18n/index.svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

/** The four routines of the catalog as the service tells them, each open unless `closed`. */
function catalogRoutines(closed: readonly string[] = []): RoutineEntry[] {
	const entry = (id: string, fr: string, en: string, memory: boolean): RoutineEntry => ({
		id,
		title: { fr, en },
		open: !closed.includes(id),
		due: memory ? 0 : null,
		nextReviewAt: null,
		resting: false
	});
	return [
		entry('notes', 'Apprentissage', 'Learn', true),
		entry('chords', 'Triades', 'Triads', true),
		entry('chords-zone', 'Triades vers une case', 'Triads around a fret', true),
		entry('changes', 'Changements', 'Changes', false)
	];
}

describe('/ page', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
		vi.clearAllMocks();
	});

	it('starts the notes on Space when nothing has the focus', async () => {
		const services = createFakeAppServices({ routines: async () => catalogRoutines() });
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
		await fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
		expect(goto).toHaveBeenCalledWith('/session?routine=notes');
	});

	it('starts each routine of the catalog from its block, by its id', async () => {
		const services = createFakeAppServices({ routines: async () => catalogRoutines() });
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('button', { name: /^Triades$/ })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /^Apprentissage/ }));
		await fireEvent.click(screen.getByRole('button', { name: /^Triades$/ }));
		await fireEvent.click(screen.getByRole('button', { name: /^Triades vers une case/ }));
		await fireEvent.click(screen.getByRole('button', { name: /^Changements/ }));
		expect(goto.mock.calls.map(([url]) => url)).toEqual([
			'/session?routine=notes',
			'/session?routine=chords',
			'/session?routine=chords-zone',
			'/session?routine=changes'
		]);
	});

	it('shows only the open routines', async () => {
		const services = createFakeAppServices({
			routines: async () => catalogRoutines(['chords-zone', 'changes'])
		});
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('button', { name: /^Triades$/ })).toBeTruthy());
		expect(screen.queryByText(/vers une case/)).toBeNull();
		expect(screen.queryByText(/Changements/)).toBeNull();
	});

	it('starts an imported routine by its id, first on Space when it comes first', async () => {
		const imported: RoutineEntry = {
			id: 'my-routine',
			title: { fr: 'Ma routine', en: 'My routine' },
			open: true,
			due: 0,
			nextReviewAt: null,
			resting: false
		};
		const services = createFakeAppServices({
			routines: async () => [imported, ...catalogRoutines()]
		});
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Ma routine')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /Ma routine/ }));
		// Space starts the first open routine.
		await fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
		expect(goto.mock.calls.map(([url]) => url)).toEqual([
			'/session?routine=my-routine',
			'/session?routine=my-routine'
		]);
	});

	it('tells a failure to read the routines, and starts nothing on Space', async () => {
		const services = createFakeAppServices({
			routines: async () => {
				throw new Error('the routines broke');
			}
		});
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('the routines broke'));
		await fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
		expect(goto).not.toHaveBeenCalled();
	});

	it('leaves Space to a focused link', async () => {
		render(TestHarness, { props: { services: createFakeAppServices() } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
		const link = document.createElement('a');
		link.href = '/somewhere';
		document.body.append(link);
		await fireEvent.keyDown(link, { code: 'Space', key: ' ' });
		expect(goto).not.toHaveBeenCalled();
		link.remove();
	});

	it('tells that an imported file has a problem', async () => {
		const services = createFakeAppServices();
		services.definitions.refusals = () => [
			{ file: 'a.json', kind: 'file', id: null, reason: 'no' },
			{ file: 'a.json', kind: 'exercise', id: 'x', reason: 'no' }
		];
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Un fichier importé a un problème.')).toBeTruthy());
	});
});
