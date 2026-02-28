import type { HPCPComparisonResult } from '$lib/models/HPCPComparisonResult';
import type { DetectionThresholds } from './DetectionThresholds';
import { DEFAULT_DETECTION_THRESHOLDS } from './DetectionThresholds';

/**
 * Pure domain service: compares two HPCP (Harmonic Pitch Class Profile) arrays
 * and returns similarity metrics. No side effects, no I/O.
 */
export function compareHPCP(
	expected: number[],
	detected: number[],
	thresholds: Partial<DetectionThresholds> = {}
): HPCPComparisonResult {
	if (expected.length !== detected.length) {
		throw new Error('HPCP profiles must have the same length');
	}

	const {
		similarityThreshold = DEFAULT_DETECTION_THRESHOLDS.similarityThreshold,
		differenceThreshold = DEFAULT_DETECTION_THRESHOLDS.differenceThreshold
	} = thresholds;

	const absoluteDifferences = expected.map((val, i) => Math.abs(val - detected[i]));
	const averageDifference =
		absoluteDifferences.reduce((sum, diff) => sum + diff, 0) / expected.length;
	const maxDifference = Math.max(...absoluteDifferences);
	const significantDifferenceIndices = absoluteDifferences
		.map((diff, index) => (diff > differenceThreshold ? index : -1))
		.filter((index) => index !== -1);

	const dotProduct = expected.reduce((sum, val, i) => sum + val * detected[i], 0);
	const magnitude1 = Math.sqrt(expected.reduce((sum, val) => sum + val * val, 0));
	const magnitude2 = Math.sqrt(detected.reduce((sum, val) => sum + val * val, 0));
	const cosineSimilarity = magnitude1 * magnitude2 > 0 ? dotProduct / (magnitude1 * magnitude2) : 0;

	const rmsDifference = Math.sqrt(
		absoluteDifferences.reduce((sum, diff) => sum + diff * diff, 0) / expected.length
	);

	return {
		isExactMatch: absoluteDifferences.every((d) => d === 0),
		isSimilar: cosineSimilarity >= similarityThreshold,
		absoluteDifferences,
		averageDifference,
		maxDifference,
		significantDifferenceIndices,
		cosineSimilarity,
		rmsDifference
	};
}
