import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Fraction, METER_4_4, type Figure } from '$lib/domain/time';
import type { SessionSummary } from '$lib/domain/types';
import SummaryScreen from './SummaryScreen.svelte';

// jsdom has no canvas, and VexFlow measures its text on one: a fixed-size stand-in.
beforeAll(() => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
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
	vi.unstubAllGlobals();
});
afterEach(cleanup);

const quarter = { kind: 'note', duration: Fraction.of(1, 4), content: null } as const;
const figure: Figure = {
	schema: 1,
	meter: METER_4_4,
	bars: 1,
	voices: [{ id: 'main', elements: [quarter, quarter, quarter, quarter] }]
};

const summary = {
	sessionId: 's1',
	pool: 'cold',
	attemptCount: 1,
	correctCount: 0,
	medianOffsetMs: null,
	identifyMedianReactionMs: null,
	learnedCount: 0,
	pendingCount: 0,
	knownCount: 0,
	fatigueDetected: false,
	nextReviewAt: null,
	grade: null,
	tempoBpm: 80,
	kind: 'exercise',
	exercise: {
		exerciseId: 'rhythm-offbeats',
		levelReached: { shown: 1, of: 4, aid: false },
		cycles: 1,
		successes: 0,
		aided: 0,
		lastCycle: {
			verdict: { passed: false, reasons: ['missed'] },
			thresholds: { precision: 60, regularity: 40, holdOffset: 60, holdDrift: 25 },
			played: { figure, cycleBars: 1, tempoBpm: 80 },
			report: {
				expectations: [
					{ index: 0, verdict: 'on-time', offsetMs: 3 },
					{ index: 1, verdict: 'early', offsetMs: -70 },
					{ index: 2, verdict: 'late', offsetMs: 95 },
					{ index: 3, verdict: 'missed', offsetMs: null }
				],
				dropped: [],
				extra: 0,
				measures: {},
				latency: { ms: 42, provenance: 'system' }
			}
		}
	}
} as unknown as SessionSummary;

describe('SummaryScreen of a rhythm session', () => {
	it('engraves the played cycle with one mark per expected note, before the text report', async () => {
		render(SummaryScreen, {
			props: { summary, now: 0, onhome: () => {}, onmap: () => {}, development: true }
		});
		await waitFor(() => expect(screen.getAllByTestId('rhythm-mark')).toHaveLength(4));
		expect(
			screen.getAllByTestId('rhythm-mark').map((mark) => mark.getAttribute('data-kind'))
		).toEqual(['on-time', 'early', 'late', 'missed']);
		const strip = screen.getByTestId('rhythm-strip');
		const report = screen.getByText('Cycle raté');
		expect(strip.compareDocumentPosition(report) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
