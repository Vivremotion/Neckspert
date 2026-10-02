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
	pendingCount: 0,
	fatigueDetected: true,
	nextReviewAt: 2 * 60 * 60 * 1000,
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
		expect(screen.getByText('Notes apprises')).toBeTruthy();
		expect(screen.getByText('Prochaines révisions')).toBeTruthy();
		expect(screen.getByText(/dans 2 h/i)).toBeTruthy();
		expect(screen.queryByText('S+')).toBeNull();
		expect(screen.queryByText(/reprendr/i)).toBeNull();
	});

	it('says there was no cold review instead of showing empty numbers', () => {
		render(SummaryScreen, {
			props: {
				summary: { ...summary, attemptCount: 0, correctCount: 0, medianOffsetMs: null },
				now: 0,
				onhome: () => {},
				onmap: () => {}
			}
		});
		expect(screen.getByText('Aucune révision à froid cette fois')).toBeTruthy();
		expect(screen.queryByText('Précision à froid')).toBeNull();
		expect(screen.getByText('Notes apprises')).toBeTruthy();
	});

	it('mentions the notes that will resume next time', () => {
		render(SummaryScreen, {
			props: { summary: { ...summary, pendingCount: 1 }, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('1 note reprendra la prochaine fois')).toBeTruthy();
		cleanup();
		render(SummaryScreen, {
			props: { summary: { ...summary, pendingCount: 3 }, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('3 notes reprendront la prochaine fois')).toBeTruthy();
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
		expect(screen.queryByText(/prochaines révisions/i)).toBeNull();
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
