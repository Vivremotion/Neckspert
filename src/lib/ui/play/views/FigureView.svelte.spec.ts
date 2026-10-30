import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FigureStageModel, SettledCycle } from '$lib/application/session/series/figureStage';
import { RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS } from '$lib/domain/exercise/rhythmCatalog';
import { Fraction, METER_4_4, type CycleReport, type Figure } from '$lib/domain/time';
import { compileRound } from '$lib/domain/exercise/round';
import { voicingFigureRules } from '$lib/domain/mechanics/voicingFigure';
import type { PlannedItem } from '$lib/domain/types';
import { figureStage } from '$lib/application/session/series/figureStage';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { PLAY_VIEWS } from './index';
import FigureView from './FigureView.svelte';
import { FigureStageController } from './testing/FigureStageController.svelte';

// jsdom has no canvas, and VexFlow measures its text on one: a fixed-size stand-in.
beforeAll(() => {
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
		() =>
			({
				font: '',
				measureText: () => ({
					width: 8,
					actualBoundingBoxLeft: 0,
					actualBoundingBoxRight: 8,
					actualBoundingBoxAscent: 8,
					actualBoundingBoxDescent: 0
				})
			}) as unknown as CanvasRenderingContext2D
	);
});
afterAll(() => {
	vi.restoreAllMocks();
});
afterEach(() => cleanup());

function figure(index: number): Figure {
	const entry = RHYTHM_OFFBEATS.figures?.[index];
	if (!entry) throw new Error('the offbeats exercise has no such figure');
	return entry.figure;
}

/** The offbeats bar: five attacks, the third late by 90 ms, the fifth missed. */
const REPORT: CycleReport = {
	expectations: [
		{ index: 0, verdict: 'on-time', offsetMs: 4 },
		{ index: 1, verdict: 'on-time', offsetMs: -10 },
		{ index: 2, verdict: 'late', offsetMs: 90 },
		{ index: 3, verdict: 'on-time', offsetMs: 0 },
		{ index: 4, verdict: 'missed', offsetMs: null }
	],
	dropped: [],
	extra: 0,
	shift: null,
	measures: { regularity: { value: 31, unit: 'ms' } },
	latency: null
};
/** The same cycle with every note played. */
const ALL_PLAYED: CycleReport['expectations'] = REPORT.expectations.map((e) =>
	e.verdict === 'missed' ? { ...e, verdict: 'on-time', offsetMs: 0 } : e
);
const FAILED: SettledCycle = {
	report: REPORT,
	verdict: { passed: false, reasons: ['missed'] },
	wrongNotes: [],
	expected: null
};

function model(overrides: Partial<FigureStageModel> = {}): FigureStageModel {
	return {
		phase: 'play',
		exerciseLabel: 'Contretemps',
		level: { shown: 3, of: 6, aid: false },
		tempo: { bpm: 90, unit: '♩' },
		figure: figure(0),
		next: null,
		barInCycle: 0,
		cycleBars: 1,
		muted: false,
		cursor: Fraction.of(1, 4),
		feedback: 'every-cycle',
		settled: [],
		listen: 'free',
		plainWords: true,
		prompt: null,
		notation: { staff: false, tab: false },
		neck: null,
		chordDiagram: 'strings',
		...overrides
	};
}

function breath(overrides: Partial<FigureStageModel> = {}): FigureStageModel {
	return model({
		phase: 'breath',
		cursor: null,
		next: figure(1),
		settled: [FAILED],
		...overrides
	});
}

function running() {
	const controller = new FigureStageController();
	controller.view.status = 'awaiting';
	return controller;
}

/** Waits for the engraving: the notation adapter is loaded on demand. */
async function engraved(count = 1) {
	await vi.waitFor(() => {
		expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(count);
	});
}

describe('the figure view, a level that draws the neck', () => {
	it('names the notes at their frets, several on a string, the high string on top', () => {
		render(FigureView, {
			controller: running(),
			model: model({
				neck: {
					kind: 'neck',
					notes: [
						{ string: 4, fret: 5, name: 'G' },
						{ string: 4, fret: 8, name: 'Bb' },
						{ string: 3, fret: 7, name: 'D' }
					]
				}
			})
		});
		const neck = screen.getByTestId('figure-neck');
		const notes = screen.getAllByTestId('aid-note');
		expect(notes.map((note) => note.textContent)).toEqual(['G', 'Bb', 'D']);
		expect(neck.querySelectorAll('.name')).toHaveLength(6);
		expect(neck.querySelector('.name')?.textContent).toBe('E');
		// Fret 5 to fret 8, one fret either side: four to six columns, the two on string 4 apart.
		expect(notes[0].style.gridRow).toBe(notes[1].style.gridRow);
		expect(notes[0].style.gridColumn).not.toBe(notes[1].style.gridColumn);
	});

	it('draws no neck on a level that does not ask it', () => {
		render(FigureView, { controller: running(), model: model() });
		expect(screen.queryByTestId('figure-neck')).toBeNull();
	});
});

describe('FigureView', () => {
	it('is the view of the rhythm exercises', () => {
		expect(PLAY_VIEWS['figure']).toBe(FigureView);
	});

	it('names the exercise, its level and its tempo with its unit', () => {
		render(FigureView, { props: { controller: running(), model: model() } });
		expect(screen.getByTestId('figure-header').textContent?.trim()).toBe(
			'Contretemps · niveau 3 sur 6 · ♩ = 90 bpm'
		);
	});

	it('shows the prompt above the figure', async () => {
		render(FigureView, {
			props: {
				controller: running(),
				model: model({ prompt: { primary: 'Do', secondary: 'cordes sol, si, mi' } })
			}
		});
		await engraved();
		const prompt = screen.getByTestId('figure-prompt');
		expect(prompt.textContent).toContain('Do');
		expect(prompt.textContent).toContain('cordes sol, si, mi');
		const score = document.querySelector('svg') as SVGElement;
		expect(prompt.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('shows no prompt when the exercise writes none', () => {
		render(FigureView, { props: { controller: running(), model: model() } });
		expect(screen.queryByTestId('figure-prompt')).toBeNull();
	});

	it('engraves the figure large while it is played, with its bar and the click in words', async () => {
		render(FigureView, {
			props: { controller: running(), model: model({ barInCycle: 1, cycleBars: 4 }) }
		});
		await engraved();
		expect(screen.getByTestId('figure-bar').textContent).toContain('mesure 2 / 4');
		expect(screen.getByTestId('figure-bar').textContent).toContain('clic');
		expect(screen.getByTestId('figure-cursor')).toBeTruthy();
		// Nothing about the player's attacks while playing.
		expect(screen.queryAllByTestId('figure-mark')).toHaveLength(0);
	});

	it('keeps the line played in view on a figure of several lines', async () => {
		const { voices, meter } = figure(0);
		const long: Figure = {
			schema: figure(0).schema,
			meter,
			bars: 16,
			voices: [
				{ id: 'main', elements: Array.from({ length: 16 }, () => voices[0].elements).flat() }
			]
		};
		render(FigureView, {
			props: {
				controller: running(),
				model: model({ figure: long, cycleBars: 16, barInCycle: 12, cursor: Fraction.of(12) })
			}
		});
		await engraved();
		const cursor = screen.getByTestId('figure-cursor');
		await vi.waitFor(() => {
			const top = Number.parseFloat(cursor.style.top);
			expect(top).toBeGreaterThan(0);
			// A little room above the line, for what is written over its staff.
			expect(screen.getByTestId('figure-score').scrollTop).toBe(top - 24);
		});
	});

	it('never shows the cursor in a muted bar, and says « silence »', async () => {
		render(FigureView, {
			props: { controller: running(), model: model({ muted: true }) }
		});
		await engraved();
		expect(screen.queryByTestId('figure-cursor')).toBeNull();
		expect(screen.getByTestId('figure-bar').textContent).toContain('silence');
	});

	it('at the breath, puts the run played (faded, with its marks) before the figure to play', async () => {
		render(FigureView, { props: { controller: running(), model: breath() } });
		const played = screen.getByTestId('figure-played');
		const next = screen.getByTestId('figure-next');
		expect(played.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(played.classList.contains('faded')).toBe(true);
		expect(next.classList.contains('faded')).toBe(false);
		await engraved(2);
		await vi.waitFor(() => expect(screen.getAllByTestId('figure-mark')).toHaveLength(5));
		const kinds = screen.getAllByTestId('figure-mark').map((m) => m.dataset.kind);
		expect(kinds).toEqual(['on-time', 'on-time', 'late', 'on-time', 'missed']);
		expect(screen.getByText('+90')).toBeTruthy();
		// Each strip is announced as its cycle, each mark by what it says.
		const strip = screen.getByRole('group', { name: 'cycle 1' });
		expect(strip.querySelectorAll('[role="img"]')).toHaveLength(5);
		expect(screen.getByRole('img', { name: 'derrière +90 ms' })).toBeTruthy();
	});

	it('scales the marks by the tempo the run was played at, not the next run’s', async () => {
		/** The left of the late mark, the run played at `playedBpm` and the next at 90. */
		async function lateMarkLeft(playedBpm: number): Promise<number> {
			const controller = running();
			controller.view.tempoBpm = playedBpm;
			render(FigureView, { props: { controller, model: breath() } });
			await engraved(2);
			const late = await vi.waitFor(() => {
				const mark = screen.getAllByTestId('figure-mark').find((m) => m.dataset.kind === 'late');
				if (!mark) throw new Error('no late mark yet');
				return mark;
			});
			const left = Number.parseFloat(late.style.left);
			cleanup();
			return left;
		}
		const sameTempo = await lateMarkLeft(90);
		// Played at half the tempo, a beat lasts twice as long: the same 90 ms is a smaller share.
		expect(await lateMarkLeft(45)).toBeLessThan(sameTempo);
	});

	it('engraves the staff and the tab its level shows, the rhythm line otherwise', async () => {
		const fretted = (pitch: number, string: number) => ({
			kind: 'note' as const,
			duration: Fraction.of(1, 4),
			content: null,
			pitch,
			string
		});
		const written: Figure = {
			schema: 2,
			meter: figure(0).meter,
			bars: 1,
			voices: [
				{ id: 'main', elements: [fretted(60, 2), fretted(64, 1), fretted(67, 1), fretted(64, 1)] }
			]
		};
		const both = { staff: true, tab: true };
		render(FigureView, {
			props: { controller: running(), model: model({ figure: written, notation: both }) }
		});
		await engraved();
		await vi.waitFor(() => expect(document.querySelectorAll('.vf-tabnote')).toHaveLength(4));
		expect(document.querySelectorAll('.vf-stave')).toHaveLength(2);
		// The cursor spans the system, its staff and its tab.
		const cursor = screen.getByTestId('figure-cursor');
		expect(Number.parseFloat(cursor.style.height)).toBeGreaterThan(200);
		cleanup();

		render(FigureView, {
			props: {
				controller: running(),
				model: model({ figure: written, notation: { staff: false, tab: false } })
			}
		});
		await engraved();
		expect(document.querySelectorAll('.vf-tabnote')).toHaveLength(0);
		expect(document.querySelectorAll('.vf-stave')).toHaveLength(1);
		cleanup();

		// At the breath, the figure to play shows them; the run played, with its marks, the rhythm.
		render(FigureView, {
			props: {
				controller: running(),
				model: breath({ figure: written, next: written, notation: both, settled: [] })
			}
		});
		await engraved(2);
		const next = screen.getByTestId('figure-next');
		await vi.waitFor(() => expect(next.querySelectorAll('.vf-tabnote')).toHaveLength(4));
		expect(screen.getByTestId('figure-played').querySelectorAll('.vf-tabnote')).toHaveLength(0);
	});

	it('engraves a change cut inside its figure as the round plays it, its tab aid included', async () => {
		// A one-bar figure of quarters over a change of 2 beats, then of 6, at the tab aid level.
		for (const [beats, tabNotes, bar] of [
			[2, 2, 'mesure 1 / 1'],
			[6, 6, 'mesure 2 / 2']
		] as const) {
			const item: PlannedItem = {
				exerciseId: ARPEGGIO_EXERCISE.id,
				mechanic: ARPEGGIO_EXERCISE.mechanic,
				exerciseLevel: -1,
				item: voicingFigureRules.parseItem(`C|maj|3:1,2:3,1:5@0@${beats}`),
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				leadBeats: null
			};
			const staged = figureStage({
				definition: ARPEGGIO_EXERCISE,
				item,
				plan: compileRound(ARPEGGIO_EXERCISE, item, METER_4_4, {
					previewBeats: 0,
					fromRunStart: null
				}),
				moment: 'round',
				barInRound: beats > 4 ? 1 : 0,
				beat: 0,
				startBar: 0,
				muted: false,
				settled: [],
				played: null,
				locale: 'fr',
				random: () => 0,
				chordDiagram: 'strings',
				endedSessions: 0
			});
			render(FigureView, { props: { controller: running(), model: staged } });
			await engraved();
			await vi.waitFor(() =>
				expect(document.querySelectorAll('.vf-tabnote')).toHaveLength(tabNotes)
			);
			expect(screen.queryByRole('alert')).toBeNull();
			expect(screen.getByTestId('figure-bar').textContent).toContain(bar);
			cleanup();
		}
	});

	it('puts the marks of each line of a wrapped run right under that line', async () => {
		const eighths = RHYTHM_SILENT_BARS.figures?.[0]?.figure;
		if (!eighths) throw new Error('the silent bars exercise has no figure');
		// Twelve bars of eighths cannot hold on one line: the run wraps.
		const cycle: SettledCycle = {
			report: {
				...REPORT,
				expectations: Array.from({ length: 96 }, (_, index) => ({
					index,
					verdict: 'on-time' as const,
					offsetMs: 0
				}))
			},
			verdict: { passed: true },
			wrongNotes: [],
			expected: null
		};
		render(FigureView, {
			props: {
				controller: running(),
				model: breath({ figure: eighths, next: eighths, cycleBars: 12, settled: [cycle, cycle] })
			}
		});
		await vi.waitFor(() => expect(screen.getAllByTestId('figure-line').length).toBeGreaterThan(1));
		const blocks = [
			...screen.getByTestId('figure-played').querySelectorAll('[data-line]')
		] as HTMLElement[];
		// Line 0, its two strips, line 1, its two strips…
		const order = blocks.map((b) => `${b.dataset.testid}:${b.dataset.line}`);
		const lines = screen.getAllByTestId('figure-line').length;
		expect(order).toEqual(
			Array.from({ length: lines }, (_, line) => [
				`figure-line:${line}`,
				`figure-strip:${line}`,
				`figure-strip:${line}`
			]).flat()
		);
		// Each line shows its own part of the engraving, and its strips its own marks.
		const strips = screen.getAllByTestId('figure-strip');
		expect(strips.every((s) => s.querySelectorAll('[data-testid="figure-mark"]').length > 0)).toBe(
			true
		);
		expect(screen.getAllByTestId('figure-mark')).toHaveLength(192);
	});

	it('tells the cycle in plain words, the term as a label', () => {
		render(FigureView, {
			props: {
				controller: running(),
				model: breath({
					settled: [
						{
							report: { ...REPORT, expectations: ALL_PLAYED },
							verdict: { passed: false, reasons: ['regularity'] },
							wrongNotes: [],
							expected: null
						}
					]
				})
			}
		});
		const line = screen.getByTestId('figure-feedback');
		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Irrégulier (± 31 ms) · régularité');
		expect(line.querySelector('.term')?.textContent).toBe('régularité');
	});

	it('tells the reason the judge failed the cycle for, not a measure that passed', () => {
		render(FigureView, {
			props: {
				controller: running(),
				model: breath({
					settled: [
						{
							report: {
								...REPORT,
								expectations: ALL_PLAYED,
								measures: {
									regularity: { value: 45, unit: 'ms' },
									holdOffset: { value: -20, unit: 'ms' }
								}
							},
							verdict: { passed: false, reasons: ['regularity'] },
							wrongNotes: [],
							expected: null
						}
					]
				})
			}
		});
		expect(screen.getByTestId('figure-feedback').textContent).toContain('Irrégulier (± 45 ms)');
	});

	it('shows the expected shape after a failed derived round', () => {
		const shape = {
			kind: 'shape' as const,
			notes: [
				{ string: 3 as const, fret: 9 },
				{ string: 2 as const, fret: 8 },
				{ string: 1 as const, fret: 8 }
			]
		};
		render(FigureView, {
			props: {
				controller: running(),
				model: breath({
					settled: [{ ...FAILED, expected: shape }],
					prompt: { primary: 'Do', secondary: null }
				})
			}
		});
		const expected = screen.getByTestId('figure-expected');
		expect(expected.textContent).toContain('Forme attendue');
		expect(expected.querySelector('.chord-shape')).toBeTruthy();
	});

	it('shows no shape after a failed round that derives none', () => {
		render(FigureView, { props: { controller: running(), model: breath() } });
		expect(screen.queryByTestId('figure-expected')).toBeNull();
	});

	it('tells the wrong notes of the cycle by their place, and marks them apart', async () => {
		const wrong: SettledCycle = {
			report: {
				...REPORT,
				expectations: ALL_PLAYED.map((e) =>
					e.index === 1 ? { ...e, verdict: 'wrong-pitch' as const } : e
				)
			},
			verdict: { passed: false, reasons: ['wrong-pitch'] },
			// The offbeats' second note, an eighth after the downbeat.
			wrongNotes: [{ at: Fraction.of(1, 8), index: 1, gap: 'A au lieu de G' }],
			expected: null
		};
		render(FigureView, { props: { controller: running(), model: breath({ settled: [wrong] }) } });
		expect(screen.getByTestId('figure-feedback').textContent).toContain(
			'Mesure 1, temps 1 : A au lieu de G'
		);
		await engraved(2);
		await vi.waitFor(() => expect(screen.getAllByTestId('figure-mark')).toHaveLength(5));
		expect(screen.getAllByTestId('figure-mark').map((m) => m.dataset.kind)[1]).toBe('wrong-pitch');
		expect(screen.getByRole('img', { name: 'fausse' })).toBeTruthy();
	});

	it('in summary, tells each cycle passed or failed, without marks', async () => {
		render(FigureView, {
			props: {
				controller: running(),
				model: breath({
					feedback: 'summary',
					settled: [
						{ report: REPORT, verdict: { passed: true }, wrongNotes: [], expected: null },
						FAILED
					]
				})
			}
		});
		await engraved(2);
		expect(screen.getAllByTestId('figure-cycle').map((c) => c.textContent?.trim())).toEqual([
			'cycle 1 · réussi',
			'cycle 2 · raté'
		]);
		expect(screen.queryAllByTestId('figure-mark')).toHaveLength(0);
	});

	it('writes a lost beat above its bar at the breath', async () => {
		const lost: SettledCycle = {
			report: { ...REPORT, shift: { bar: 0, byS: -0.4 } },
			verdict: { passed: false, reasons: ['shift'] },
			wrongNotes: [],
			expected: null
		};
		render(FigureView, {
			props: { controller: running(), model: breath({ settled: [lost] }) }
		});
		await engraved();
		await vi.waitFor(() =>
			expect(screen.getByTestId('figure-shift').textContent).toBe('temps perdu')
		);
	});

	it('leaves the announcements to the frame: no line of its own, playing or breathing', () => {
		render(FigureView, {
			props: { controller: running(), model: model({ phase: 'listening' }) }
		});
		expect(screen.queryByRole('status')).toBeNull();
		cleanup();
		render(FigureView, {
			props: { controller: running(), model: breath({ level: { shown: 0, of: 4, aid: true } }) }
		});
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('gives the term of the feedback its definition, and drops the plain words later', async () => {
		render(FigureView, { props: { controller: running(), model: breath() } });
		const term = screen.getByTestId('figure-feedback').querySelector('.term-first');
		expect(term).toBeTruthy();
		cleanup();
		render(FigureView, {
			props: { controller: running(), model: breath({ plainWords: false }) }
		});
		expect(screen.getByTestId('figure-feedback').textContent).toContain('fidélité à la figure 4/5');
	});

	it('offers « Écouter la figure » with its key when the level lets the figure be heard', async () => {
		const controller = running();
		render(FigureView, { props: { controller, model: model() } });
		const button = screen.getByRole('button', { name: /écouter la figure/i });
		expect(button.textContent).toContain('E');
		await fireEvent.click(button);
		expect(controller.calls).toEqual(['listen']);
	});

	it('hides « Écouter la figure » when the level gives no listening', () => {
		render(FigureView, {
			props: { controller: running(), model: model({ listen: 'none' }) }
		});
		expect(screen.queryByRole('button', { name: /écouter la figure/i })).toBeNull();
	});

	it('offers « Réécouter » at the breath only, and shows the replay under way', async () => {
		const controller = running();
		const { rerender } = render(FigureView, { props: { controller, model: model() } });
		expect(screen.queryByRole('button', { name: /réécouter/i })).toBeNull();
		await rerender({ controller, model: breath() });
		await fireEvent.click(screen.getByRole('button', { name: /réécouter/i }));
		expect(controller.calls).toEqual(['replay']);
		const busy = screen.getByRole('button', { name: /réécoute…/i });
		expect((busy as HTMLButtonElement).disabled).toBe(true);
		controller.finishReplay();
		await vi.waitFor(() => expect(screen.getByRole('button', { name: /réécouter/i })).toBeTruthy());
	});
});
