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
	tempoBpm: 92,
	kind: 'learn'
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
			kind: 'triads'
		};

		it('counts triads, not notes, and leaves naming out', () => {
			render(SummaryScreen, {
				props: { summary: triads, now: 0, onhome: () => {}, onmap: () => {} }
			});
			expect(screen.getByText(/triades apprises/i)).toBeTruthy();
			expect(screen.getByText('2 triades déjà sues')).toBeTruthy();
			expect(screen.queryByText(/nommer/i)).toBeNull();
		});

		it('offers no « Joué juste »: misses are contested during play', () => {
			render(SummaryScreen, {
				props: { summary: triads, now: 0, onhome: () => {}, onmap: () => {} }
			});
			expect(screen.queryByRole('button', { name: 'Joué juste' })).toBeNull();
			expect(document.querySelector('.refused')).toBeNull();
		});
	});
});

describe('SummaryScreen of a gesture session', () => {
	const gesture: SessionSummary = {
		...summary,
		kind: 'gesture',
		gesture: {
			exercises: [
				{
					exerciseId: 'gesture-link',
					passagesPlayed: 4,
					passagesSucceeded: 3,
					changeSuccessRate: 0.86,
					tempoBpm: 80,
					nextTempoBpm: 85
				}
			],
			misses: [
				{
					attemptId: 12,
					exerciseId: 'gesture-link',
					symbol: 'D',
					heard: '2-3-2',
					expected: '7-7-5',
					contested: false
				}
			]
		}
	};

	it('shows each exercise played, its passages, its changes and its tempos, and nothing of the notes', () => {
		render(SummaryScreen, {
			props: { summary: gesture, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Relier les formes')).toBeTruthy();
		expect(screen.getByText('3 / 4 passages réussis')).toBeTruthy();
		expect(screen.getByText('86 % justes et à temps')).toBeTruthy();
		expect(screen.getByText('80 → 85 bpm')).toBeTruthy();
		expect(screen.queryByText('Notes apprises')).toBeNull();
		expect(screen.queryByText('Précision à froid')).toBeNull();
	});

	it('lists the missed changes, each contestable once', async () => {
		const oncontest = vi.fn(async () => {});
		render(SummaryScreen, {
			props: { summary: gesture, now: 0, onhome: () => {}, onmap: () => {}, oncontest }
		});
		expect(screen.getByText('D')).toBeTruthy();
		expect(screen.getByText('Joué 2-3-2')).toBeTruthy();
		expect(screen.getByText('Attendu 7-7-5')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Joué juste' }));
		expect(oncontest).toHaveBeenCalledWith(12);
		expect(await screen.findByText('Contesté')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Joué juste' })).toBeNull();
	});

	it('names the grid of each line, one line per exercise and grid', () => {
		const climbs: SessionSummary = {
			...gesture,
			gesture: {
				exercises: ['iohefy-a', 'blues-f'].map((scope) => ({
					exerciseId: 'gesture-climb',
					scope,
					passagesPlayed: 1,
					passagesSucceeded: 1,
					changeSuccessRate: 1,
					tempoBpm: 80,
					nextTempoBpm: 80
				})),
				misses: []
			}
		};
		render(SummaryScreen, {
			props: { summary: climbs, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Contrainte de déplacement · I Only Have Eyes for You')).toBeTruthy();
		expect(screen.getByText('Contrainte de déplacement · Blues F')).toBeTruthy();
	});
});

describe('SummaryScreen of a rhythm session', () => {
	const rhythm: SessionSummary = {
		...summary,
		kind: 'exercise',
		rhythm: {
			exerciseId: 'rhythm-offbeats',
			levelReached: { shown: 3, of: 6 },
			cycles: 14,
			successes: 11,
			aided: 2
		}
	};

	it('names the exercise, the level reached and the cycles that succeeded, and nothing of the notes', () => {
		render(SummaryScreen, {
			props: { summary: rhythm, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Contretemps')).toBeTruthy();
		expect(screen.getByText('Niveau atteint : 3 sur 6')).toBeTruthy();
		expect(screen.getByText('11 cycles réussis sur 14')).toBeTruthy();
		expect(screen.getByText('2 cycles avec aide')).toBeTruthy();
		expect(screen.queryByText('Notes apprises')).toBeNull();
		expect(screen.queryByText('Précision à froid')).toBeNull();
		expect(screen.queryByText(/fatigue/i)).toBeNull();
	});

	it('says nothing of aids when none was used, and speaks English in English', () => {
		i18n.locale = 'en';
		const unaided: SessionSummary = {
			...rhythm,
			rhythm: { ...rhythm.rhythm!, cycles: 1, successes: 1, aided: 0 }
		};
		render(SummaryScreen, {
			props: { summary: unaided, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Offbeats')).toBeTruthy();
		expect(screen.getByText('Level reached: 3 of 6')).toBeTruthy();
		expect(screen.getByText('1 cycle succeeded out of 1')).toBeTruthy();
		expect(screen.queryByText(/aid/i)).toBeNull();
	});
});
