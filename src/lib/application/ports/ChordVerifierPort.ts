import type { Midi, StringNumber } from '$lib/domain/music';

/** A chord the player may have played: a voicing at one position, chosen by the mechanic. */
export interface ChordCandidate {
	/** Chosen by the mechanic: voicing key and position. */
	id: string;
	/** From the domain ('expected', 'other-inversion'…), never read by the sensor. */
	kind: string;
	notes: readonly { string: StringNumber; fret: number; midi: Midi }[];
}

/** What a round listens for: the expected candidate among the known ones. */
export interface ChordExpectation {
	/** Audio time (s) the round opens at. */
	opensAt: number;
	/** Ids of the expected candidates: any of them is the right chord. */
	expected: readonly string[];
	candidates: readonly ChordCandidate[];
	style: 'strummed' | 'arpeggiated' | 'mixed' | 'unknown';
}

/** One judge variant's view of a window. */
export interface ChordVariantReport {
	id: string;
	/** Candidate retained, or null. */
	decided: string | null;
	/** Score of each candidate, by id. */
	scores: Readonly<Record<string, number>>;
}

export interface ChordReport {
	/** Audio time (s) of the attack, latency not removed. */
	time: number;
	/** Span covered since the attack. */
	windowMs: number;
	/** The active variant's decision. */
	decided: string | null;
	/**
	 * No better reading of this attack will follow, and none comes after it: the decision is an
	 * expected candidate, or the same shape held long enough, or nothing recognized for long
	 * enough, or this is the attack's last reading (last one, cut short, or closed by a new attack).
	 */
	final: boolean;
	variants: readonly ChordVariantReport[];
}

/**
 * Says which known candidate a played chord matches. Knows no mechanic; the technique behind it
 * (spectral fit, hexaphonic pickup…) is the adapter's business.
 */
export interface ChordVerifierPort {
	/** Sets the expectation of the round that opens; null: nothing to listen for. */
	expect(expectation: ChordExpectation | null): void;
	/** Returns the unsubscribe function. */
	onReport(callback: (report: ChordReport) => void): () => void;
}
