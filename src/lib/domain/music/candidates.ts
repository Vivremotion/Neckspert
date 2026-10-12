import { DEGREES, isTriadQuality, QUALITIES, type ChordQuality } from './chord';
import {
	createVoicing,
	voicingKey,
	voicingOccurrences,
	type Voicing,
	type VoicingOccurrence
} from './voicing';

export type CandidateKind = 'expected' | 'other-octave' | 'other-inversion' | 'other-quality';

/** What a played chord could be: the expected occurrence or one it may be mistaken for. */
export interface VoicingCandidate {
	kind: CandidateKind;
	occurrence: VoicingOccurrence;
}

function distance(a: VoicingOccurrence, b: VoicingOccurrence): number {
	return a.notes.reduce((sum, note, i) => sum + Math.abs(note.fret - (b.notes[i]?.fret ?? 0)), 0);
}

/** Occurrence of `voicing` closest to `target`, string by string; the lowest on a tie. */
function nearest(voicing: Voicing, target: VoicingOccurrence): VoicingOccurrence | null {
	return voicingOccurrences(voicing).reduce<VoicingOccurrence | null>(
		(best, o) => (!best || distance(o, target) < distance(best, target) ? o : best),
		null
	);
}

/** True when `other` differs from `quality` by one degree moved a semitone (maj ↔ min, maj ↔ aug). */
function oneSemitoneAway(quality: ChordQuality, other: ChordQuality): boolean {
	if (other.id === quality.id || other.degrees.length !== quality.degrees.length) return false;
	const moves = quality.degrees
		.map((degree, i) => DEGREES[other.degrees[i]].semitones - DEGREES[degree].semitones)
		.filter((move) => move !== 0);
	return moves.length === 1 && Math.abs(moves[0]) === 1;
}

/** The same strings, each degree replaced by the one at its place in `quality`. */
function withQuality(voicing: Voicing, quality: ChordQuality): Voicing {
	const { degrees } = voicing.chord.quality;
	return createVoicing(
		{ root: voicing.chord.root, quality },
		voicing.strings.map(({ string, degree }) => ({
			string,
			degree: quality.degrees[degrees.indexOf(degree)]
		}))
	);
}

/**
 * The expected occurrence, then its other octaves, then the nearest occurrence of each other
 * voicing in `inversions` (same chord, same strings), then the nearest occurrence of each quality
 * one semitone away, in table order.
 */
export function voicingCandidates(
	occurrence: VoicingOccurrence,
	inversions: readonly Voicing[]
): VoicingCandidate[] {
	const { voicing } = occurrence;
	const key = voicingKey(voicing);
	const candidates: VoicingCandidate[] = [{ kind: 'expected', occurrence }];
	for (const other of voicingOccurrences(voicing)) {
		if (distance(other, occurrence) > 0)
			candidates.push({ kind: 'other-octave', occurrence: other });
	}
	for (const inversion of inversions) {
		if (voicingKey(inversion) === key) continue;
		const found = nearest(inversion, occurrence);
		if (found) candidates.push({ kind: 'other-inversion', occurrence: found });
	}
	for (const quality of QUALITIES.filter(isTriadQuality)) {
		if (!oneSemitoneAway(voicing.chord.quality, quality)) continue;
		const found = nearest(withQuality(voicing, quality), occurrence);
		if (found) candidates.push({ kind: 'other-quality', occurrence: found });
	}
	return candidates;
}
