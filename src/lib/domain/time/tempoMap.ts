import { Fraction } from './fraction';

/** `toPosition` rounds to this many steps per whole note (a 1/3840 of a whole note). */
export const POSITION_RESOLUTION = 3840;

/**
 * From `at` (a fraction of a whole note) on, `bpm` beats of length `unit` (a fraction of a
 * whole note) fall each minute. `ramp` is reserved for gradual tempo changes.
 */
export interface TempoSegment {
	at: Fraction;
	bpm: number;
	unit: Fraction;
	ramp?: 'linear';
}

export interface TempoMap {
	/** Seconds at the first segment's `at` (position 0 in the usual case). */
	readonly origin: number;
	readonly segments: readonly TempoSegment[];
	toSeconds(position: Fraction): number;
	/** The position at `seconds`, rounded to 1/3840 of a whole note. */
	toPosition(seconds: number): Fraction;
	/** A new map with `segment` added after the last one. Throws unless it starts later. */
	withSegment(segment: TempoSegment): TempoMap;
}

/** Seconds in one whole note at this segment's tempo. */
function secondsPerWhole(segment: TempoSegment): number {
	return 60 / segment.bpm / segment.unit.toNumber();
}

function checkSegment(segment: TempoSegment): void {
	if (segment.ramp !== undefined) throw new Error('tempo ramp is not supported yet');
	if (!Number.isFinite(segment.bpm) || segment.bpm <= 0) {
		throw new RangeError(`tempo bpm must be positive, got ${segment.bpm}`);
	}
	if (segment.unit.n <= 0) throw new RangeError(`tempo unit must be positive, got ${segment.unit}`);
}

/**
 * Time at the first segment's `at` is `origin` seconds. The first segment's tempo also holds
 * before its `at`. Segments must be listed in strictly increasing order of `at`.
 */
export function createTempoMap(origin: number, segments: TempoSegment[]): TempoMap {
	if (segments.length === 0) throw new RangeError('tempo map is empty');
	if (!Number.isFinite(origin))
		throw new RangeError(`tempo map origin must be finite, got ${origin}`);
	for (const [i, segment] of segments.entries()) {
		checkSegment(segment);
		if (i > 0 && segments[i - 1].at.compare(segment.at) >= 0) {
			throw new RangeError('tempo segments must be sorted by strictly increasing position');
		}
	}
	const list = [...segments];
	// Seconds at the start of each segment, built once.
	const starts: number[] = [origin];
	for (let i = 1; i < list.length; i++) {
		const length = list[i].at.sub(list[i - 1].at).toNumber();
		starts.push(starts[i - 1] + length * secondsPerWhole(list[i - 1]));
	}

	return {
		origin,
		segments: list,
		toSeconds(position) {
			let i = 0;
			while (i + 1 < list.length && list[i + 1].at.compare(position) <= 0) i++;
			const offset = position.sub(list[i].at).toNumber();
			return starts[i] + offset * secondsPerWhole(list[i]);
		},
		toPosition(seconds) {
			let i = 0;
			while (i + 1 < list.length && starts[i + 1] <= seconds) i++;
			const offset = (seconds - starts[i]) / secondsPerWhole(list[i]);
			const steps = Math.round(offset * POSITION_RESOLUTION);
			return list[i].at.add(Fraction.of(steps, POSITION_RESOLUTION));
		},
		withSegment(segment) {
			return createTempoMap(origin, [...list, segment]);
		}
	};
}
