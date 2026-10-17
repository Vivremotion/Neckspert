import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionSummary } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import SummaryScreen from './SummaryScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

const failed: SessionSummary = {
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
			verdict: { passed: false, reasons: ['missed', 'extra', 'precision'] },
			thresholds: { precision: 60, regularity: 40, holdOffset: 60, holdDrift: 25 },
			report: {
				expectations: [
					{ index: 0, verdict: 'perfect', offsetMs: -12.4 },
					{ index: 1, verdict: 'late', offsetMs: 95 },
					{ index: 2, verdict: 'missed', offsetMs: null }
				],
				dropped: [],
				extra: 2,
				shift: { bar: 2, byS: -0.5 },
				measures: {
					fidelity: { value: 2 / 3, unit: 'ratio' },
					placement: { value: 41, unit: 'ms' },
					precision: { value: 80, unit: 'ms' },
					regularity: { value: 30, unit: 'ms' },
					holdOffset: { value: 70, unit: 'ms' },
					holdDrift: { value: 3, unit: 'ms/bar' }
				},
				latency: { ms: 42, provenance: 'system' }
			}
		}
	}
} as unknown as SessionSummary;

const props = (summary: SessionSummary) => ({
	summary,
	now: 0,
	// The judge's full report is shown in development builds only.
	development: true,
	onhome: () => {},
	onmap: () => {}
});

describe('SummaryScreen of a one-cycle rhythm series', () => {
	it('reports the verdict, every measure with its limit, the shift, and the latency, without a line per note', () => {
		render(SummaryScreen, { props: props(failed) });
		const text = document.body.textContent ?? '';
		for (const part of [
			'Cycle raté',
			'Raisons : notes oubliées, notes en trop, précision',
			'Précision : 80 ms (limite 60 ms, au-delà de la limite)',
			'Régularité : 30 ms (limite 40 ms, dans la limite)',
			'Tenue, décalage : 70 ms (limite 60 ms, au-delà de la limite)',
			'Tenue, dérive : 3 ms/mesure (limite 25 ms/mesure, dans la limite)',
			'Placement : +41 ms',
			'Fidélité : 2 notes jouées sur 3, 1 oubliée, 2 en trop',
			'Décalage de temps : mesure 3, temps perdu (500 ms)',
			'Latence mesurée : 42 ms'
		]) {
			expect(text).toContain(part);
		}
		expect(text).not.toContain('Note 1 :');
	});

	it('says it in English, and when placement and precision were not judged', () => {
		i18n.locale = 'en';
		const last = failed.exercise!.lastCycle!;
		const player: SessionSummary = {
			...failed,
			exercise: {
				...failed.exercise!,
				lastCycle: {
					...last,
					verdict: { passed: true },
					report: { ...last.report, latency: { ms: 30, provenance: 'player' } }
				}
			}
		};
		render(SummaryScreen, { props: props(player) });
		const text = document.body.textContent ?? '';
		for (const part of [
			'Cycle passed',
			'Precision: 80 ms (not judged)',
			'Placement: +41 ms (not judged)',
			"Player's latency: 30 ms (placement and precision not judged)",
			'Fidelity: 2 of 3 notes played, 1 missed, 2 added',
			'Time shift: bar 3, beat lost (500 ms)'
		]) {
			expect(text).toContain(part);
		}
	});
});
