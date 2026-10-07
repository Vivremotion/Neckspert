import type {
	AudioInputDevice,
	NoteDetectorPort,
	NoteOnset,
	NoteRejection
} from '$lib/application/ports';
import { WebAudioInput } from '../input/WebAudioInput';
import { DEFAULT_DETECTOR_CONFIG, type DetectorConfig } from './config';
import { NoteTracker } from './NoteTracker';

/**
 * Single-note detection from the guitar input via pitchy. The input is shared: given one, the
 * detector listens to it; otherwise it opens its own.
 */
export class WebAudioNoteDetector implements NoteDetectorPort {
	private readonly config: DetectorConfig;
	private readonly input: WebAudioInput;
	private tracker: NoteTracker | null = null;
	private stopFrames: (() => void) | null = null;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly rejectionListeners = new Set<(rejection: NoteRejection) => void>();

	constructor(
		context: () => AudioContext,
		options?: Partial<DetectorConfig> & { resume?: () => Promise<void>; input?: WebAudioInput }
	) {
		const { resume, input, ...config } = options ?? {};
		this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
		this.input = input ?? new WebAudioInput(context, { resume });
	}

	listInputs(): Promise<AudioInputDevice[]> {
		return this.input.listInputs();
	}

	async start(deviceId: string | null): Promise<void> {
		this.stop();
		await this.input.start(deviceId);
		const tracker = new NoteTracker(this.config, this.input.sampleRate, (rejection) =>
			this.rejectionListeners.forEach((listener) => listener(rejection))
		);
		this.tracker = tracker;
		this.stopFrames = this.input.onFrame(({ samples, frameTime }) => {
			if (this.tracker !== tracker) return;
			const onset = tracker.push(samples, frameTime);
			if (onset) this.noteListeners.forEach((listener) => listener(onset));
		});
	}

	stop(): void {
		this.stopFrames?.();
		this.stopFrames = null;
		this.tracker = null;
		this.input.stop();
	}

	setBuiltInGain(gain: number): void {
		this.input.setBuiltInGain(gain);
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
		return this.input.onLevel(callback);
	}
}
