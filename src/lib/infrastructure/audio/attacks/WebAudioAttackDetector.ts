import type { AttackDetectorPort, AttackEvent, DiagnosticSink } from '$lib/application/ports';
import type { FrameSource } from '../input/WebAudioInput';
import { AttackTracker } from './AttackTracker';
import type { AttackConfig } from './config';

/** Journal kind of a detected attack. */
const ATTACK_EVENT = 'attack.detected';

/**
 * Pitchless attacks from the shared input. It listens to the frames while it has a listener: the
 * tracker is made when the first frame arrives, at the source's rate then (remade if the rate
 * changes), and dropped with the last listener.
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
		// The input opens after the listener may be added: its rate is read as the frames come, and
		// a tracker made for another rate is dropped. Nothing is built while the rate is unknown.
		let tracker: AttackTracker | null = null;
		let trackerRate = 0;
		this.stopFrames = this.source.onFrame(({ samples, frameTime }) => {
			const rate = this.source.sampleRate;
			if (!(rate > 0)) return;
			if (!tracker || rate !== trackerRate) {
				tracker = new AttackTracker(rate, this.config);
				trackerRate = rate;
			}
			for (const { time, strength, preAttack } of tracker.push(samples, frameTime)) {
				const attack: AttackEvent = { time, strength };
				if (this.channel !== undefined) attack.channel = this.channel;
				if (preAttack) attack.preAttack = preAttack;
				if (this.diagnostics?.enabled) {
					this.diagnostics.event(
						ATTACK_EVENT,
						time,
						preAttack ? { strength, preAttack } : { strength }
					);
				}
				[...this.listeners].forEach((listener) => listener(attack));
			}
		});
	}

	private stop(): void {
		this.stopFrames?.();
		this.stopFrames = null;
	}
}
