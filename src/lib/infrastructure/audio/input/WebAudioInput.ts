import type { AudioInputDevice } from '$lib/application/ports';
import { clampBuiltInInputGain, DEFAULT_BUILT_IN_INPUT_GAIN } from '$lib/domain/types';
import frameProcessorUrl from '../detection/frame-processor.ts?worker&url';

/** A block of mono samples from the input, at its audio time (s). */
export interface AudioFrame {
	samples: Float32Array;
	frameTime: number;
}

function rmsOf(frame: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
	return Math.sqrt(sum / Math.max(1, frame.length));
}

function isBuiltInMicLabel(label: string): boolean {
	return /macbook|built-?in|internal|intégr|interne/i.test(label);
}

function scaleSamples(samples: Float32Array, gain: number): Float32Array {
	const out = new Float32Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const value = samples[i] * gain;
		out[i] = value > 1 ? 1 : value < -1 ? -1 : value;
	}
	return out;
}

/**
 * Firefox on macOS leaves the built-in mic on a quiet raw array unless echo
 * cancellation and noise suppression are both enabled. USB interfaces are not
 * on that path and stay raw.
 */
function firefoxBuiltInMic(label: string): boolean {
	return /firefox\//i.test(navigator.userAgent) && isBuiltInMicLabel(label);
}

function inputConstraints(deviceId: string | null, voice: boolean): MediaTrackConstraints {
	return {
		...(deviceId ? { deviceId: { exact: deviceId } } : {}),
		echoCancellation: voice,
		noiseSuppression: voice,
		autoGainControl: false
	};
}

/**
 * The guitar input, opened raw through the frame worklet, shared by every detector: each
 * subscriber gets the same frames, after the built-in mic gain.
 */
export class WebAudioInput {
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private node: AudioWorkletNode | null = null;
	private gain: GainNode | null = null;
	private workletLoaded = false;
	private builtInGain = DEFAULT_BUILT_IN_INPUT_GAIN;
	private boostBuiltIn = false;
	private rate = 0;
	private readonly frameListeners = new Set<(frame: AudioFrame) => void>();
	private readonly levelListeners = new Set<(rms: number) => void>();
	private readonly resumeAudio: (() => Promise<void>) | undefined;

	constructor(
		private readonly context: () => AudioContext,
		options?: { resume?: () => Promise<void> }
	) {
		this.resumeAudio = options?.resume;
	}

	/** Sample rate of the open input; 0 before the first start. */
	get sampleRate(): number {
		return this.rate;
	}

	async listInputs(): Promise<AudioInputDevice[]> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
			.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
	}

	/** Opens the input (null = default device). */
	async start(deviceId: string | null): Promise<void> {
		this.stop();
		await this.resumeAudio?.();
		const ctx = this.context();
		this.rate = ctx.sampleRate;
		if (!this.workletLoaded) {
			await ctx.audioWorklet.addModule(new URL(frameProcessorUrl, import.meta.url));
			this.workletLoaded = true;
		}

		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: inputConstraints(deviceId, false)
		});
		const opened = this.stream.getAudioTracks()[0];
		if (opened && firefoxBuiltInMic(opened.label)) {
			opened.stop();
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: inputConstraints(deviceId, true)
			});
		}
		const label = this.stream.getAudioTracks()[0]?.label ?? '';
		this.boostBuiltIn = isBuiltInMicLabel(label);

		this.source = ctx.createMediaStreamSource(this.stream);
		// Chrome drops a mono mic (the MacBook one) when this node is forced to
		// two discrete channels. Follow the track, and mix if the counts disagree.
		const reported = this.stream.getAudioTracks()[0]?.getSettings()?.channelCount ?? 0;
		const channelCount = reported > 0 ? reported : 1;
		const node = new AudioWorkletNode(ctx, 'note-frame-processor', {
			channelCount,
			channelCountMode: 'explicit',
			channelInterpretation: 'speakers'
		});
		this.node = node;
		this.gain = ctx.createGain();
		this.gain.gain.setValueAtTime(0, ctx.currentTime);
		this.source.connect(node);
		node.connect(this.gain);
		this.gain.connect(ctx.destination);

		node.port.onmessage = (event: MessageEvent) => {
			if (this.node !== node) return;
			const data = event.data as AudioFrame;
			const samples =
				this.boostBuiltIn && this.builtInGain !== 1
					? scaleSamples(data.samples, this.builtInGain)
					: data.samples;
			const rms = rmsOf(samples);
			this.levelListeners.forEach((listener) => listener(rms));
			const frame = { samples, frameTime: data.frameTime };
			this.frameListeners.forEach((listener) => listener(frame));
		};
		// The permission prompt can suspend the context after the first resume.
		await this.resumeAudio?.();
	}

	stop(): void {
		this.node?.port && (this.node.port.onmessage = null);
		this.node?.disconnect();
		this.source?.disconnect();
		this.gain?.disconnect();
		this.stream?.getTracks().forEach((track) => track.stop());
		this.node = null;
		this.source = null;
		this.gain = null;
		this.stream = null;
		this.boostBuiltIn = false;
	}

	setBuiltInGain(gain: number): void {
		this.builtInGain = clampBuiltInInputGain(gain);
	}

	onFrame(callback: (frame: AudioFrame) => void): () => void {
		this.frameListeners.add(callback);
		return () => this.frameListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}
}
