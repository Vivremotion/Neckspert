import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RhythmStageModel, SettledCycle } from '$lib/application/session/cycle/rhythmStage';
import { RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS } from '$lib/domain/exercise/rhythmCatalog';
import { Fraction, type CycleReport, type Figure } from '$lib/domain/time';
import { PLAY_VIEWS } from './index';
import RhythmFigureView from './RhythmFigureView.svelte';
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
	verdict: { passed: false, reasons: ['missed'] }
};

function model(overrides: Partial<RhythmStageModel> = {}): RhythmStageModel {
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
		...overrides
	};
}

function breath(overrides: Partial<RhythmStageModel> = {}): RhythmStageModel {
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

describe('RhythmFigureView', () => {
	it('is the view of the rhythm exercises', () => {
		expect(PLAY_VIEWS['rhythm-figure']).toBe(RhythmFigureView);
	});

	it('names the exercise, its level and its tempo with its unit', () => {
		render(RhythmFigureView, { props: { controller: running(), model: model() } });
		expect(screen.getByTestId('rhythm-header').textContent?.trim()).toBe(
			'Contretemps · niveau 3 sur 6 · ♩ = 90 bpm'
		);
	});

	it('engraves the figure large while it is played, with its bar and the click in words', async () => {
		render(RhythmFigureView, {
			props: { controller: running(), model: model({ barInCycle: 1, cycleBars: 4 }) }
		});
		await engraved();
		expect(screen.getByTestId('rhythm-bar').textContent).toContain('mesure 2 / 4');
		expect(screen.getByTestId('rhythm-bar').textContent).toContain('clic');
		expect(screen.getByTestId('rhythm-cursor')).toBeTruthy();
		// Nothing about the player's attacks while playing.
		expect(screen.queryAllByTestId('rhythm-mark')).toHaveLength(0);
	});

	it('never shows the cursor in a muted bar, and says « silence »', async () => {
		render(RhythmFigureView, {
			props: { controller: running(), model: model({ muted: true }) }
		});
		await engraved();
		expect(screen.queryByTestId('rhythm-cursor')).toBeNull();
		expect(screen.getByTestId('rhythm-bar').textContent).toContain('silence');
	});

	it('at the breath, puts the run played (faded, with its marks) before the figure to play', async () => {
		render(RhythmFigureView, { props: { controller: running(), model: breath() } });
		const played = screen.getByTestId('rhythm-played');
		const next = screen.getByTestId('rhythm-next');
		expect(played.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(played.classList.contains('faded')).toBe(true);
		expect(next.classList.contains('faded')).toBe(false);
		await engraved(2);
		await vi.waitFor(() => expect(screen.getAllByTestId('rhythm-mark')).toHaveLength(5));
		const kinds = screen.getAllByTestId('rhythm-mark').map((m) => m.dataset.kind);
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
			render(RhythmFigureView, { props: { controller, model: breath() } });
			await engraved(2);
			const late = await vi.waitFor(() => {
				const mark = screen.getAllByTestId('rhythm-mark').find((m) => m.dataset.kind === 'late');
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
			verdict: { passed: true }
		};
		render(RhythmFigureView, {
			props: {
				controller: running(),
				model: breath({ figure: eighths, next: eighths, cycleBars: 12, settled: [cycle, cycle] })
			}
		});
		await vi.waitFor(() => expect(screen.getAllByTestId('rhythm-line').length).toBeGreaterThan(1));
		const blocks = [
			...screen.getByTestId('rhythm-played').querySelectorAll('[data-line]')
		] as HTMLElement[];
		// Line 0, its two strips, line 1, its two strips…
		const order = blocks.map((b) => `${b.dataset.testid}:${b.dataset.line}`);
		const lines = screen.getAllByTestId('rhythm-line').length;
		expect(order).toEqual(
			Array.from({ length: lines }, (_, line) => [
				`rhythm-line:${line}`,
				`rhythm-strip:${line}`,
				`rhythm-strip:${line}`
			]).flat()
		);
		// Each line shows its own part of the engraving, and its strips its own marks.
		const strips = screen.getAllByTestId('rhythm-strip');
		expect(strips.every((s) => s.querySelectorAll('[data-testid="rhythm-mark"]').length > 0)).toBe(
			true
		);
		expect(screen.getAllByTestId('rhythm-mark')).toHaveLength(192);
	});

	it('tells the cycle in plain words, the term as a label', () => {
		render(RhythmFigureView, {
			props: {
				controller: running(),
				model: breath({
					settled: [
						{
							report: { ...REPORT, expectations: ALL_PLAYED },
							verdict: { passed: false, reasons: ['regularity'] }
						}
					]
				})
			}
		});
		const line = screen.getByTestId('rhythm-feedback');
		expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('Irrégulier (± 31 ms) · régularité');
		expect(line.querySelector('.term')?.textContent).toBe('régularité');
	});

	it('tells the reason the judge failed the cycle for, not a measure that passed', () => {
		render(RhythmFigureView, {
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
							verdict: { passed: false, reasons: ['regularity'] }
						}
					]
				})
			}
		});
		expect(screen.getByTestId('rhythm-feedback').textContent).toContain('Irrégulier (± 45 ms)');
	});

	it('in summary, tells each cycle passed or failed, without marks', async () => {
		render(RhythmFigureView, {
			props: {
				controller: running(),
				model: breath({
					feedback: 'summary',
					settled: [{ report: REPORT, verdict: { passed: true } }, FAILED]
				})
			}
		});
		await engraved(2);
		expect(screen.getAllByTestId('rhythm-cycle').map((c) => c.textContent?.trim())).toEqual([
			'cycle 1 · réussi',
			'cycle 2 · raté'
		]);
		expect(screen.queryAllByTestId('rhythm-mark')).toHaveLength(0);
	});

	it('writes a lost beat above its bar at the breath', async () => {
		const lost: SettledCycle = {
			report: { ...REPORT, shift: { bar: 0, byS: -0.4 } },
			verdict: { passed: false, reasons: ['shift'] }
		};
		render(RhythmFigureView, {
			props: { controller: running(), model: breath({ settled: [lost] }) }
		});
		await engraved();
		await vi.waitFor(() =>
			expect(screen.getByTestId('rhythm-shift').textContent).toBe('temps perdu')
		);
	});

	it('leaves the announcements to the frame: no line of its own, playing or breathing', () => {
		render(RhythmFigureView, {
			props: { controller: running(), model: model({ phase: 'listening' }) }
		});
		expect(screen.queryByRole('status')).toBeNull();
		cleanup();
		render(RhythmFigureView, {
			props: { controller: running(), model: breath({ level: { shown: 0, of: 4, aid: true } }) }
		});
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('gives the term of the feedback its definition, and drops the plain words later', async () => {
		render(RhythmFigureView, { props: { controller: running(), model: breath() } });
		const term = screen.getByTestId('rhythm-feedback').querySelector('.term-first');
		expect(term).toBeTruthy();
		cleanup();
		render(RhythmFigureView, {
			props: { controller: running(), model: breath({ plainWords: false }) }
		});
		expect(screen.getByTestId('rhythm-feedback').textContent).toContain('fidélité à la figure 4/5');
	});

	it('offers « Écouter la figure » with its key when the level lets the figure be heard', async () => {
		const controller = running();
		render(RhythmFigureView, { props: { controller, model: model() } });
		const button = screen.getByRole('button', { name: /écouter la figure/i });
		expect(button.textContent).toContain('E');
		await fireEvent.click(button);
		expect(controller.calls).toEqual(['listen']);
	});

	it('hides « Écouter la figure » when the level gives no listening', () => {
		render(RhythmFigureView, {
			props: { controller: running(), model: model({ listen: 'none' }) }
		});
		expect(screen.queryByRole('button', { name: /écouter la figure/i })).toBeNull();
	});

	it('offers « Réécouter » at the breath only, and shows the replay under way', async () => {
		const controller = running();
		const { rerender } = render(RhythmFigureView, { props: { controller, model: model() } });
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
