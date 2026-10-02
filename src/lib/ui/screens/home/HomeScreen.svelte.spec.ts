import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
