import { median } from '$lib/domain/stats';

/**
 * Median offset and median absolute deviation.
 * Returns null when `offsetsMs` is empty or the MAD exceeds `maxSpreadMs`.
 * Callers must already drop offsets farther than half a beat.
 */
export function computeCalibration(
	offsetsMs: readonly number[],
	maxSpreadMs: number
): { offsetMs: number; spreadMs: number } | null {
	if (offsetsMs.length === 0) return null;

	const offset = median(offsetsMs);
	if (offset === null) return null;

	const deviations = offsetsMs.map((value) => Math.abs(value - offset));
	const spread = median(deviations);
	if (spread === null) return null;
	if (spread > maxSpreadMs) return null;

	return {
		offsetMs: Math.round(offset),
		spreadMs: Math.round(spread)
	};
}
