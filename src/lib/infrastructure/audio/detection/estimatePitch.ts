import { PitchDetector } from 'pitchy';

/** Raw pitchy reading. Clarity is not gated; a non-positive frequency is returned as 0. */
export function readPitch(
	samples: Float32Array,
	sampleRate: number
): { frequencyHz: number; clarity: number } {
	if (samples.length === 0) return { frequencyHz: 0, clarity: 0 };
	const detector = PitchDetector.forFloat32Array(samples.length);
	const [frequencyHz, clarity] = detector.findPitch(samples, sampleRate);
	return {
		frequencyHz: frequencyHz > 0 && Number.isFinite(frequencyHz) ? frequencyHz : 0,
		clarity: Number.isFinite(clarity) ? clarity : 0
	};
}

export function estimatePitch(
	samples: Float32Array,
	sampleRate: number,
	clarityThreshold: number
): { frequencyHz: number; clarity: number } | null {
	const reading = readPitch(samples, sampleRate);
	if (!(reading.frequencyHz > 0) || reading.clarity < clarityThreshold) return null;
	return reading;
}
