import type { VoicingOccurrence } from '$lib/domain/music';

/**
 * Where a shape sits on the neck: its lowest fretted fret (the index finger's), open strings left
 * out; 'open' for a shape on open strings only.
 */
export function occurrencePosition(occurrence: VoicingOccurrence): number | 'open' {
	const fretted = occurrence.notes.map((note) => note.fret).filter((fret) => fret > 0);
	return fretted.length === 0 ? 'open' : Math.min(...fretted);
}

/**
 * The frets a zone prompt may name for a shape: every fret it covers, from its lowest fretted
 * fret to its highest; none for a shape on open strings only.
 */
export function cueFrets(occurrence: VoicingOccurrence): number[] {
	const fretted = occurrence.notes.map((note) => note.fret).filter((fret) => fret > 0);
	if (fretted.length === 0) return [];
	const low = Math.min(...fretted);
	return Array.from({ length: Math.max(...fretted) - low + 1 }, (_, i) => low + i);
}
