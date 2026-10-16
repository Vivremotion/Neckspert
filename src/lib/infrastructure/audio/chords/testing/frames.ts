import type { AudioFrame, FrameSource } from '../../input/WebAudioInput';

export const FRAME_SIZE = 512;

/** Plays a signal to the verifier in 512-sample frames, on demand, like the worklet does. */
export class FakeFrameSource implements FrameSource {
	private readonly listeners = new Set<(frame: AudioFrame) => void>();
	private played = 0;

	constructor(
		readonly sampleRate: number,
		private readonly signal: Float32Array,
		/** Audio time (s) of the signal's first sample. */
		private readonly startTime = 0
	) {}

	/** How many callbacks are listening. */
	get subscribers(): number {
		return this.listeners.size;
	}

	onFrame(callback: (frame: AudioFrame) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Plays the signal up to `untilS` seconds (whole frames), or to its end. */
	playUntil(untilS = Infinity): void {
		const last = Math.min(this.signal.length, Math.floor(untilS * this.sampleRate));
		while (this.played + FRAME_SIZE <= last) {
			const frame = {
				samples: this.signal.slice(this.played, this.played + FRAME_SIZE),
				frameTime: this.startTime + this.played / this.sampleRate
			};
			this.played += FRAME_SIZE;
			this.listeners.forEach((listener) => listener(frame));
		}
	}
}
