import { mutedBarsFrom } from '../accompaniment';
import type { Figure } from '../figure';
import { Fraction } from '../fraction';
import { barLength } from '../meter';
import { figureExpectations, type ExpectationWindow, type RoundPlan } from '../plan';

/**
 * For specs: the plan of a cycle as the rhythm compiles it, a figure looped over `cycleBars` bars
 * from bar `startBar` of its loop, its accompaniment's muted bars turned with it; no prompt, an
 * alignment judged by the cycle verdict, handed over at its end.
 */
export function cyclePlan(input: {
	figure: Figure;
	cycleBars: number;
	startBar: number;
	sensor: string;
	window: ExpectationWindow;
	accompanimentBars: ('on' | 'off')[];
}): RoundPlan {
	const { figure, cycleBars, startBar, sensor, window, accompanimentBars } = input;
	const length = barLength(figure.meter).mul(Fraction.of(cycleBars));
	return {
		prompt: null,
		expectations: figureExpectations({
			figure,
			at: Fraction.ZERO,
			bars: cycleBars,
			startBar,
			sensor,
			window,
			content: () => null
		}),
		length,
		policy: { unit: 'cycle', pairing: { mode: 'alignment' }, verdict: 'cycle', correction: false },
		handover: length,
		mutedBars: mutedBarsFrom(accompanimentBars, startBar, cycleBars)
	};
}
