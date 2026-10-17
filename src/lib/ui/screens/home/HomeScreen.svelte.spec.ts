import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
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

describe('HomeScreen', () => {
	it('opens learn on the first visit, with no placement', () => {
		const first: HomeStats = {
			dueCount: 0,
			nextReviewAt: null,
			medianColdOffsetMs: null,
			trend: null
		};
		render(HomeScreen, { props: { stats: first, now: 0, onstart: () => {} } });
		expect(screen.getByRole('button').textContent).toMatch(/apprentissage/i);
		expect(screen.queryByText(/positionnement/i)).toBeNull();
	});

	it('shows one huge start button and the one reaction number with trend', () => {
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {} } });
		const button = screen.getByRole('button') as HTMLButtonElement;
		expect(button.textContent).toMatch(/apprentissage/i);
		expect(button.disabled).toBe(false);
		expect(screen.getByText(/écart au temps/i)).toBeTruthy();
		expect(screen.getByText('40 ms')).toBeTruthy();
		expect(screen.getByText(/plus près/i)).toBeTruthy();
	});

	it('keeps the button active and says nothing when no review is planned', () => {
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {} } });
		expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
		expect(screen.queryByText(/révision/i)).toBeNull();
	});

	it('counts the reviews due', () => {
		render(HomeScreen, { props: { stats: { ...base, dueCount: 6 }, now: 0, onstart: () => {} } });
		expect(screen.getByText('6 révisions dues')).toBeTruthy();
		cleanup();
		render(HomeScreen, { props: { stats: { ...base, dueCount: 1 }, now: 0, onstart: () => {} } });
		expect(screen.getByText('1 révision due')).toBeTruthy();
	});

	it('tells when the next reviews come, button still active', () => {
		const stats: HomeStats = { ...base, nextReviewAt: 2 * 60 * 60 * 1000 };
		render(HomeScreen, { props: { stats, now: 0, onstart: () => {} } });
		expect(screen.getByText(/prochaines révisions/i)).toBeTruthy();
		expect(screen.getByText(/dans 2 h/i)).toBeTruthy();
		expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
	});

	it('calls onstart when the button is clicked', async () => {
		const onstart = vi.fn();
		render(HomeScreen, { props: { stats: base, now: 0, onstart } });
		await fireEvent.click(screen.getByRole('button'));
		expect(onstart).toHaveBeenCalledOnce();
	});

	it('switches copy to English', () => {
		i18n.locale = 'en';
		render(HomeScreen, {
			props: {
				stats: { ...base, medianColdOffsetMs: 12, trend: 'stable' },
				now: 0,
				onstart: () => {}
			}
		});
		expect(screen.getByRole('button').textContent).toMatch(/learn/i);
		expect(screen.queryByText(/placement/i)).toBeNull();
		expect(screen.getByText(/from the beat/i)).toBeTruthy();
		expect(screen.getByText('12 ms')).toBeTruthy();
		expect(screen.getByText(/stable/i)).toBeTruthy();
	});

	it('names the learn session in English', () => {
		i18n.locale = 'en';
		render(HomeScreen, { props: { stats: { ...base, dueCount: 2 }, now: 0, onstart: () => {} } });
		expect(screen.getByRole('button').textContent).toMatch(/learn/i);
		expect(screen.getByText('2 reviews due')).toBeTruthy();
	});

	it('starts the triads anchor with its own button and its reviews due', async () => {
		const ontriads = vi.fn();
		render(HomeScreen, {
			props: {
				stats: base,
				now: 0,
				onstart: () => {},
				triads: { anchorDue: 3, zoneDue: null },
				ontriads
			}
		});
		const button = screen.getByRole('button', { name: 'Triades' });
		expect(screen.getByText('3 révisions de triades dues')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /vers une case/i })).toBeNull();
		await fireEvent.click(button);
		expect(ontriads).toHaveBeenCalledWith('triads');
	});

	it('shows the triads button without a count when none is due', () => {
		render(HomeScreen, {
			props: {
				stats: base,
				now: 0,
				onstart: () => {},
				triads: { anchorDue: 0, zoneDue: null },
				ontriads: () => {}
			}
		});
		expect(screen.getByRole('button', { name: 'Triades' })).toBeTruthy();
		expect(screen.queryByText(/triades dues?/i)).toBeNull();
	});

	it('offers the zone once open, with its own reviews due', async () => {
		const ontriads = vi.fn();
		render(HomeScreen, {
			props: {
				stats: base,
				now: 0,
				onstart: () => {},
				triads: { anchorDue: 0, zoneDue: 2 },
				ontriads
			}
		});
		const zone = screen.getByRole('button', { name: 'Triades vers une case' });
		expect(screen.getByText('2 révisions dues')).toBeTruthy();
		await fireEvent.click(zone);
		expect(ontriads).toHaveBeenCalledWith('triads-zone');
	});

	it('offers the gesture track once one of its exercises is open', async () => {
		const ongesture = vi.fn();
		render(HomeScreen, {
			props: { stats: base, now: 0, onstart: () => {}, gesture: { open: false }, ongesture }
		});
		expect(screen.queryByRole('button', { name: /geste/i })).toBeNull();
		cleanup();
		render(HomeScreen, {
			props: { stats: base, now: 0, onstart: () => {}, gesture: { open: true }, ongesture }
		});
		await fireEvent.click(screen.getByRole('button', { name: /geste/i }));
		expect(ongesture).toHaveBeenCalledOnce();
	});
});

describe('HomeScreen rhythm', () => {
	const rhythm = RHYTHM_EXERCISES;

	it('offers no rhythm button without the exercises', () => {
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {} } });
		expect(screen.queryByRole('button', { name: 'Rythme' })).toBeNull();
	});

	it('opens the list of the three exercises, each linking to its own session', async () => {
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {}, rhythm } });
		expect(screen.queryAllByRole('link')).toHaveLength(0);
		await fireEvent.click(screen.getByRole('button', { name: 'Rythme' }));
		const links = screen.getAllByRole('link') as HTMLAnchorElement[];
		expect(links).toHaveLength(3);
		expect(links.map((link) => link.getAttribute('href'))).toEqual(
			rhythm.map((exercise) => `/session?kind=exercise&exercise=${exercise.id}`)
		);
		expect(links.map((link) => link.textContent?.trim())).toEqual(rhythm.map((e) => e.title?.fr));
	});

	it('marks an exercise resting after a change of air, still to be played', async () => {
		render(HomeScreen, {
			props: { stats: base, now: 0, onstart: () => {}, rhythm, resting: ['rhythm-offbeats'] }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Rythme' }));
		const offbeats = screen.getByRole('link', { name: /Contretemps/ });
		expect(offbeats.getAttribute('href')).toBe('/session?kind=exercise&exercise=rhythm-offbeats');
		expect(offbeats.closest('li')?.textContent).toContain('On y revient plus tard');
		const silent = screen.getByRole('link', { name: /Mesures silencieuses/ });
		expect(silent.closest('li')?.textContent).not.toContain('On y revient plus tard');
	});

	it('closes the list again, and names the exercises in English', async () => {
		i18n.locale = 'en';
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {}, rhythm } });
		const button = screen.getByRole('button', { name: 'Rhythm' });
		await fireEvent.click(button);
		expect(screen.getByRole('link', { name: 'Offbeats' })).toBeTruthy();
		await fireEvent.click(button);
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});
});
