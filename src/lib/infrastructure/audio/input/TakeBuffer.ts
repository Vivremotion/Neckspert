import type { TakeBufferPort } from '$lib/application/ports';
import type { ScheduledSound } from '$lib/domain/time';
import { NoiseBuffers, TIMBRES, playBurst } from '../sounds/clickSound';
import type { AudioFrame, FrameSource } from './WebAudioInput';

/** The most input kept: past it, the oldest frames are forgotten. */
export const TAKE_BUFFER_MAX_S = 60;
/** A take starts playing this long after `play`, so its first sound is never already past. */
export const REPLAY_START_DELAY_S = 0.1;

/**
 * The input of the run under way, kept in memory only, frame by frame, from `keepFrom` to
 * `keepUntil` and at most `TAKE_BUFFER_MAX_S`. A start asked ahead of time forgets the last take
 * only once it comes, so that take can still be heard until then. `play` gives it back through the one audio
 * context, with the sounds the application made resynthesized the way the sound scheduler
 * renders them, shifted by the latency so they fall where the input heard the player.
 */
export class TakeBuffer implements TakeBufferPort {
	private readonly noise = new NoiseBuffers();
	private frames: AudioFrame[] = [];
	private keptSamples = 0;
	/** Nothing is kept before the first `keepFrom`. */
	private from: number | null = null;
	private until = Infinity;
	/** The end of the latest frame heard, kept or not. */
	private heardUntil = -Infinity;
	private playing: { sources: AudioBufferSourceNode[]; done: () => void } | null = null;

	constructor(
		private readonly source: FrameSource,
		private readonly context: () => AudioContext
	) {
		source.onFrame((frame) => this.keep(frame));
	}

	keepFrom(fromTime: number): void {
		this.from = fromTime;
		this.until = Infinity;
		if (fromTime <= this.heardUntil) this.forgetBefore(fromTime);
	}

	keepUntil(toTime: number): void {
		this.until = toTime;
		this.frames = this.frames.filter((frame) => frame.frameTime < toTime);
		this.count();
	}

	/** The samples kept over [from, to), at the input's rate; silence where nothing was kept. */
	samples(from: number, to: number): Float32Array {
		const rate = this.source.sampleRate;
		const out = new Float32Array(Math.max(0, Math.round((to - from) * rate)));
		for (const frame of this.frames) {
			const offset = Math.round((frame.frameTime - from) * rate);
			const first = Math.max(0, -offset);
			const last = Math.min(frame.samples.length, out.length - offset);
			for (let i = first; i < last; i++) out[offset + i] = frame.samples[i];
		}
		return out;
	}

	play(
		from: number,
		to: number,
		sounds: readonly ScheduledSound[],
		latencyS: number
	): Promise<void> {
		this.stop();
		const samples = this.samples(from, to);
		if (samples.length === 0) return Promise.resolve();
		const context = this.context();
		const buffer = context.createBuffer(1, samples.length, this.source.sampleRate);
		buffer.getChannelData(0).set(samples);
		const recorded = context.createBufferSource();
		recorded.buffer = buffer;
		recorded.connect(context.destination);
		const start = context.currentTime + REPLAY_START_DELAY_S;
		recorded.start(start);
		const sources = [recorded];
		for (const { time, sound } of sounds) {
			if (time < from || time >= to) continue;
			const at = start + (time - from) + latencyS;
			if (at < start) continue;
			sources.push(playBurst(context, this.noise, at, TIMBRES[sound]));
		}
		return new Promise<void>((resolve) => {
			const playing = {
				sources,
				done: () => {
					if (this.playing === playing) this.playing = null;
					resolve();
				}
			};
			this.playing = playing;
			recorded.onended = () => playing.done();
		});
	}

	stop(): void {
		const playing = this.playing;
		if (!playing) return;
		this.playing = null;
		const now = this.context().currentTime;
		for (const source of playing.sources) {
			source.onended = null;
			source.stop(now);
		}
		playing.done();
	}

	private keep(frame: AudioFrame): void {
		const end = this.endOf(frame);
		this.heardUntil = Math.max(this.heardUntil, end);
		if (this.from === null) return;
		if (end <= this.from || frame.frameTime >= this.until) return;
		this.forgetBefore(this.from);
		this.frames.push(frame);
		this.keptSamples += frame.samples.length;
		const max = TAKE_BUFFER_MAX_S * this.source.sampleRate;
		while (this.keptSamples > max && this.frames.length > 0) {
			const oldest = this.frames.shift();
			this.keptSamples -= oldest?.samples.length ?? 0;
		}
	}

	private endOf(frame: AudioFrame): number {
		return frame.frameTime + frame.samples.length / this.source.sampleRate;
	}

	/** Forgets the frames that end by `time` (frames are kept in order). */
	private forgetBefore(time: number): void {
		if (this.frames.length === 0 || this.endOf(this.frames[0]) > time) return;
		this.frames = this.frames.filter((frame) => this.endOf(frame) > time);
		this.count();
	}

	private count(): void {
		this.keptSamples = this.frames.reduce((sum, frame) => sum + frame.samples.length, 0);
	}
}
