import type { DetectorConfig } from './config';

function rmsOf(frame: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
	return Math.sqrt(sum / Math.max(1, frame.length));
}

/** Finds a sharp RMS rise against a slow envelope; returns attack time (audio s) or null. */
export class OnsetDetector {
	private envelope = 0;
	private cooldownUntil = -Infinity;
	private readonly alpha: number;
	private readonly cooldownS: number;

	constructor(
		private readonly config: DetectorConfig,
		private readonly sampleRate: number
	) {
		// Slow envelope: ~200 ms time constant.
		const frameS = 512 / sampleRate;
		this.alpha = 1 - Math.exp(-frameS / 0.2);
		this.cooldownS = config.cooldownMs / 1000;
	}

	push(frame: Float32Array, frameTime: number): number | null {
		const rms = rmsOf(frame);
		const prevEnvelope = this.envelope;
		this.envelope = (1 - this.alpha) * this.envelope + this.alpha * rms;

		if (frameTime < this.cooldownUntil) return null;
		if (rms < this.config.minRms) return null;
		const floor = Math.max(this.config.minRms, prevEnvelope * this.config.onsetRatio);
		if (rms < floor) return null;

		const attackTime = this.refineAttackTime(frame, frameTime, floor);
		this.cooldownUntil = attackTime + this.cooldownS;
		return attackTime;
	}

	private refineAttackTime(frame: Float32Array, frameTime: number, threshold: number): number {
		const window = Math.min(64, frame.length);
		for (let i = 0; i + window <= frame.length; i += 16) {
			let sum = 0;
			for (let j = 0; j < window; j++) sum += frame[i + j] * frame[i + j];
			const local = Math.sqrt(sum / window);
			if (local >= threshold) {
				return frameTime + i / this.sampleRate;
			}
		}
		return frameTime;
	}
}
