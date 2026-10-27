import { rootPosition, type ChordReading, type TriadZoneItem } from '$lib/domain/mechanics';
import {
	formatSpelledNote,
	pitchOfSpelled,
	spellInterval,
	spelledFromPitch,
	voicingOccurrences,
	type SpelledNote,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { Locale } from '$lib/domain/types';
import type { ShapeView } from '$lib/application/session/contract';
import { TRIAD_MESSAGES, TRIAD_STRING_NAMES } from '$lib/application/mechanics/triadMessages';

/** Between the frets of a shape: a hyphen that never breaks the line. */
const FRET_SEPARATOR = '‑';

/** Roots usually written flat in a key signature; the others keep their sharp. */
const FLAT_ROOTS: Partial<Record<PitchName, string>> = { 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb' };

/** The root as a chord chart writes it: Eb, Ab and Bb flat, every other root as keyed. */
export function chartRoot(voicing: Voicing): SpelledNote {
	const pitch = pitchOfSpelled(voicing.chord.root);
	const flat = FLAT_ROOTS[pitch];
	return flat
		? { letter: flat[0] as SpelledNote['letter'], accidental: -1 }
		: spelledFromPitch(pitch);
}

export function chordName(voicing: Voicing): string {
	return formatSpelledNote(chartRoot(voicing)) + voicing.chord.quality.suffix;
}

export function rootName(voicing: Voicing): string {
	return formatSpelledNote(chartRoot(voicing));
}

export function fretsOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes.map((note) => note.fret).join(FRET_SEPARATOR);
}

/** The notes of a shape, low string first, spelled from the chart's root: "A D F#". */
export function notesOf(occurrence: VoicingOccurrence): string {
	const root = chartRoot(occurrence.voicing);
	return occurrence.notes
		.map((note) => formatSpelledNote(spellInterval(root, note.degree)))
		.join(' ');
}

/** "sol‑si‑mi", "G‑B‑E": the strings of a voicing, low first. */
export function stringSetLabel(voicing: Voicing, locale: Locale): string {
	return voicing.strings
		.map(({ string }) => TRIAD_STRING_NAMES[locale][string])
		.join(FRET_SEPARATOR);
}

/** The name of the string that carries the root: "si", "B". */
export function rootStringName(voicing: Voicing, locale: Locale): string {
	return TRIAD_STRING_NAMES[locale][rootPosition(voicing).string];
}

export function rootOnLabel(voicing: Voicing, locale: Locale): string {
	return TRIAD_MESSAGES[locale].rootOn(rootStringName(voicing, locale));
}

/** "vers la case 3": the fret drawn for the prompt, else (older attempts) the shape's lowest. */
export function aroundLabel(item: TriadZoneItem, locale: Locale): string {
	if (item.position === 'open') return TRIAD_MESSAGES[locale].open;
	return TRIAD_MESSAGES[locale].around(item.fret ?? item.position);
}

/** The lowest fretted shape of a voicing; a shape on open strings only when it has no other. */
export function lowestShape(voicing: Voicing): VoicingOccurrence {
	const shapes = voicingOccurrences(voicing);
	return shapes.find((shape) => occurrencePosition(shape) !== 'open') ?? shapes[0];
}

export function shapeAt(voicing: Voicing, position: number | 'open'): VoicingOccurrence {
	return (
		voicingOccurrences(voicing).find((shape) => occurrencePosition(shape) === position) ??
		lowestShape(voicing)
	);
}

export function shapeOf(occurrence: VoicingOccurrence): ShapeView {
	return { notes: occurrence.notes.map(({ string, fret }) => ({ string, fret })) };
}

/** The shape of a reading, null when it recognized nothing. */
export function heardOf(reading: ChordReading | null | undefined): VoicingOccurrence | null {
	return reading?.decided ? occurrenceOfId(reading.decided) : null;
}

/** The voicing's shape closest to the one played (by their position), else its lowest. */
export function closestShape(
	voicing: Voicing,
	played: VoicingOccurrence | null
): VoicingOccurrence {
	if (!played) return lowestShape(voicing);
	const at = (shape: VoicingOccurrence) => {
		const position = occurrencePosition(shape);
		return position === 'open' ? 0 : position;
	};
	const target = at(played);
	return voicingOccurrences(voicing).reduce((best, shape) =>
		Math.abs(at(shape) - target) < Math.abs(at(best) - target) ? shape : best
	);
}

/** What a chord confusion says, or null when it says nothing (a right chord). */
export function chordGap(confusion: unknown, locale: Locale): string | null {
	const kind = (confusion as { kind?: string } | null)?.kind;
	const gap = TRIAD_MESSAGES[locale].gap;
	switch (kind) {
		case 'other-inversion':
		case 'other-quality':
		case 'other-octave':
		case 'none':
		case 'no-chord':
			return gap[kind];
		default:
			return null;
	}
}

/** The frets of the shape a reading recognized ("2‑3‑2"), null when it recognized nothing. */
export function heardFrets(reading: ChordReading | null | undefined): string | null {
	const heard = heardOf(reading);
	return heard ? fretsOf(heard) : null;
}
