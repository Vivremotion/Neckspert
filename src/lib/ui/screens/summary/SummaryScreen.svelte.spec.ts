import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import SummaryScreen from './SummaryScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

const summary: SessionSummary = {
	sessionId: 's1',
	pool: 'cold',
	attemptCount: 10,
	correctCount: 8,
	medianOffsetMs: 18,
	identifyMedianReactionMs: 640,
	learnedCount: 2,
	fatigueDetected: true,
	nextSuggestedAt: 2 * 60 * 60 * 1000,
	grade: null
};

describe('SummaryScreen', () => {
	it('shows cold accuracy, median, learned, fatigue and next time', () => {
		render(SummaryScreen, {
			props: { summary, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Précision à froid')).toBeTruthy();
		expect(screen.getByText('80 %')).toBeTruthy();
		expect(screen.getByText('18 ms')).toBeTruthy();
		expect(screen.getByText('0,64 s')).toBeTruthy();
		expect(screen.getByText('2')).toBeTruthy();
		expect(screen.getByText(/fatigue/i)).toBeTruthy();
		expect(screen.getByText(/dans 2 h/i)).toBeTruthy();
		expect(screen.queryByText('S+')).toBeNull();
	});

	it('shows a free-play grade, accuracy label, and no next session', () => {
		render(SummaryScreen, {
			props: {
				summary: { ...summary, pool: 'all', grade: 'S+' },
				now: 0,
				onhome: () => {},
				onmap: () => {}
			}
		});
		expect(screen.getByText('S+')).toBeTruthy();
		expect(screen.getByText(/^Précision$/)).toBeTruthy();
		expect(screen.queryByText(/prochaine session/i)).toBeNull();
		expect(screen.queryByText(/dans 2 h/i)).toBeNull();
	});

	it('navigates home and to the map', async () => {
		const onhome = vi.fn();
		const onmap = vi.fn();
		render(SummaryScreen, { props: { summary, now: 0, onhome, onmap } });
		await fireEvent.click(screen.getByRole('button', { name: /accueil|home/i }));
		await fireEvent.click(screen.getByRole('button', { name: /carte|map/i }));
		expect(onhome).toHaveBeenCalledOnce();
		expect(onmap).toHaveBeenCalledOnce();
	});
});
