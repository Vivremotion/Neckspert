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
	nextAction: 'session',
	nextReviewAt: null,
	medianColdOffsetMs: 40,
	trend: 'improving'
};

describe('HomeScreen', () => {
	it('shows one huge start button and the one reaction number with trend', () => {
		render(HomeScreen, { props: { stats: base, now: 0, onstart: () => {} } });
		const button = screen.getByRole('button') as HTMLButtonElement;
		expect(button.textContent).toMatch(/session du jour/i);
		expect(button.disabled).toBe(false);
		expect(screen.getByText(/écart au temps/i)).toBeTruthy();
		expect(screen.getByText('40 ms')).toBeTruthy();
		expect(screen.getByText(/plus près/i)).toBeTruthy();
	});

	it('disables the button and shows relative wait time', () => {
		const stats: HomeStats = {
			nextAction: 'wait',
			nextReviewAt: 2 * 60 * 60 * 1000,
			medianColdOffsetMs: null,
			trend: null
		};
		render(HomeScreen, { props: { stats, now: 0, onstart: () => {} } });
		const button = screen.getByRole('button') as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(button.textContent).toMatch(/dans 2 h/i);
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
				stats: { ...base, nextAction: 'placement', medianColdOffsetMs: 12, trend: 'stable' },
				now: 0,
				onstart: () => {}
			}
		});
		expect(screen.getByRole('button').textContent).toMatch(/placement/i);
		expect(screen.getByText(/from the beat/i)).toBeTruthy();
		expect(screen.getByText('12 ms')).toBeTruthy();
		expect(screen.getByText(/stable/i)).toBeTruthy();
	});
});
