import type { DiagnosticSink } from '$lib/application/ports';
import type { FrameSource } from '$lib/infrastructure/audio/chords';
import type { AudioFrame } from '$lib/infrastructure/audio/input';
import { createDownsampler, DIAGNOSTIC_SAMPLE_RATE, type Downsampler } from './downsample';

/** Length of each audio block written to the journal. */
export const DIAGNOSTIC_CHUNK_S = 10;

const INT16_MAX = 32767;

function toInt16(value: number): number {
	const scaled = Math.round(value * INT16_MAX);
	return scaled > INT16_MAX ? INT16_MAX : scaled < -INT16_MAX ? -INT16_MAX : scaled;
}

/** The input's samples as they are: nothing to filter, no delay. */
function passThrough(): Downsampler {
	return { push: (samples) => samples, reset: () => {}, delayS: 0 };
}

/**
 * Keeps the sound of a take: the input's frames, brought down to 16 kHz in 16 bits, sent to the
 * journal in blocks of DIAGNOSTIC_CHUNK_S seconds. A gap between frames is written as
 * `input.gap` and starts a new block, the resampler starting again from silence. When the journal
 * asks for the native rate (a development option, read at `start`), the frames are kept at the
 * input's rate, untouched, so the transients above 8 kHz can be replayed.
 */
export class DiagnosticAudioRecorder {
	/** Rate of the blocks sent to the journal, set at `start`. */
	private outputRate = DIAGNOSTIC_SAMPLE_RATE;
	private chunkLength = DIAGNOSTIC_CHUNK_S * DIAGNOSTIC_SAMPLE_RATE;
	private unsubscribe: (() => void) | null = null;
	private downsampler: Downsampler | null = null;
	private pending = new Int16Array(this.chunkLength);
	private pendingLength = 0;
	/** Audio time of the first input sample since the last reset, and output samples since it. */
	private segmentStart = 0;
	private segmentProduced = 0;
	private lastEnd: number | null = null;

	constructor(private readonly sink: DiagnosticSink) {}

	/** Called by the input when it opens: subscribes only if the journal is on. */
	start(source: FrameSource): void {
		this.stop();
		if (!this.sink.enabled) return;
		const native = this.sink.nativeRate === true;
		this.outputRate = native ? source.sampleRate : DIAGNOSTIC_SAMPLE_RATE;
		this.downsampler = native ? passThrough() : createDownsampler(source.sampleRate);
		this.chunkLength = Math.round(DIAGNOSTIC_CHUNK_S * this.outputRate);
		this.pending = new Int16Array(this.chunkLength);
		this.pendingLength = 0;
		this.unsubscribe = source.onFrame((frame) => this.onFrame(frame, source.sampleRate));
	}

	/** Sends the pending block and unsubscribes. */
	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.flush();
		this.downsampler = null;
		this.lastEnd = null;
		this.segmentProduced = 0;
	}

	private onFrame({ samples, frameTime }: AudioFrame, rate: number): void {
		const downsampler = this.downsampler;
		if (!downsampler) return;
		const frameS = samples.length / rate;
		if (this.lastEnd === null) {
			this.startSegment(frameTime);
		} else if (frameTime - this.lastEnd > frameS / 2) {
			this.sink.event('input.gap', this.lastEnd, {
				fromAudioTime: this.lastEnd,
				durationS: frameTime - this.lastEnd
			});
			this.flush();
			downsampler.reset();
			this.startSegment(frameTime);
		}
		this.lastEnd = frameTime + frameS;

		for (const value of downsampler.push(samples)) {
			this.pending[this.pendingLength++] = toInt16(value);
			this.segmentProduced++;
			if (this.pendingLength === this.chunkLength) this.flush();
		}
	}

	private startSegment(audioTime: number): void {
		this.segmentStart = audioTime;
		this.segmentProduced = 0;
	}

	private flush(): void {
		if (this.pendingLength === 0) return;
		const first = this.segmentProduced - this.pendingLength;
		const delayS = this.downsampler?.delayS ?? 0;
		this.sink.audio({
			audioTime: this.segmentStart + first / this.outputRate - delayS,
			sampleRate: this.outputRate,
			samples: this.pending.slice(0, this.pendingLength)
		});
		this.pendingLength = 0;
	}
}
