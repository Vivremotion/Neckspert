import type { Fraction } from '../fraction';
import type { Judged, RoundPlan } from '../plan';
import type { TempoMap } from '../tempoMap';
import type { RoundTimes } from './zones';

/** A round on the tempo map, from `start`; or in free time, from the instant of its prompt. */
export type RoundClock = { map: TempoMap; start: Fraction } | { promptS: number };

/** What a sensor heard: an attack at `time` (audio seconds, latency removed) and one reading of it. */
export interface Attack {
	time: number;
	sensor: string;
	/** False: a better reading of the same attack may still come. */
	final: boolean;
	payload: unknown;
}

export type IgnoreReason = 'settled' | 'before-window' | 'after-capture';
export type ObservationFate = 'answer' | IgnoreReason | 'other-sensor' | 'unreadable';

export interface PairedAnswer {
	expectation: number;
	time: number;
	judged: Judged | null; // null for an expectation without content
	/** After the in-time zone: off the beat. */
	late: boolean;
	/** A reading that a better one of the same attack may still replace. */
	pending: boolean;
	correction: { time: number; judged: Judged } | null;
	/** Filled by the alignment; null from the first answer. */
	timing: 'on-time' | 'early' | 'late' | null;
	offsetMs: number | null;
}

export interface PairingResult {
	pairs: PairedAnswer[];
	missed: number[];
	dropped: number[];
	/** Times of the attacks that answer nothing, kept by the alignment only. */
	extra: number[];
	shift: { bar: number; byS: number } | null;
	clampedWindows: number;
	/** Every attack kept, in time order (the cycle verdict reads it). */
	attacks: number[];
}

export interface PairingContext {
	plan: RoundPlan;
	times: RoundTimes;
	clock: RoundClock;
	/** Judges a payload against the content of expectation `index`; null without content. */
	judge(index: number, payload: unknown): Judged | null;
}

/** Which attack answers which expectation of one round, decided live. */
export interface Pairing {
	offer(attack: Attack): { fate: 'answer' | IgnoreReason; judged: Judged | null };
	advance(now: number): void;
	/** Every expectation decided: nothing heard later can change the result. */
	done(now: number): boolean;
	/** No new attack can answer any expectation (readings of attacks heard may still come). */
	zonesOver(now: number): boolean;
	/** A reading may still change a pair: a pending reading, or a span still correctable. */
	awaiting(): boolean;
	/** Closing now drops the round: nothing heard and its first in-time zone still open. */
	droppable(now: number): boolean;
	/** Expectations shown as missed so far (see « Le direct »). */
	shownMisses(now: number): number[];
	/** As of now; pending readings are in it as they stand. */
	result(): PairingResult;
}

export interface PairingMode {
	id: string;
	create(context: PairingContext): Pairing;
}
