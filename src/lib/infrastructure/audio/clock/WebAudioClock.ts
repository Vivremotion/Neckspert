import type { AudioClockPort } from '$lib/application/ports';

/** The shared audio clock. Owns the single AudioContext, created on the first resume(). */
export class WebAudioClock implements AudioClockPort {
	private audioContext: AudioContext | null = null;

	constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

	async resume(): Promise<void> {
		if (!this.audioContext) this.audioContext = this.createContext();
		// Safari reports 'interrupted' after a phone call; it needs resume() too.
		if (this.audioContext.state !== 'running') await this.audioContext.resume();
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
