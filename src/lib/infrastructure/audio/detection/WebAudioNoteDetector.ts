import type {
	AudioInputDevice,
	NoteDetectorPort,
	NoteOnset,
	NoteRejection
} from '$lib/application/ports';
import { clampBuiltInInputGain, DEFAULT_BUILT_IN_INPUT_GAIN } from '$lib/domain/types';
import frameProcessorUrl from './frame-processor.ts?worker&url';
import { DEFAULT_DETECTOR_CONFIG, type DetectorConfig } from './config';
import { NoteTracker } from './NoteTracker';

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

/** Single-note detection from the guitar input via AudioWorklet + pitchy. */
export class WebAudioNoteDetector implements NoteDetectorPort {
	private readonly config: DetectorConfig;
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private node: AudioWorkletNode | null = null;
	private gain: GainNode | null = null;
	private tracker: NoteTracker | null = null;
	private workletLoaded = false;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly rejectionListeners = new Set<(rejection: NoteRejection) => void>();
	private readonly levelListeners = new Set<(rms: number) => void>();

	private readonly resumeAudio: (() => Promise<void>) | undefined;
	private builtInGain = DEFAULT_BUILT_IN_INPUT_GAIN;
	private boostBuiltIn = false;

	constructor(
		private readonly context: () => AudioContext,
		options?: Partial<DetectorConfig> & { resume?: () => Promise<void> }
	) {
		this.resumeAudio = options?.resume;
		const { resume: _resume, ...config } = options ?? {};
		this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
	}

	async listInputs(): Promise<AudioInputDevice[]> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === 'audioinput' && d.deviceId !== '')
			.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
	}

	async start(deviceId: string | null): Promise<void> {
		this.stop();
		await this.resumeAudio?.();
		const ctx = this.context();
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

		this.tracker = new NoteTracker(this.config, ctx.sampleRate, (rejection) =>
			this.rejectionListeners.forEach((listener) => listener(rejection))
		);
		this.source = ctx.createMediaStreamSource(this.stream);
		// Chrome drops a mono mic (the MacBook one) when this node is forced to
		// two discrete channels. Follow the track, and mix if the counts disagree.
		const reported = this.stream.getAudioTracks()[0]?.getSettings()?.channelCount ?? 0;
		const channelCount = reported > 0 ? reported : 1;
		this.node = new AudioWorkletNode(ctx, 'note-frame-processor', {
			channelCount,
			channelCountMode: 'explicit',
			channelInterpretation: 'speakers'
		});
		this.gain = ctx.createGain();
		this.gain.gain.setValueAtTime(0, ctx.currentTime);
		this.source.connect(this.node);
		this.node.connect(this.gain);
		this.gain.connect(ctx.destination);

		this.node.port.onmessage = (event: MessageEvent) => {
			const data = event.data as { samples: Float32Array; frameTime: number };
			const samples =
				this.boostBuiltIn && this.builtInGain !== 1
					? scaleSamples(data.samples, this.builtInGain)
					: data.samples;
			const frameTime = data.frameTime;
			const rms = rmsOf(samples);
			this.levelListeners.forEach((listener) => listener(rms));
			if (!this.tracker) return;
			const onset = this.tracker.push(samples, frameTime);
			if (onset) this.noteListeners.forEach((listener) => listener(onset));
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
		this.tracker = null;
		this.boostBuiltIn = false;
	}

	setBuiltInGain(gain: number): void {
		this.builtInGain = clampBuiltInInputGain(gain);
	}

	onNote(callback: (onset: NoteOnset) => void): () => void {
		this.noteListeners.add(callback);
		return () => this.noteListeners.delete(callback);
	}

	onRejected(callback: (rejection: NoteRejection) => void): () => void {
		this.rejectionListeners.add(callback);
		return () => this.rejectionListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}
}
