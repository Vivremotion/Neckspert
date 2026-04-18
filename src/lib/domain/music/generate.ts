import { shapesByQuality } from '$lib/data/chordPositions';
import { normalizePitch, isFlat } from './Pitch';
import type { PitchName } from './Pitch';
import { shapeToVoicing } from './transpose';
import type { Shape } from './Shape';
import type { Voicing } from './Voicing';

/**
 * Generate all available Voicings for a given root pitch.
 * One Voicing is produced per (quality, shape) pair.
 */
export function generateVoicings(root: PitchName, displayRoot?: string): Voicing[] {
	const voicings: Voicing[] = [];

	for (const [quality, shapes] of Object.entries(shapesByQuality) as [string, Shape[]][]) {
		for (const shape of shapes) {
			voicings.push(shapeToVoicing(shape, { root, quality }, displayRoot));
		}
	}

	return voicings;
}

/**
 * Generate all Voicings for a given root and a specific quality suffix.
 */
export function generateVoicingsForQuality(
	root: PitchName,
	quality: string,
	displayRoot?: string
): Voicing[] {
	const shapes: Shape[] | undefined = shapesByQuality[quality];
	if (!shapes) return [];
	return shapes.map((shape) => shapeToVoicing(shape, { root, quality }, displayRoot));
}

/**
 * Normalise a raw root string (may include flat spelling) and return
 * the canonical root + optional displayRoot.
 */
export function parseRoot(raw: string): { root: PitchName; displayRoot?: string } | null {
	if (!raw) return null;
	const upper = raw[0].toUpperCase() + raw.slice(1);
	const root = normalizePitch(upper);
	return {
		root,
		displayRoot: isFlat(upper) ? upper : undefined
	};
}
