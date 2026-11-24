import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { RoutineEntry } from '$lib/application/app';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';
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
		nextReviewAt: null
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
			nextReviewAt: null
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
		const services = createFakeAppServices({ routines: async () => catalogRoutines() });
		render(TestHarness, { props: { services } });
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

	it('lists the open routines and nothing else: no exercise, no gap to the beat', async () => {
		const services = createFakeAppServices({ routines: async () => catalogRoutines() });
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('button', { name: /^Triades$/ })).toBeTruthy());
		expect(screen.getAllByRole('listitem')).toHaveLength(4);
		expect(screen.queryByText('Exercices')).toBeNull();
		expect(screen.queryByText('Écart au temps')).toBeNull();
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});

	it('with no routine open, says there is nothing to play, leads to the Library, and Space starts nothing', async () => {
		const services = createFakeAppServices({
			routines: async () => catalogRoutines(['notes', 'chords', 'chords-zone', 'changes'])
		});
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Rien à jouer pour l’instant')).toBeTruthy());
		expect(screen.getByRole('link', { name: 'Bibliothèque' }).getAttribute('href')).toMatch(
			/\/library$/
		);
		await fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
		expect(goto).not.toHaveBeenCalled();
	});

	it('tells that part of the catalog could not be loaded, in every build (Review Focus 4)', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			loadDefinitions({ catalog: { ...CATALOG_FILES, '/catalog/broken.json': '{' } });
			const services = createFakeAppServices({ routines: async () => catalogRoutines() });
			render(TestHarness, { props: { services } });
			await waitFor(() =>
				expect(screen.getByText('Une partie du catalogue n’a pas pu être chargée.')).toBeTruthy()
			);
			// The routines left are still listed.
			expect(screen.getByRole('button', { name: /^Apprentissage/ })).toBeTruthy();
		} finally {
			loadDefinitions({ catalog: CATALOG_FILES });
			error.mockRestore();
		}
	});

	it('tells an imported file refused, and not the catalog, when only that file was refused', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { imported } = loadDefinitions({
				catalog: CATALOG_FILES,
				imported: { 'broken.json': '{' }
			});
			expect(imported.refusals).not.toEqual([]);
			const services = createFakeAppServices({ routines: async () => catalogRoutines() });
			services.definitions.refusals = () => imported.refusals;
			render(TestHarness, { props: { services } });
			await waitFor(() =>
				expect(screen.getByText('Un fichier importé a un problème.')).toBeTruthy()
			);
			expect(screen.queryByText('Une partie du catalogue n’a pas pu être chargée.')).toBeNull();
		} finally {
			loadDefinitions({ catalog: CATALOG_FILES });
			error.mockRestore();
		}
	});

	it('says nothing of the catalog when it loaded whole', async () => {
		const services = createFakeAppServices({ routines: async () => catalogRoutines() });
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
		expect(screen.queryByText(/catalogue/)).toBeNull();
	});
});
