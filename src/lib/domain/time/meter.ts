import { Fraction } from './fraction';

/**
 * A time signature. `count` units of length `unit` (a fraction of a whole note) fill a bar;
 * `grouping` splits those units into beats (`[3, 3]` for 6/8), so it sums to `count`.
 */
export interface Meter {
	count: number;
	unit: Fraction;
	grouping: number[];
}

export const METER_4_4: Meter = { count: 4, unit: Fraction.of(1, 4), grouping: [1, 1, 1, 1] };

/** Null when the meter is well formed, else what is wrong with it. */
export function validateMeter(meter: Meter): string | null {
	if (!Number.isInteger(meter.count) || meter.count < 1) {
		return `meter count must be a positive integer, got ${meter.count}`;
	}
	if (meter.unit.n <= 0) return `meter unit must be positive, got ${meter.unit}`;
	if (!meter.grouping.every((g) => Number.isInteger(g) && g >= 1)) {
		return 'meter grouping must list positive integers';
	}
	const total = meter.grouping.reduce((a, b) => a + b, 0);
	if (total !== meter.count) {
		return `meter grouping sums to ${total}, expected ${meter.count}`;
	}
	return null;
}

/** The length of one bar, as a fraction of a whole note. */
export function barLength(meter: Meter): Fraction {
	return meter.unit.mul(Fraction.of(meter.count));
}

/** Where each beat starts within a bar. Throws when the grouping does not fill the bar. */
export function beatPositions(meter: Meter): Fraction[] {
	const problem = validateMeter(meter);
	if (problem) throw new RangeError(problem);
	const positions: Fraction[] = [];
	let at = Fraction.ZERO;
	for (const units of meter.grouping) {
		positions.push(at);
		at = at.add(meter.unit.mul(Fraction.of(units)));
	}
	return positions;
}
