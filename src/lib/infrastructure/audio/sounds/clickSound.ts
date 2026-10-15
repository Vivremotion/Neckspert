import type { SoundId } from '$lib/domain/time';

export const CLICK_DURATION_S = 0.05;
export const CLICK_SILENCE = 0.001;
/** A wide band keeps the burst pitchless, so the pitch detector never reads it as a note. */
export const CLICK_FILTER_Q = 0.7;
/** The accent is level and brightness, never a tonal frequency. Loud enough to hear over a guitar. */
export const DOWNBEAT_CLICK = { filterHz: 3000, gain: 0.9 } as const;
export const BEAT_CLICK = { filterHz: 1500, gain: 0.7 } as const;
/** The demonstration and the play-along share one band; only the level differs. */
export const DEMO_SOUND = { filterHz: 800, gain: 0.8, durationS: 0.06 } as const;
export const PLAY_ALONG_SOUND = { filterHz: 800, gain: 0.5, durationS: 0.06 } as const;

export interface Timbre {
	filterHz: number;
	gain: number;
	durationS: number;
}

/** Every sound is a burst of band-pass filtered noise: none has a pitch. */
export const TIMBRES: Readonly<Record<SoundId, Timbre>> = {
	'click-accent': { ...DOWNBEAT_CLICK, durationS: CLICK_DURATION_S },
	click: { ...BEAT_CLICK, durationS: CLICK_DURATION_S },
	demo: DEMO_SOUND,
	'play-along': PLAY_ALONG_SOUND
};

/** White noise, generated once per AudioContext and duration, shared by every sound it plays. */
export class NoiseBuffers {
	private context: AudioContext | null = null;
	private readonly buffers = new Map<number, AudioBuffer>();

	get(context: AudioContext, durationS: number): AudioBuffer {
		if (this.context !== context) {
			this.context = context;
			this.buffers.clear();
		}
		const known = this.buffers.get(durationS);
		if (known) return known;
		const length = Math.round(context.sampleRate * durationS);
		const buffer = context.createBuffer(1, length, context.sampleRate);
		const samples = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
		this.buffers.set(durationS, buffer);
		return buffer;
	}
}

/**
 * Hands one burst of noise to the audio thread, to sound at `time` (audio seconds).
 * Returns the source, so the caller can still cancel it before it starts.
 */
export function playBurst(
	context: AudioContext,
	noise: NoiseBuffers,
	time: number,
	timbre: Timbre
): AudioBufferSourceNode {
	const end = time + timbre.durationS;
	const source = context.createBufferSource();
	const filter = context.createBiquadFilter();
	const gain = context.createGain();
	source.buffer = noise.get(context, timbre.durationS);
	filter.type = 'bandpass';
	filter.frequency.setValueAtTime(timbre.filterHz, time);
	filter.Q.setValueAtTime(CLICK_FILTER_Q, time);
	gain.gain.setValueAtTime(timbre.gain, time);
	gain.gain.exponentialRampToValueAtTime(CLICK_SILENCE, end);
	source.connect(filter);
	filter.connect(gain);
	gain.connect(context.destination);
	source.start(time);
	source.stop(end);
	return source;
}
