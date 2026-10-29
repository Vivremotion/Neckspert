import type { ScheduledSound } from '$lib/domain/time';
import type { SoundSchedulerPort, TakeBufferPort } from '$lib/application/ports';
import type { RunTake } from '../sessionMemory';

/** The run being kept: from its first instant, until it ends (null while it goes on). */
interface Take {
	from: number;
	to: number | null;
	sounds: ScheduledSound[];
}

/**
 * The takes of a series, shared by every controller: the input of each run kept by the take
 * buffer, with the sounds made over it (from the sound journal, which a stop empties: a run is
 * closed before its sounds are stopped). The last run can be heard again (`play`); each run's take
 * is kept under its segment of the trace, for the session memory.
 */
export class SeriesTakes {
	private take: Take | null = null;
	private kept = new Map<number, RunTake>();

	constructor(private readonly deps: { takes: TakeBufferPort; sounds: SoundSchedulerPort }) {}

	/** A new series: the input and the takes of the one before are not this one's. */
	clear(): void {
		this.deps.takes.clear();
		this.take = null;
		// A new map: the session memory keeps the one of the series before.
		this.kept = new Map();
	}

	/** The input is kept from `time` on, asked ahead of the run that starts there. */
	keepFrom(time: number): void {
		this.deps.takes.keepFrom(time);
	}

	/** Nothing more is kept until the next `keepFrom`; what is kept stays whole (a pause, the end). */
	stopKeeping(): void {
		this.deps.takes.stopKeeping();
	}

	/** The run beginning at `from` becomes the take, the last one forgotten. */
	open(from: number): void {
		if (this.take?.from === from) return;
		this.take = { from, to: null, sounds: [] };
	}

	/**
	 * Ends the take at `to` (a breath, a counted bar, a pause, the end) with the sounds the run made
	 * and `extra` (sounds it did not make but should be heard over it); kept under `segment`, its
	 * run's segment in the trace. A take already ended is only cut shorter.
	 */
	close(
		to: number,
		segment: number | null,
		extra: (from: number, to: number) => ScheduledSound[] = () => []
	): void {
		const take = this.take;
		if (!take) return;
		if (take.to !== null) {
			if (to >= take.to) return;
			take.to = to;
			take.sounds = take.sounds.filter((sound) => sound.time < to);
		} else {
			const { from } = take;
			const heard = this.deps.sounds.emitted().filter((s) => s.time >= from && s.time < to);
			take.to = to;
			take.sounds = [...heard, ...extra(from, to)].sort((a, b) => a.time - b.time);
		}
		this.deps.takes.keepUntil(to);
		if (segment !== null) {
			this.kept.set(segment, { from: take.from, to: take.to, sounds: [...take.sounds] });
		}
	}

	/** The last run's take, once it ended; null before, or when it was cut before it sounded. */
	last(): RunTake | null {
		const take = this.take;
		if (!take || take.to === null || take.to <= take.from) return null;
		return { from: take.from, to: take.to, sounds: take.sounds };
	}

	/** The take of each run of the series, by its segment. */
	get byRun(): ReadonlyMap<number, RunTake> {
		return this.kept;
	}

	/** Plays `take` again, its sounds put back `latencyS` late, where the input heard the player. */
	play(take: RunTake, latencyS: number): Promise<void> {
		return this.deps.takes.play(take.from, take.to, take.sounds, latencyS);
	}

	/** Stops a take being played again. */
	stop(): void {
		this.deps.takes.stop();
	}
}
