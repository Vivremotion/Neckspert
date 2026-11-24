import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayedExercise, SessionSummary } from '$lib/domain/types';
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
	grade: null,
	tempoBpm: 92,
	chords: false,
	memory: true,
	exercises: [
		// A session of memory exercises keeps its lines in its data: the screen shows none.
		{
			exerciseId: 'locate-note-string',
			rounds: 10,
			passed: 8,
			level: null,
			tempo: { first: 92, last: 92 },
			inPassages: false,
			passages: null
		}
	],
	misses: []
};

/** A line of the summary, with no field but its counts. */
const played = (
	fields: Partial<PlayedExercise> & Pick<PlayedExercise, 'exerciseId'>
): PlayedExercise => ({
	rounds: 0,
	passed: 0,
	level: null,
	tempo: null,
	inPassages: false,
	passages: null,
	...fields
});

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

	it('never tells notes already known: nothing is probed any more', () => {
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
		expect(screen.getByText('♩ = 92')).toBeTruthy();
		cleanup();
		render(SummaryScreen, {
			props: { summary: { ...summary, tempoBpm: null }, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.queryByText('Tempo')).toBeNull();
		expect(screen.queryByText(/♩/)).toBeNull();
	});

	it('navigates home and to the map', async () => {
		const onhome = vi.fn();
		const onmap = vi.fn();
		render(SummaryScreen, { props: { summary, now: 0, onhome, onmap } });
		await fireEvent.click(screen.getByRole('button', { name: /pratiquer|practice/i }));
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
			chords: true
		};

		it('counts triads, not notes, and leaves naming out', () => {
			render(SummaryScreen, {
				props: { summary: triads, now: 0, onhome: () => {}, onmap: () => {} }
			});
			expect(screen.getByText(/triades apprises/i)).toBeTruthy();
			expect(screen.queryByText(/déjà su/)).toBeNull();
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
		chords: false,
		memory: false,
		exercises: [
			played({
				exerciseId: 'inversion-run',
				rounds: 50,
				passed: 43,
				tempo: { first: 80, last: 85 },
				inPassages: true,
				passages: { played: 4, passed: 3 }
			})
		],
		misses: [
			{
				attemptId: 12,
				exerciseId: 'inversion-run',
				symbol: 'D',
				heard: '2-3-2',
				expected: '7-7-5',
				contested: false
			}
		]
	};

	it('shows each exercise played, its passages, its changes and its tempos, and nothing of the notes', () => {
		render(SummaryScreen, {
			props: { summary: gesture, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Relier les formes')).toBeTruthy();
		expect(screen.getByText('3 / 4 passages réussis')).toBeTruthy();
		expect(screen.getByText('86 % justes et à temps')).toBeTruthy();
		expect(screen.getByText('♩ = 80 → 85')).toBeTruthy();
		expect(screen.queryByText('Notes apprises')).toBeNull();
		expect(screen.queryByText('Précision à froid')).toBeNull();
	});

	it('tells one tempo alone when the first and the last are the same, in French and English', () => {
		const steady: SessionSummary = {
			...gesture,
			exercises: [{ ...gesture.exercises[0], tempo: { first: 80, last: 80 } }]
		};
		render(SummaryScreen, {
			props: { summary: steady, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('♩ = 80')).toBeTruthy();
		expect(screen.queryByText(/→/)).toBeNull();
		cleanup();
		i18n.locale = 'en';
		render(SummaryScreen, {
			props: { summary: gesture, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('♩ = 80 → 85')).toBeTruthy();
		cleanup();
		render(SummaryScreen, {
			props: { summary: steady, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('♩ = 80')).toBeTruthy();
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
			exercises: ['iohefy-a', 'blues-f'].map((scope) =>
				played({
					exerciseId: 'grid-in-direction',
					scope,
					rounds: 9,
					passed: 9,
					tempo: { first: 80, last: 80 },
					inPassages: true,
					passages: { played: 1, passed: 1 }
				})
			),
			misses: []
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
		chords: false,
		memory: false,
		exercises: [
			played({
				exerciseId: 'rhythm-offbeats',
				level: { shown: 3, of: 6, aid: false },
				rounds: 14,
				passed: 11,
				tempo: { first: 80, last: 80 }
			})
		]
	};

	it('names the exercise, the level reached and the cycles that succeeded, and nothing of the notes', () => {
		render(SummaryScreen, {
			props: { summary: rhythm, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Contretemps')).toBeTruthy();
		expect(screen.getByText('Niveau atteint : 3 sur 6')).toBeTruthy();
		expect(screen.getByText('11 cycles réussis sur 14')).toBeTruthy();
		expect(document.body.textContent).not.toMatch(/aide|aidé|change d’air/);
		expect(screen.queryByText('Notes apprises')).toBeNull();
		expect(screen.queryByText('Précision à froid')).toBeNull();
		expect(screen.queryByText(/fatigue/i)).toBeNull();
	});

	it('speaks English in English, and says nothing of aids', () => {
		i18n.locale = 'en';
		const unaided: SessionSummary = {
			...rhythm,
			exercises: [{ ...rhythm.exercises[0], rounds: 1, passed: 1 }]
		};
		render(SummaryScreen, {
			props: { summary: unaided, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Offbeats')).toBeTruthy();
		expect(screen.getByText('Level reached: 3 of 6')).toBeTruthy();
		expect(screen.getByText('1 cycle succeeded out of 1')).toBeTruthy();
		expect(screen.queryByText(/aid/i)).toBeNull();
	});

	it('names an aid level as the play header does, in French and in English', () => {
		const atAidLevel: SessionSummary = {
			...rhythm,
			exercises: [{ ...rhythm.exercises[0], level: { shown: 0, of: 6, aid: true } }]
		};
		render(SummaryScreen, {
			props: { summary: atAidLevel, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Niveau atteint : niveau d’aide')).toBeTruthy();
		expect(screen.queryByText(/0 sur 6/)).toBeNull();
		cleanup();
		i18n.locale = 'en';
		render(SummaryScreen, {
			props: { summary: atAidLevel, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('Level reached: aid level')).toBeTruthy();
		expect(screen.queryByText(/0 of 6/)).toBeNull();
	});
});

describe('SummaryScreen of a series in memory', () => {
	const base: SessionSummary = {
		...summary,
		chords: false,
		memory: false,
		exercises: [
			played({
				exerciseId: 'rhythm-offbeats',
				level: { shown: 0, of: 4, aid: true },
				rounds: 8,
				passed: 3
			})
		],
		replayable: [2],
		series: {
			exerciseId: 'rhythm-offbeats',
			ended: 'time',
			levels: [0, 1, -1],
			rounds: 8,
			successes: 3,
			listens: 1,
			playedShare: 0.62,
			runs: [
				{
					id: 2,
					exerciseId: 'rhythm-offbeats',
					level: 0,
					ended: 'done',
					rounds: 4,
					successes: 3,
					measures: { regularity: { value: 24.4, unit: 'ms' } },
					failed: [{ attemptId: 11, reasons: ['regularity', 'hold'] }]
				},
				{
					id: 7,
					exerciseId: 'rhythm-offbeats',
					level: -1,
					ended: 'interrupted',
					rounds: 4,
					successes: 0,
					measures: {},
					failed: []
				}
			]
		}
	};

	it('shows each run, with a replay only for the runs still held', async () => {
		const replayed: number[] = [];
		render(SummaryScreen, {
			props: {
				summary: base,
				now: 0,
				onhome: () => {},
				onmap: () => {},
				onreplay: async (runId: number) => {
					replayed.push(runId);
				}
			}
		});
		expect(screen.getByText('Suite 1')).toBeTruthy();
		expect(screen.getByText('Suite 2')).toBeTruthy();
		expect(screen.getByText('3 réussis sur 4')).toBeTruthy();
		expect(screen.getByText('régularité')).toBeTruthy();
		expect(screen.getByText('24 ms')).toBeTruthy();
		const buttons = screen.getAllByRole('button', { name: 'Réécouter la suite' });
		expect(buttons).toHaveLength(1);
		await fireEvent.click(buttons[0]);
		expect(replayed).toEqual([2]);
	});

	it('tells the level changes, the listens and the share of time played', () => {
		render(SummaryScreen, { props: { summary: base, now: 0, onhome: () => {}, onmap: () => {} } });
		expect(screen.getByText('niveau 1 → niveau 2 → niveau d’aide')).toBeTruthy();
		expect(screen.getByText('1 écoute')).toBeTruthy();
		expect(screen.getByText('62 % du temps joué')).toBeTruthy();
	});

	it('draws no block for a series with no run', () => {
		const empty: SessionSummary = {
			...base,
			series: { ...base.series!, levels: [], listens: 0, playedShare: 0, runs: [] },
			replayable: []
		};
		render(SummaryScreen, { props: { summary: empty, now: 0, onhome: () => {}, onmap: () => {} } });
		expect(document.querySelector('.series')).toBeNull();
		expect(screen.queryByText('0 % du temps joué')).toBeNull();
	});

	it('without a series, the counts alone and no replay', () => {
		const counts: SessionSummary = {
			...base,
			series: undefined,
			replayable: undefined
		};
		render(SummaryScreen, {
			props: { summary: counts, now: 0, onhome: () => {}, onmap: () => {} }
		});
		expect(screen.getByText('3 cycles réussis sur 8')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Réécouter la suite' })).toBeNull();
	});

	it('contests a failed cycle by reason only in development', async () => {
		const contested: [number, string | undefined][] = [];
		const props = {
			summary: base,
			now: 0,
			onhome: () => {},
			onmap: () => {},
			oncontest: async (attemptId: number, reason?: string) => {
				contested.push([attemptId, reason]);
			}
		};
		render(SummaryScreen, { props });
		expect(screen.queryByText(/C’était en place/)).toBeNull();
		cleanup();
		render(SummaryScreen, { props: { ...props, development: true } });
		await fireEvent.click(screen.getByRole('button', { name: 'C’était en place · régularité' }));
		expect(contested).toEqual([[11, 'regularity']]);
		expect(screen.getByRole('button', { name: 'C’était en place · tenue' })).toBeTruthy();
	});
});

describe('SummaryScreen: one list for any session', () => {
	it('shows no line of a session of memory exercises: its memory block alone', () => {
		render(SummaryScreen, { props: { summary, now: 0, onhome: () => {}, onmap: () => {} } });
		expect(screen.getByText('Notes apprises')).toBeTruthy();
		expect(screen.queryByText(/cycles? réussis?/)).toBeNull();
		expect(screen.queryByText(/passages réussis/)).toBeNull();
		expect(document.querySelector('li.exercise')).toBeNull();
	});

	it('gives each exercise and scope its line, every field told only when it has a value', () => {
		const several: SessionSummary = {
			...summary,
			memory: false,
			exercises: [
				played({
					exerciseId: 'grid-reading',
					scope: 'iohefy-a',
					rounds: 9,
					passed: 9,
					tempo: { first: 80, last: 85 },
					inPassages: true,
					passages: { played: 1, passed: 1 }
				}),
				played({
					exerciseId: 'grid-reading',
					scope: 'blues-f',
					rounds: 12,
					passed: 6,
					tempo: { first: 100, last: 100 },
					inPassages: true,
					passages: { played: 1, passed: 0 }
				}),
				played({
					exerciseId: 'rhythm-offbeats',
					rounds: 4,
					passed: 3,
					level: { shown: 2, of: 4, aid: false }
				})
			]
		};
		render(SummaryScreen, {
			props: { summary: several, now: 0, onhome: () => {}, onmap: () => {} }
		});
		const lines = [...document.querySelectorAll('li.exercise')].map((li) =>
			[...li.children].map((child) => child.textContent)
		);
		expect(lines).toEqual([
			[
				'Jam · I Only Have Eyes for You',
				'1 / 1 passages réussis',
				'100 % justes et à temps',
				'♩ = 80 → 85'
			],
			['Jam · Blues F', '0 / 1 passages réussis', '50 % justes et à temps', '♩ = 100'],
			['Contretemps', 'Niveau atteint : 2 sur 4', '3 cycles réussis sur 4']
		]);
		expect(screen.queryByText('Notes apprises')).toBeNull();
	});

	it('names an exercise no file defines by its id, with what its attempts say (D2)', () => {
		const gone: SessionSummary = {
			...summary,
			memory: false,
			exercises: [
				played({ exerciseId: 'kazoo', rounds: 5, passed: 2, tempo: { first: 80, last: 80 } })
			]
		};
		render(SummaryScreen, { props: { summary: gone, now: 0, onhome: () => {}, onmap: () => {} } });
		expect(screen.getByText('kazoo')).toBeTruthy();
		expect(screen.getByText('2 cycles réussis sur 5')).toBeTruthy();
		expect(screen.getByText('♩ = 80')).toBeTruthy();
		expect(screen.queryByText(/Niveau atteint/)).toBeNull();
	});
});
