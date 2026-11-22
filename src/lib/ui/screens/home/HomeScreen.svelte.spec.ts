import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Refusal } from '$lib/domain/definitions';
import type { RoutineEntry } from '$lib/application/app';
import { i18n } from '$lib/i18n/index.svelte';
import HomeScreen from './HomeScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

/** A catalog routine as the service tells it on a fresh install, then `over`. */
function routine(id: string, over: Partial<RoutineEntry> = {}): RoutineEntry {
	const titles: Record<string, [string, string]> = {
		notes: ['Apprentissage', 'Learn'],
		chords: ['Triades', 'Triads'],
		'chords-zone': ['Triades vers une case', 'Triads around a fret'],
		changes: ['Changements', 'Changes']
	};
	const [fr, en] = titles[id];
	const memory = id !== 'changes';
	return {
		id,
		title: { fr, en },
		open: id === 'notes' || id === 'chords',
		due: memory ? 0 : null,
		nextReviewAt: null,
		resting: false,
		...over
	};
}

/** The four routines, in the order registered, each changed by `over[id]`. */
const routines = (over: Record<string, Partial<RoutineEntry>> = {}) =>
	['notes', 'chords', 'chords-zone', 'changes'].map((id) => routine(id, over[id]));

const props = (over: Record<string, unknown> = {}) => ({
	now: 0,
	onstart: () => {},
	routines: routines(),
	onroutine: () => {},
	...over
});

const blocks = () => screen.getByRole('list', { name: 'Séances' });

describe('HomeScreen', () => {
	it('is a page titled Pratiquer with a list of sessions', () => {
		render(HomeScreen, { props: props() });
		expect(screen.getByRole('heading', { level: 1, name: 'Pratiquer' })).toBeTruthy();
		expect(blocks()).toBeTruthy();
	});

	it('makes Apprentissage the current block, five minutes long', () => {
		render(HomeScreen, { props: props() });
		const first = within(blocks()).getAllByRole('listitem')[0];
		expect(first.getAttribute('aria-current')).toBe('true');
		expect(first.textContent).toContain('Apprentissage');
		expect(first.textContent).toContain('5′');
		expect(first.textContent).toContain('5 min');
	});

	it('shows the open routines in the order told, titled in the player’s language', () => {
		render(HomeScreen, {
			props: props({
				routines: routines({ 'chords-zone': { open: true }, changes: { open: true } })
			})
		});
		const titles = within(blocks())
			.getAllByRole('listitem')
			.map((item) => item.querySelector('b')?.textContent);
		expect(titles).toEqual(['Apprentissage', 'Triades', 'Triades vers une case', 'Changements']);
	});

	it('starts a routine from its block title, and Commencer from onstart', async () => {
		const onstart = vi.fn();
		const onroutine = vi.fn();
		render(HomeScreen, { props: props({ onstart, onroutine }) });
		await fireEvent.click(within(blocks()).getByRole('button', { name: /Apprentissage/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
		expect(onroutine).toHaveBeenCalledWith('notes');
		expect(onstart).toHaveBeenCalledOnce();
	});

	it('starts every routine it shows by its id, an imported one included', async () => {
		const onroutine = vi.fn();
		const mine: RoutineEntry = {
			...routine('notes'),
			id: 'my-notes',
			title: { fr: 'Mes notes', en: 'My notes' }
		};
		render(HomeScreen, { props: props({ onroutine, routines: [...routines(), mine] }) });
		await fireEvent.click(within(blocks()).getByRole('button', { name: /^Triades/ }));
		await fireEvent.click(within(blocks()).getByRole('button', { name: /Mes notes/ }));
		expect(onroutine.mock.calls).toEqual([['chords'], ['my-notes']]);
	});

	it('has Commencer as its only primary button', () => {
		render(HomeScreen, { props: props() });
		const primary = document.querySelectorAll('button[data-variant="primary"]');
		expect(primary).toHaveLength(1);
		expect(primary[0].textContent?.trim()).toBe('Commencer');
	});

	it('says nothing about reviews on the first visit', () => {
		render(HomeScreen, { props: props() });
		expect(screen.queryByText(/révision/i)).toBeNull();
		expect(screen.getByText('Apprentissage')).toBeTruthy();
	});

	it('counts the reviews due as the why of the first block', () => {
		render(HomeScreen, { props: props({ routines: routines({ notes: { due: 6 } }) }) });
		const first = within(blocks()).getAllByRole('listitem')[0];
		expect(first.textContent).toContain('6 révisions dues');
		cleanup();
		render(HomeScreen, { props: props({ routines: routines({ notes: { due: 1 } }) }) });
		expect(screen.getByText('1 révision due')).toBeTruthy();
	});

	it('tells when the next reviews come', () => {
		render(HomeScreen, {
			props: props({ routines: routines({ notes: { nextReviewAt: 2 * 60 * 60 * 1000 } }) })
		});
		expect(screen.getByText('Prochaines révisions · Dans 2 h')).toBeTruthy();
	});

	it('shows neither the exercises, the gap to the beat nor its trend (D3, D4)', () => {
		render(HomeScreen, { props: props() });
		expect(screen.queryByText('Exercices')).toBeNull();
		expect(screen.queryByText('Écart au temps')).toBeNull();
		expect(screen.queryByText(/\bms\b/)).toBeNull();
		expect(screen.queryByText(/plus près|stable|plus loin/)).toBeNull();
		// Its blocks are its routines, and no link leads elsewhere.
		expect(within(blocks()).getAllByRole('listitem')).toHaveLength(2);
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});

	it('switches copy to English', () => {
		i18n.locale = 'en';
		render(HomeScreen, {
			props: props({ routines: routines({ notes: { due: 2 } }) })
		});
		expect(screen.getByRole('heading', { level: 1, name: 'Practice' })).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Sessions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Learn/ })).toBeTruthy();
		expect(screen.getByText('2 reviews due')).toBeTruthy();
	});

	it('lists the triads block with its reviews due, without when none', async () => {
		const onroutine = vi.fn();
		render(HomeScreen, { props: props({ routines: routines({ chords: { due: 3 } }), onroutine }) });
		// Plan 5a: the triads tell their reviews in the words of every routine.
		expect(screen.getByText('3 révisions dues')).toBeTruthy();
		expect(screen.queryByText(/vers une case/i)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /^Triades$/ }));
		expect(onroutine).toHaveBeenCalledWith('chords');
		cleanup();
		render(HomeScreen, { props: props() });
		expect(screen.getByRole('button', { name: /^Triades$/ })).toBeTruthy();
		expect(screen.queryByText(/dues?/i)).toBeNull();
	});

	it('tells when the next triad reviews come, when none is due', () => {
		// Plan 5a: the triads blocks show their next reviews, as the notes do.
		render(HomeScreen, {
			props: props({
				routines: routines({
					chords: { nextReviewAt: 2 * 60 * 60 * 1000 },
					'chords-zone': { open: true, nextReviewAt: 3 * 24 * 60 * 60 * 1000 }
				})
			})
		});
		const [, chords, zone] = within(blocks()).getAllByRole('listitem');
		expect(chords.textContent).toContain('Prochaines révisions · Dans 2 h');
		expect(zone.textContent).toContain('Prochaines révisions · Dans 3 j');
	});

	it('offers the zone once open, with its reviews due', async () => {
		const onroutine = vi.fn();
		render(HomeScreen, {
			props: props({ routines: routines({ 'chords-zone': { open: true, due: 2 } }), onroutine })
		});
		expect(screen.getByText('2 révisions dues')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /Triades vers une case/ }));
		expect(onroutine).toHaveBeenCalledWith('chords-zone');
	});

	it('offers the gesture track once open, with no line of reviews', async () => {
		const onroutine = vi.fn();
		render(HomeScreen, { props: props({ onroutine }) });
		expect(screen.queryByRole('button', { name: /changements/i })).toBeNull();
		cleanup();
		render(HomeScreen, {
			props: props({ routines: routines({ changes: { open: true } }), onroutine })
		});
		const button = screen.getByRole('button', { name: /changements/i });
		expect(button.closest('li')?.querySelector('.why')).toBeNull();
		await fireEvent.click(button);
		expect(onroutine).toHaveBeenCalledWith('changes');
	});

	it('calls the gesture track « Changements », « Changes » in English', () => {
		const open = { routines: routines({ changes: { open: true } }) };
		render(HomeScreen, { props: props(open) });
		expect(screen.getByRole('button', { name: /^Changements/ })).toBeTruthy();
		expect(screen.queryByText(/geste/i)).toBeNull();
		cleanup();
		i18n.locale = 'en';
		try {
			render(HomeScreen, { props: props(open) });
			expect(screen.getByRole('button', { name: /^Changes/ })).toBeTruthy();
			expect(screen.queryByText(/gesture/i)).toBeNull();
		} finally {
			i18n.locale = 'fr';
		}
	});

	it('marks a routine resting, beside its reviews', () => {
		render(HomeScreen, {
			props: props({
				routines: routines({
					chords: { resting: true, due: 1 },
					changes: { open: true, resting: true }
				})
			})
		});
		const [, chords, changes] = within(blocks()).getAllByRole('listitem');
		expect(chords.querySelector('.why')?.textContent).toBe(
			'1 révision due · On y revient plus tard'
		);
		expect(changes.querySelector('.why')?.textContent).toBe('On y revient plus tard');
	});

	describe('no routine open', () => {
		const none = () => routines({ notes: { open: false }, chords: { open: false } });

		it('says there is nothing to play and leads to the Library', () => {
			render(HomeScreen, { props: props({ routines: none() }) });
			expect(screen.getByText('Rien à jouer pour l’instant')).toBeTruthy();
			const link = screen.getByRole('link', { name: 'Bibliothèque' });
			expect(link.getAttribute('href')).toMatch(/\/library$/);
			expect(screen.queryByRole('list', { name: 'Séances' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Commencer' })).toBeNull();
		});

		it('says it in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ routines: [] }) });
			expect(screen.getByText('Nothing to play for now')).toBeTruthy();
			expect(screen.getByRole('link', { name: 'Library' })).toBeTruthy();
		});

		it('says nothing of it while a routine is open', () => {
			render(HomeScreen, { props: props() });
			expect(screen.queryByText('Rien à jouer pour l’instant')).toBeNull();
		});
	});

	describe('part of the catalog refused (Review Focus 4)', () => {
		it('says it in one line, beside the routines left', () => {
			render(HomeScreen, { props: props({ catalogRefused: true }) });
			expect(screen.getByText('Une partie du catalogue n’a pas pu être chargée.')).toBeTruthy();
			expect(within(blocks()).getAllByRole('listitem')).toHaveLength(2);
		});

		it('says it beside the imported files’ line, and with no routine open', () => {
			render(HomeScreen, {
				props: props({ catalogRefused: true, importedProblems: 1, routines: [] })
			});
			expect(screen.getByText('Une partie du catalogue n’a pas pu être chargée.')).toBeTruthy();
			expect(screen.getByText('Un fichier importé a un problème.')).toBeTruthy();
			expect(screen.getByText('Rien à jouer pour l’instant')).toBeTruthy();
		});

		it('says it in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ catalogRefused: true }) });
			expect(screen.getByText('Part of the catalog could not be loaded.')).toBeTruthy();
		});

		it('says nothing when the whole catalog loaded', () => {
			render(HomeScreen, { props: props() });
			expect(screen.queryByText(/catalogue/)).toBeNull();
		});
	});

	describe('imported files with a problem', () => {
		it('shows nothing at zero', () => {
			render(HomeScreen, { props: props({ importedProblems: 0 }) });
			expect(screen.queryByText(/problème/)).toBeNull();
			expect(screen.queryByRole('link', { name: 'Voir dans les réglages' })).toBeNull();
		});

		it('tells one file and links to the settings section', () => {
			render(HomeScreen, { props: props({ importedProblems: 1 }) });
			expect(screen.getByText('Un fichier importé a un problème.')).toBeTruthy();
			const link = screen.getByRole('link', { name: 'Voir dans les réglages' });
			expect(link.getAttribute('href')).toMatch(/\/settings#imported-files$/);
		});

		it('tells several files', () => {
			render(HomeScreen, { props: props({ importedProblems: 3 }) });
			expect(screen.getByText('3 fichiers importés ont un problème.')).toBeTruthy();
		});

		it('says it in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ importedProblems: 2 }) });
			expect(screen.getByText('2 imported files have a problem.')).toBeTruthy();
			expect(screen.getByRole('link', { name: 'See in the settings' })).toBeTruthy();
		});

		it('tells one file in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ importedProblems: 1 }) });
			expect(screen.getByText('An imported file has a problem.')).toBeTruthy();
		});
	});
	describe('definition files refused', () => {
		const refused: Refusal[] = [
			{ file: '/catalog/broken.json', kind: 'file', id: null, reason: 'unknown key "x"' },
			{
				file: '/catalog/scale.json',
				kind: 'exercise',
				id: 'scale',
				reason: 'tempo must be a positive number, got -3'
			},
			{
				file: '/catalog/scale.json',
				kind: 'grid',
				id: 'blues',
				reason: 'bars must be a positive integer'
			},
			{
				file: '/catalog/scale.json',
				kind: 'exercise',
				id: null,
				reason: 'an exercise must be a JSON object'
			}
		];

		it('lists each refusal with its file, its object and its reason', () => {
			render(HomeScreen, { props: props({ refused }) });
			const list = screen.getByRole('region', { name: 'Fichiers refusés' });
			expect(
				within(list)
					.getAllByRole('listitem')
					.map((item) => item.textContent)
			).toEqual([
				'/catalog/broken.json : unknown key "x"',
				'/catalog/scale.json, exercice `scale` : tempo must be a positive number, got -3',
				'/catalog/scale.json, grille `blues` : bars must be a positive integer',
				'/catalog/scale.json, exercice : an exercise must be a JSON object'
			]);
		});

		it('says it in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ refused }) });
			const list = screen.getByRole('region', { name: 'Files refused' });
			expect(
				within(list)
					.getAllByRole('listitem')
					.map((item) => item.textContent)
			).toEqual([
				'/catalog/broken.json: unknown key "x"',
				'/catalog/scale.json, exercise `scale`: tempo must be a positive number, got -3',
				'/catalog/scale.json, grid `blues`: bars must be a positive integer',
				'/catalog/scale.json, exercise: an exercise must be a JSON object'
			]);
		});

		it('shows nothing when no file was refused', () => {
			render(HomeScreen, { props: props() });
			expect(screen.queryByRole('region', { name: 'Fichiers refusés' })).toBeNull();
		});
	});
});
