import type { AudioInputDevice, NoteDetectorPort, NoteOnset } from '$lib/application/ports';
import frameProcessorUrl from './frame-processor.ts?worker&url';
import { DEFAULT_DETECTOR_CONFIG, type DetectorConfig } from './config';
import { NoteTracker } from './NoteTracker';

function rmsOf(frame: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
	return Math.sqrt(sum / Math.max(1, frame.length));
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
	private readonly levelListeners = new Set<(rms: number) => void>();

	constructor(
		private readonly context: () => AudioContext,
		options?: Partial<DetectorConfig>
	) {
		this.config = { ...DEFAULT_DETECTOR_CONFIG, ...options };
	}

	async listInputs(): Promise<AudioInputDevice[]> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === 'audioinput')
			.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
	}

	async start(deviceId: string | null): Promise<void> {
		this.stop();
		const ctx = this.context();
		if (!this.workletLoaded) {
			await ctx.audioWorklet.addModule(new URL(frameProcessorUrl, import.meta.url));
			this.workletLoaded = true;
		}

		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				...(deviceId ? { deviceId: { exact: deviceId } } : {}),
				channelCount: { ideal: 2 },
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		});

		this.tracker = new NoteTracker(this.config, ctx.sampleRate);
		this.source = ctx.createMediaStreamSource(this.stream);
		this.node = new AudioWorkletNode(ctx, 'note-frame-processor', {
			channelCount: 2,
			channelCountMode: 'explicit',
			channelInterpretation: 'discrete'
		});
		this.gain = ctx.createGain();
		this.gain.gain.setValueAtTime(0, ctx.currentTime);
		this.source.connect(this.node);
		this.node.connect(this.gain);
		this.gain.connect(ctx.destination);

		this.node.port.onmessage = (event: MessageEvent) => {
			const { samples, frameTime } = event.data as {
				samples: Float32Array;
				frameTime: number;
			};
			const rms = rmsOf(samples);
			this.levelListeners.forEach((listener) => listener(rms));
			if (!this.tracker) return;
			const onset = this.tracker.push(samples, frameTime);
			if (onset) this.noteListeners.forEach((listener) => listener(onset));
		};
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
	}

	onNote(callback: (onset: NoteOnset) => void): () => void {
		this.noteListeners.add(callback);
		return () => this.noteListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}
}
