import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exerciseSessionExercises } from '$lib/domain/exercise';
import type { HomeStats } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import HomeScreen from './HomeScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

const base: HomeStats = {
	dueCount: 0,
	nextReviewAt: null,
	medianColdOffsetMs: 40,
	trend: 'improving'
};

const props = (over: Record<string, unknown> = {}) => ({
	stats: base,
	now: 0,
	onstart: () => {},
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

	it('starts from the block title and from Commencer', async () => {
		const onstart = vi.fn();
		render(HomeScreen, { props: props({ onstart }) });
		await fireEvent.click(within(blocks()).getByRole('button', { name: /Apprentissage/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
		expect(onstart).toHaveBeenCalledTimes(2);
	});

	it('has Commencer as its only primary button', () => {
		render(HomeScreen, { props: props() });
		const primary = document.querySelectorAll('button[data-variant="primary"]');
		expect(primary).toHaveLength(1);
		expect(primary[0].textContent?.trim()).toBe('Commencer');
	});

	it('says nothing about reviews on the first visit', () => {
		const first: HomeStats = {
			dueCount: 0,
			nextReviewAt: null,
			medianColdOffsetMs: null,
			trend: null
		};
		render(HomeScreen, { props: props({ stats: first }) });
		expect(screen.queryByText(/révision/i)).toBeNull();
		expect(screen.getByText('Apprentissage')).toBeTruthy();
	});

	it('counts the reviews due as the why of the first block', () => {
		render(HomeScreen, { props: props({ stats: { ...base, dueCount: 6 } }) });
		const first = within(blocks()).getAllByRole('listitem')[0];
		expect(first.textContent).toContain('6 révisions dues');
		cleanup();
		render(HomeScreen, { props: props({ stats: { ...base, dueCount: 1 } }) });
		expect(screen.getByText('1 révision due')).toBeTruthy();
	});

	it('tells when the next reviews come', () => {
		render(HomeScreen, { props: props({ stats: { ...base, nextReviewAt: 2 * 60 * 60 * 1000 } }) });
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
			props: props({ stats: { ...base, dueCount: 2, medianColdOffsetMs: 12, trend: 'stable' } })
		});
		expect(screen.getByRole('heading', { level: 1, name: 'Practice' })).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Sessions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
		expect(screen.getByText('2 reviews due')).toBeTruthy();
		expect(screen.getByText('From the beat')).toBeTruthy();
		expect(screen.getByText('12 ms')).toBeTruthy();
	});

	it('lists the triads block with its reviews due, without when none', async () => {
		const ontriads = vi.fn();
		render(HomeScreen, {
			props: props({ triads: { anchorDue: 3, zoneDue: null }, ontriads })
		});
		expect(screen.getByText('3 révisions de triades dues')).toBeTruthy();
		expect(screen.queryByText(/vers une case/i)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /^Triades$/ }));
		expect(ontriads).toHaveBeenCalledWith('triads');
		cleanup();
		render(HomeScreen, {
			props: props({ triads: { anchorDue: 0, zoneDue: null }, ontriads: () => {} })
		});
		expect(screen.getByRole('button', { name: /^Triades$/ })).toBeTruthy();
		expect(screen.queryByText(/triades dues?/i)).toBeNull();
	});

	it('offers the zone once open, with its reviews due', async () => {
		const ontriads = vi.fn();
		render(HomeScreen, {
			props: props({ triads: { anchorDue: 0, zoneDue: 2 }, ontriads })
		});
		expect(screen.getByText('2 révisions dues')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /Triades vers une case/ }));
		expect(ontriads).toHaveBeenCalledWith('triads-zone');
	});

	it('offers the gesture track once open', async () => {
		const ongesture = vi.fn();
		render(HomeScreen, { props: props({ gesture: { open: false }, ongesture }) });
		expect(screen.queryByRole('button', { name: /geste/i })).toBeNull();
		cleanup();
		render(HomeScreen, { props: props({ gesture: { open: true }, ongesture }) });
		await fireEvent.click(screen.getByRole('button', { name: /geste/i }));
		expect(ongesture).toHaveBeenCalledOnce();
	});

	describe('exercises', () => {
		const exercises = exerciseSessionExercises();

		it('has no exercise block without the exercises', () => {
			render(HomeScreen, { props: props() });
			expect(screen.queryAllByRole('link')).toHaveLength(0);
		});

		it('has one block per exercise, each linking to its own session', () => {
			render(HomeScreen, { props: props({ exercises }) });
			const links = screen.getAllByRole('link') as HTMLAnchorElement[];
			expect(links.map((link) => link.getAttribute('href'))).toEqual(
				exercises.map((exercise) => `/session?kind=exercise&exercise=${exercise.id}`)
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
				'/session?kind=exercise&exercise=my-scale'
			);
		});

		it('names the exercises in English', () => {
			i18n.locale = 'en';
			render(HomeScreen, { props: props({ exercises }) });
			expect(screen.getByRole('link', { name: /Offbeats/ })).toBeTruthy();
			expect(screen.getByRole('link', { name: /Offbeats/ }).textContent).toContain('Exercises');
		});
	});
});
