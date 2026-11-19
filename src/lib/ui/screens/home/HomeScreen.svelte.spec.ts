import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Refusal } from '$lib/domain/definitions';
import { exerciseSessionExercises } from '$lib/domain/exercise';
import type { HomeStats } from '$lib/domain/types';
import type { RoutineEntry } from '$lib/application/app';
import { i18n } from '$lib/i18n/index.svelte';
import HomeScreen from './HomeScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

const base: HomeStats = {
	medianColdOffsetMs: 40,
	trend: 'improving'
};

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
	stats: base,
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
		render(HomeScreen, { props: props({ stats: { medianColdOffsetMs: null, trend: null } }) });
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

	it('shows the gap to the beat with its trend, and a dash when unknown', () => {
		render(HomeScreen, { props: props() });
		expect(screen.getByText('Écart au temps')).toBeTruthy();
		expect(screen.getByText('40 ms')).toBeTruthy();
		expect(screen.getByText('plus près')).toBeTruthy();
		cleanup();
		render(HomeScreen, {
			props: props({ stats: { ...base, medianColdOffsetMs: null, trend: null } })
		});
		expect(screen.getByText('—')).toBeTruthy();
	});

	it('switches copy to English', () => {
		i18n.locale = 'en';
		render(HomeScreen, {
			props: props({
				stats: { medianColdOffsetMs: 12, trend: 'stable' },
				routines: routines({ notes: { due: 2 } })
			})
		});
		expect(screen.getByRole('heading', { level: 1, name: 'Practice' })).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Sessions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Learn/ })).toBeTruthy();
		expect(screen.getByText('2 reviews due')).toBeTruthy();
		expect(screen.getByText('From the beat')).toBeTruthy();
		expect(screen.getByText('12 ms')).toBeTruthy();
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

	describe('exercises', () => {
		const exercises = exerciseSessionExercises();

		it('has no exercise block without the exercises', () => {
			render(HomeScreen, { props: props() });
			expect(screen.queryAllByRole('link')).toHaveLength(0);
			expect(screen.queryByText('Exercices')).toBeNull();
		});

		it('has one block per exercise, each linking to its own session', () => {
			render(HomeScreen, { props: props({ exercises }) });
			const links = screen.getAllByRole('link') as HTMLAnchorElement[];
			expect(links.map((link) => link.getAttribute('href'))).toEqual(
				exercises.map((exercise) => `/session?exercise=${exercise.id}`)
			);
			links.forEach((link, i) => {
				expect(link.textContent).toContain('Exercices');
				expect(link.textContent).toContain(exercises[i].title?.fr);
			});
		});

		it('marks an exercise resting after a change of air', () => {
			render(HomeScreen, { props: props({ exercises, resting: ['rhythm-offbeats'] }) });
			const offbeats = screen.getByRole('link', { name: /Contretemps/ });
			expect(offbeats.closest('li')?.textContent).toContain('On y revient plus tard');
			const silent = screen.getByRole('link', { name: /Mesures silencieuses/ });
			expect(silent.closest('li')?.textContent).not.toContain('On y revient plus tard');
		});

		it('names an exercise without a title by its id', () => {
			render(HomeScreen, { props: props({ exercises: [{ id: 'my-scale' }] }) });
			expect(screen.getByRole('link', { name: /my-scale/ }).getAttribute('href')).toBe(
				'/session?exercise=my-scale'
			);
		});

		it('names the exercises in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ exercises }) });
			expect(screen.getByRole('link', { name: /Offbeats/ })).toBeTruthy();
			expect(screen.getByRole('link', { name: /Offbeats/ }).textContent).toContain('Exercises');
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
