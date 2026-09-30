import type { SoundCuePort } from '$lib/application/ports';
import type { Verdict } from '$lib/domain/types';
import { CUE_ATTACK_S, CUE_SILENCE, CUE_SPECS, type ToneSpec } from './cueSpecs';

/** Plays the reserved verdict sounds on the shared audio clock. */
export class WebAudioCues implements SoundCuePort {
	constructor(private readonly context: () => AudioContext) {}

	play(verdict: Verdict, time?: number): void {
		const context = this.context();
		// A start time in the past would cut the envelope short.
		const at = Math.max(time ?? context.currentTime, context.currentTime);
		for (const tone of CUE_SPECS[verdict]) scheduleTone(context, tone, at);
	}
}

function scheduleTone(context: AudioContext, tone: ToneSpec, at: number): void {
	const start = at + tone.offset;
	const end = start + tone.duration;
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	oscillator.type = tone.waveform;
	oscillator.frequency.setValueAtTime(tone.startHz, start);
	if (tone.endHz !== tone.startHz) {
		oscillator.frequency.exponentialRampToValueAtTime(tone.endHz, end);
	}
	gain.gain.setValueAtTime(0, start);
	gain.gain.linearRampToValueAtTime(tone.peakGain, start + CUE_ATTACK_S);
	gain.gain.exponentialRampToValueAtTime(CUE_SILENCE, end);
	oscillator.connect(gain);
	gain.connect(context.destination);
	oscillator.start(start);
	oscillator.stop(end);
}
