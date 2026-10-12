import type { AudioClockPort } from '$lib/application/ports';

/**
 * Audio a freshly started output has played before a sound is heard whole. Measured 2026-10-12:
 * right after the microphone opens, the context clock has barely started (about 10 ms), and the
 * first click scheduled 0.1 s later was lost on a Fractal FM3 and on the Mac's speakers alike.
 * To calibrate.
 */
export const OUTPUT_WARMUP_S = 0.5;
/** The longest settle() waits, for a clock that does not move. */
export const SETTLE_TIMEOUT_MS = 2000;
const SETTLE_POLL_MS = 20;

/** The shared audio clock. Owns the single AudioContext, created on the first resume(). */
export class WebAudioClock implements AudioClockPort {
	private audioContext: AudioContext | null = null;

	constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

	async resume(): Promise<void> {
		if (!this.audioContext) this.audioContext = this.createContext();
		// Safari reports 'interrupted' after a phone call; it needs resume() too.
		if (this.audioContext.state !== 'running') await this.audioContext.resume();
	}

	/** Resolves once the output has played OUTPUT_WARMUP_S (at once for an output running already). */
	async settle(): Promise<void> {
		const context = this.context();
		const deadline = Date.now() + SETTLE_TIMEOUT_MS;
		while (context.currentTime < OUTPUT_WARMUP_S && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
		}
	}

	/** The shared AudioContext. Throws until resume() has been called. */
	context(): AudioContext {
		if (!this.audioContext) {
			throw new Error('AudioContext not created yet: call resume() from a user gesture first');
		}
		return this.audioContext;
	}

	now(): number {
		return this.context().currentTime;
	}

	/** Storage conversion only: musical timing never leaves the audio clock. */
	toEpochMs(audioTime: number): number {
		const context = this.context();
		if (typeof context.getOutputTimestamp === 'function') {
			const { contextTime, performanceTime } = context.getOutputTimestamp();
			if (contextTime !== undefined && performanceTime) {
				return performance.timeOrigin + performanceTime + (audioTime - contextTime) * 1000;
			}
		}
		return Date.now() - (context.currentTime - audioTime) * 1000;
	}
}
