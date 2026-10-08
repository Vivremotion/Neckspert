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
	knownCount: 0,
	fatigueDetected: true,
	nextReviewAt: 2 * 60 * 60 * 1000,
	grade: null,
	tempoBpm: 92
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

	it('counts the notes already known, only when there are some', () => {
		render(SummaryScreen, {
			props: { summary: { ...summary, knownCount: 2 }, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('2 notes déjà sues')).toBeTruthy();
		cleanup();
		render(SummaryScreen, {
			props: { summary: { ...summary, knownCount: 1 }, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('1 note déjà sue')).toBeTruthy();
		cleanup();
		render(SummaryScreen, { props: { summary, now: 0, onhome: () => {}, onmap: () => {} } });
		expect(screen.queryByText(/déjà su/)).toBeNull();
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

	it('shows the tempo played, also without a cold review, and nothing without one', () => {
		render(SummaryScreen, {
			props: {
				summary: { ...summary, attemptCount: 0, correctCount: 0 },
				now: 0,
				onhome: () => {},
				onmap: () => {}
			}
		});
		expect(screen.getByText('Tempo')).toBeTruthy();
		expect(screen.getByText('92 bpm')).toBeTruthy();
		cleanup();
		render(SummaryScreen, {
			props: { summary: { ...summary, tempoBpm: null }, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.queryByText('Tempo')).toBeNull();
		expect(screen.queryByText(/bpm/)).toBeNull();
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

	describe('of a triads session', () => {
		const KEY = 'D|maj|3:5,2:1,1:3';
		const triads: SessionSummary = {
			...summary,
			identifyMedianReactionMs: null,
			learnedCount: 1,
			knownCount: 2,
			triads: {
				refused: [
					{
						attemptId: 7,
						mechanic: 'triad-anchor',
						item: { voicingKey: KEY },
						heard: `${KEY}@14-15-14`,
						contested: false
					},
					{
						attemptId: 9,
						mechanic: 'triad-zone',
						item: { voicingKey: KEY, position: 2 },
						heard: null,
						contested: true
					}
				]
			}
		};

		it('counts triads, not notes, and leaves naming out', () => {
			render(SummaryScreen, {
				props: { summary: triads, now: 0, onhome: () => {}, onmap: () => {} }
			});
			expect(screen.getByText(/triades apprises/i)).toBeTruthy();
			expect(screen.getByText('2 triades déjà sues')).toBeTruthy();
			expect(screen.queryByText(/nommer/i)).toBeNull();
		});

		it('lists the refused chords, with what was heard', () => {
			render(SummaryScreen, {
				props: { summary: triads, now: 0, onhome: () => {}, onmap: () => {} }
			});
			const items = screen.getAllByRole('listitem').filter((li) => li.closest('.refused'));
			expect(items.map((li) => li.querySelector('.asked')?.textContent)).toEqual([
				'D · fondamentale sur si',
				'D · position 2'
			]);
			expect(items[0].querySelector('.heard')?.textContent).toBe('14‑15‑14');
			expect(items[1].querySelector('.heard')?.textContent).toBe('—');
		});

		it('contests a refused chord: the attempt is labelled, the button says so', async () => {
			const oncontest = vi.fn(async () => {});
			render(SummaryScreen, {
				props: { summary: triads, now: 0, onhome: () => {}, onmap: () => {}, oncontest }
			});
			const contested = screen.getByRole('button', { name: 'Contesté' }) as HTMLButtonElement;
			expect(contested.disabled).toBe(true);
			await fireEvent.click(screen.getByRole('button', { name: 'Joué juste' }));
			expect(oncontest).toHaveBeenCalledWith(7);
			expect(screen.getAllByRole('button', { name: 'Contesté' })).toHaveLength(2);
		});
	});
});
