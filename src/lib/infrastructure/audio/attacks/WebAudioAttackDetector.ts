import type { AttackDetectorPort, AttackEvent, DiagnosticSink } from '$lib/application/ports';
import type { FrameSource } from '../input/WebAudioInput';
import { AttackTracker } from './AttackTracker';
import type { AttackConfig } from './config';

/** Journal kind of a detected attack. */
const ATTACK_EVENT = 'attack.detected';

/**
 * Pitchless attacks from the shared input. It listens to the frames while it has a listener: the
 * tracker is made with the first one, at the source's rate, and dropped with the last.
 */
export class WebAudioAttackDetector implements AttackDetectorPort {
	private readonly listeners = new Set<(attack: AttackEvent) => void>();
	private stopFrames: (() => void) | null = null;
	private readonly diagnostics: DiagnosticSink | undefined;
	private readonly config: Partial<AttackConfig> | undefined;
	private readonly channel: number | undefined;

	constructor(
		private readonly source: FrameSource,
		options: {
			/** Gets each attack as `attack.detected` when enabled. */
			diagnostics?: DiagnosticSink;
			config?: Partial<AttackConfig>;
			/** Stamped on every attack, for an input with several. */
			channel?: number;
		} = {}
	) {
		this.diagnostics = options.diagnostics;
		this.config = options.config;
		this.channel = options.channel;
	}

	onAttack(callback: (attack: AttackEvent) => void): () => void {
		this.listeners.add(callback);
		if (!this.stopFrames) this.listen();
		return () => {
			this.listeners.delete(callback);
			if (this.listeners.size === 0) this.stop();
		};
	}

	private listen(): void {
		const tracker = new AttackTracker(this.source.sampleRate, this.config);
		this.stopFrames = this.source.onFrame(({ samples, frameTime }) => {
			for (const { time, strength } of tracker.push(samples, frameTime)) {
				const attack: AttackEvent =
					this.channel === undefined
						? { time, strength }
						: { time, strength, channel: this.channel };
				if (this.diagnostics?.enabled) this.diagnostics.event(ATTACK_EVENT, time, { strength });
				[...this.listeners].forEach((listener) => listener(attack));
			}
		});
	}

	private stop(): void {
		this.stopFrames?.();
		this.stopFrames = null;
	}
}
