import type { SoundSchedulerPort } from '$lib/application/ports';
import type { ScheduledSound, SoundId } from '$lib/domain/time';
import { NoiseBuffers, TIMBRES, playBurst } from './clickSound';

/** How late a wake-up may run: the timer polls this often. */
export const DEFAULT_LOOKAHEAD_MS = 25;

export interface SoundSchedulerOptions {
	lookaheadMs?: number;
}

interface Pending {
	time: number;
	end: number;
	source: AudioBufferSourceNode;
}

/**
 * Plays any pitchless sound at an exact audio time and keeps a log of what it scheduled.
 * A sound is handed to the audio thread as soon as `play` is called, so its timing never
 * depends on a timer; a time already past is dropped, not played late. Wake-ups are
 * never early, at most `lookaheadMs` late, earliest first.
 */
export class WebAudioSoundScheduler implements SoundSchedulerPort {
	private readonly noise = new NoiseBuffers();
	private readonly lookaheadMs: number;
	private log: ScheduledSound[] = [];
	private pending: Pending[] = [];
	private wakeUps: { time: number; callback: () => void }[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	/** Bumped by `cancelAll`, so a timer or wake-up of an earlier run goes quiet. */
	private run = 0;

	constructor(
		private readonly context: () => AudioContext,
		options: SoundSchedulerOptions = {}
	) {
		this.lookaheadMs = options.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS;
		if (!(this.lookaheadMs > 0)) {
			throw new RangeError(`lookaheadMs must be positive, got ${this.lookaheadMs}`);
		}
	}

	play(time: number, sound: SoundId): void {
		const context = this.context();
		if (time < context.currentTime) return;
		const timbre = TIMBRES[sound];
		const source = playBurst(context, this.noise, time, timbre);
		this.pending = this.pending.filter((p) => p.end > context.currentTime);
		this.pending.push({ time, end: time + timbre.durationS, source });
		this.log.push({ time, sound });
	}

	at(time: number, callback: () => void): () => void {
		const wakeUp = { time, callback };
		this.wakeUps.push(wakeUp);
		this.arm();
		return () => {
			this.wakeUps = this.wakeUps.filter((w) => w !== wakeUp);
		};
	}

	cancelAll(): void {
		this.run++;
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.wakeUps = [];
		this.log = [];
		const toCancel = this.pending;
		this.pending = [];
		if (toCancel.length === 0) return;
		const now = this.context().currentTime;
		// A sound already sounding plays out; one not yet started never does.
		for (const p of toCancel) if (p.time > now) p.source.stop(now);
	}

	emitted(): readonly ScheduledSound[] {
		return [...this.log];
	}

	private arm(): void {
		if (this.timer !== null) return;
		this.timer = setTimeout(() => this.tick(this.run), this.lookaheadMs);
	}

	private tick(run: number): void {
		if (run !== this.run) return;
		this.timer = null;
		if (this.wakeDue(this.context().currentTime, run) && this.wakeUps.length > 0) this.arm();
	}

	/** Calls the wake-ups due at `now`, earliest first; false when `cancelAll` ran meanwhile. */
	private wakeDue(now: number, run: number): boolean {
		for (;;) {
			let due: { time: number; callback: () => void } | null = null;
			for (const w of this.wakeUps) {
				if (w.time <= now && (!due || w.time < due.time)) due = w;
			}
			if (!due) return true;
			const done = due;
			this.wakeUps = this.wakeUps.filter((w) => w !== done);
			try {
				done.callback();
			} catch (error) {
				console.error('Sound scheduler wake-up failed', error);
			}
			if (run !== this.run) return false;
		}
	}
}
