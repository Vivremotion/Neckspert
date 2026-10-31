import type {
	AttackDetectorPort,
	AudioInputDevice,
	NoteDetectorPort,
	NoteOnset,
	NoteRejection
} from '$lib/application/ports';
import { WebAudioAttackDetector } from '../attacks/WebAudioAttackDetector';
import { WebAudioInput } from '../input/WebAudioInput';
import { DEFAULT_DETECTOR_CONFIG, type PitchConfig } from './config';
import { NoteTracker } from './NoteTracker';

/**
 * Played notes from the guitar input: the attacks of the attack sensor, each with the pitch read
 * after it via pitchy. The attack sensor knows nothing of pitch, the pitch reading nothing of
 * attacks. The input is shared: given one, the detector listens to it; otherwise it opens its own.
 * Likewise the attack sensor, given or made on that input.
 */
export class WebAudioNoteDetector implements NoteDetectorPort {
	private readonly config: PitchConfig;
	private readonly input: WebAudioInput;
	private readonly attacks: Pick<AttackDetectorPort, 'onAttack'>;
	private tracker: NoteTracker | null = null;
	private stopFrames: (() => void) | null = null;
	private stopAttacks: (() => void) | null = null;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly rejectionListeners = new Set<(rejection: NoteRejection) => void>();

	constructor(
		context: () => AudioContext,
		options?: Partial<PitchConfig> & {
			resume?: () => Promise<void>;
			input?: WebAudioInput;
			attacks?: Pick<AttackDetectorPort, 'onAttack'>;
		}
	) {
		const { resume, input, attacks, ...config } = options ?? {};
		this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
		this.input = input ?? new WebAudioInput(context, { resume });
		this.attacks = attacks ?? new WebAudioAttackDetector(this.input);
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
			for (const onset of tracker.push(samples, frameTime)) {
				this.noteListeners.forEach((listener) => listener(onset));
			}
		});
		this.stopAttacks = this.attacks.onAttack(({ time }) => tracker.attack(time));
	}

	stop(): void {
		this.stopFrames?.();
		this.stopFrames = null;
		this.stopAttacks?.();
		this.stopAttacks = null;
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
