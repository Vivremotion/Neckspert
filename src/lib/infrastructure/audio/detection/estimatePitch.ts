import { PitchDetector } from 'pitchy';

export function estimatePitch(
	samples: Float32Array,
	sampleRate: number,
	clarityThreshold: number
): { frequencyHz: number; clarity: number } | null {
	if (samples.length === 0) return null;
	const detector = PitchDetector.forFloat32Array(samples.length);
	const [frequencyHz, clarity] = detector.findPitch(samples, sampleRate);
	if (!(frequencyHz > 0) || clarity < clarityThreshold) return null;
	return { frequencyHz, clarity };
}
