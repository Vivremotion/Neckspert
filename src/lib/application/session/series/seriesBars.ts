import { Fraction, POSITION_RESOLUTION, type TempoMap } from '$lib/domain/time';

/** Absorbs the float error of an instant converted to a position and back. */
const TIME_EPSILON_S = 1e-9;

/** The first whole bar at or after `bar`. */
export function ceilBar(bar: Fraction): number {
	return Math.ceil(bar.toNumber() - TIME_EPSILON_S);
}

/** The bar of an instant, rounded up to the map's grid: a wake-up there is never early. */
export function barAtOrAfter(map: TempoMap, barLength: Fraction, time: number): Fraction {
	let position = map.toPosition(time);
	if (map.toSeconds(position) < time - TIME_EPSILON_S) {
		position = position.add(Fraction.of(1, POSITION_RESOLUTION));
	}
	return position.div(barLength);
}
