import type { ChordCandidate, ChordExpectation } from '$lib/application/ports';
import {
	rootPosition,
	triadAnchorRules,
	triadZoneRules,
	type ChordReading,
	type TriadAnchorItem,
	type TriadZoneItem
} from '$lib/domain/mechanics';
import {
	closeTriadVoicings,
	formatSpelledNote,
	parseVoicingKey,
	spellInterval,
	spelledFromPitch,
	pitchOfSpelled,
	voicingCandidates,
	voicingKey,
	voicingOccurrences,
	type SpelledNote,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { occurrenceId, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { Locale, PlannedItem } from '$lib/domain/types';
import type { PromptView } from '$lib/application/session/contract';
import { TRIAD_MESSAGES, TRIAD_STRING_NAMES } from './triadMessages';
import type { MechanicPresenter } from './types';

/** Between the frets of a shape: a hyphen that never breaks the line. */
const FRET_SEPARATOR = '‑';

/** Roots usually written flat in a key signature; the others keep their sharp. */
const FLAT_ROOTS: Partial<Record<PitchName, string>> = { 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb' };

/** The root as a chord chart writes it: Eb, Ab and Bb flat, every other root as keyed. */
function chartRoot(voicing: Voicing): SpelledNote {
	const pitch = pitchOfSpelled(voicing.chord.root);
	const flat = FLAT_ROOTS[pitch];
	return flat
		? { letter: flat[0] as SpelledNote['letter'], accidental: -1 }
		: spelledFromPitch(pitch);
}

function chordName(voicing: Voicing): string {
	return formatSpelledNote(chartRoot(voicing)) + voicing.chord.quality.suffix;
}

function fretsOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes.map((note) => note.fret).join(FRET_SEPARATOR);
}

/** The notes of a shape, low string first, spelled from the chart's root: "A D F#". */
function notesOf(occurrence: VoicingOccurrence): string {
	const root = chartRoot(occurrence.voicing);
	return occurrence.notes
		.map((note) => formatSpelledNote(spellInterval(root, note.degree)))
		.join(' ');
}

/** "sol‑si‑mi", "G‑B‑E": the strings of a voicing, low first. */
function stringSetLabel(voicing: Voicing, locale: Locale): string {
	return voicing.strings
		.map(({ string }) => TRIAD_STRING_NAMES[locale][string])
		.join(FRET_SEPARATOR);
}

function rootOnLabel(voicing: Voicing, locale: Locale): string {
	return TRIAD_MESSAGES[locale].rootOn(TRIAD_STRING_NAMES[locale][rootPosition(voicing).string]);
}

function positionLabel(position: number | 'open', locale: Locale): string {
	return position === 'open'
		? TRIAD_MESSAGES[locale].open
		: TRIAD_MESSAGES[locale].position(position);
}

/** The lowest fretted shape of a voicing; a shape on open strings only when it has no other. */
function lowestShape(voicing: Voicing): VoicingOccurrence {
	const shapes = voicingOccurrences(voicing);
	return shapes.find((shape) => occurrencePosition(shape) !== 'open') ?? shapes[0];
}

function shapeAt(voicing: Voicing, position: number | 'open'): VoicingOccurrence {
	return (
		voicingOccurrences(voicing).find((shape) => occurrencePosition(shape) === position) ??
		lowestShape(voicing)
	);
}

function toCandidate(kind: string, occurrence: VoicingOccurrence): ChordCandidate {
	return {
		id: occurrenceId(occurrence),
		kind,
		notes: occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
	};
}

/** The voicing of the prompt before, when it was a triad: its chord may still ring. */
function ringing(previous: PlannedItem | null): string | null {
	const item = previous?.item as { voicingKey?: unknown } | undefined;
	return typeof item?.voicingKey === 'string' ? item.voicingKey : null;
}

/**
 * What the chord sensor listens for: the shapes expected and their look-alikes (spec 2026-10-07),
 * never a shape of the chord still ringing from the prompt before.
 */
function chordExpectation(
	voicing: Voicing,
	shape: VoicingOccurrence,
	everyOctave: boolean,
	round: { opensAt: number; previous: PlannedItem | null }
): ChordExpectation {
	const inversions = closeTriadVoicings(
		voicing.chord,
		voicing.strings.map((s) => s.string)
	);
	const excluded = ringing(round.previous);
	const candidates = voicingCandidates(shape, inversions)
		.filter((c) => voicingKey(c.occurrence.voicing) !== excluded)
		.map((c) =>
			toCandidate(everyOctave && c.kind === 'other-octave' ? 'expected' : c.kind, c.occurrence)
		);
	return {
		opensAt: round.opensAt,
		expected: candidates.filter((c) => c.kind === 'expected').map((c) => c.id),
		candidates,
		style: 'unknown'
	};
}

function chordHeard(reading: ChordReading | null | undefined): string | null {
	const heard = reading?.decided ? occurrenceOfId(reading.decided) : null;
	return heard ? fretsOf(heard) : null;
}

function triadPrompt(
	voicing: Voicing,
	secondary: string,
	aid: string | null,
	locale: Locale
): PromptView {
	return {
		primary: chordName(voicing),
		secondary,
		detail: stringSetLabel(voicing, locale),
		aid,
		diagram: null
	};
}

/** Find a triad from its root on a named string: "D · fondamentale sur si". */
// The judge answers one part at a time; the round answers with both (`{ root, chord }`).
export const triadAnchorPresenter: MechanicPresenter<TriadAnchorItem> = {
	rules: triadAnchorRules,
	scene: 'guitar',
	sensors: ['note', 'chord'],
	prompt: (item, { aid }, locale) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return triadPrompt(
			voicing,
			rootOnLabel(voicing, locale),
			aid === 'show-position' ? fretsOf(lowestShape(voicing)) : null,
			locale
		);
	},
	answerLabel: (answer) => chordHeard((answer as { chord?: ChordReading | null }).chord),
	reveal: (item, { verdict }) => {
		if (verdict !== 'wrong') return null;
		const shape = lowestShape(parseVoicingKey(item.voicingKey));
		return `${fretsOf(shape)} · ${notesOf(shape)}`;
	},
	expectation: (item, round) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return { chord: chordExpectation(voicing, lowestShape(voicing), true, round) };
	}
};

/** Find a triad in a position: "D · position 2". */
export const triadZonePresenter: MechanicPresenter<TriadZoneItem, ChordReading> = {
	rules: triadZoneRules,
	scene: 'guitar',
	sensors: ['chord'],
	prompt: (item, { aid }, locale) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return triadPrompt(
			voicing,
			positionLabel(item.position, locale),
			aid === 'show-position' ? rootOnLabel(voicing, locale) : null,
			locale
		);
	},
	answerLabel: (answer) => chordHeard(answer),
	reveal: (item, { verdict }) => {
		if (verdict !== 'wrong') return null;
		const shape = shapeAt(parseVoicingKey(item.voicingKey), item.position);
		return `${fretsOf(shape)} · ${notesOf(shape)}`;
	},
	expectation: (item, round) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return { chord: chordExpectation(voicing, shapeAt(voicing, item.position), false, round) };
	}
};

/** The triads of the memory track as the session shows them, by mechanic id. */
export const TRIAD_PRESENTERS: Record<string, MechanicPresenter> = {
	[triadAnchorPresenter.rules.id]: triadAnchorPresenter,
	[triadZonePresenter.rules.id]: triadZonePresenter
};
