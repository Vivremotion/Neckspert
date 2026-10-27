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
	pitchOfMidi,
	voicingCandidates,
	voicingKey,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import type { Locale, PlannedItem, ResponseVerdict } from '$lib/domain/types';
import type { PromptView } from '$lib/application/session/contract';
import {
	chartRoot,
	chordGap,
	chordName,
	closestShape,
	fretsOf,
	heardFrets,
	heardOf,
	lowestShape,
	notesOf,
	aroundLabel,
	rootOnLabel,
	shapeAt,
	shapeOf,
	stringSetLabel
} from '$lib/application/presentation/triadWords';
import { TRIAD_MESSAGES } from './triadMessages';
import type { MechanicPresenter, OneAnswerPresenter } from './types';

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

/** Nothing to draw on a right answer: the miss and the correction only. */
function isMiss(verdict: ResponseVerdict): boolean {
	return verdict === 'wrong' || verdict === 'corrected';
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
export const triadAnchorPresenter: OneAnswerPresenter<TriadAnchorItem> = {
	rules: triadAnchorRules,
	scene: 'guitar',
	sensors: ['note', 'chord'],
	contestable: true,
	prompt: (item, { aid }, locale) => {
		const voicing = parseVoicingKey(item.voicingKey);
		const prompt = triadPrompt(voicing, rootOnLabel(voicing, locale), null, locale);
		// The lane: the root alone on the target tile, then the chord on the band after it.
		return {
			...prompt,
			target: formatSpelledNote(chartRoot(voicing)),
			band: prompt.primary,
			...(aid === 'show-position' && { shape: shapeOf(lowestShape(voicing)) })
		};
	},
	answerLabel: (answer) => heardFrets((answer as { chord?: ChordReading | null }).chord),
	feedback: (item, { answer, confusion, verdict }, locale) => {
		if (!isMiss(verdict)) return null;
		const voicing = parseVoicingKey(item.voicingKey);
		const parts = answer as { root: { midi: number } | null; chord: ChordReading | null } | null;
		const heard = heardOf(parts?.chord);
		const part = (confusion as { part?: string } | null)?.part;
		const gap = TRIAD_MESSAGES[locale].gap;
		const text = !parts?.root
			? gap.noRoot
			: part === 'root'
				? gap.rootHeard(pitchOfMidi(parts.root.midi))
				: chordGap(confusion, locale);
		return {
			heard: heard && shapeOf(heard),
			expected: shapeOf(closestShape(voicing, heard)),
			gap: text
		};
	},
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

/** Find a triad around a fret: "D · vers la case 3". */
export const triadZonePresenter: OneAnswerPresenter<TriadZoneItem, ChordReading> = {
	rules: triadZoneRules,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	prompt: (item, { aid }, locale) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return triadPrompt(
			voicing,
			aroundLabel(item, locale),
			aid === 'show-position' ? rootOnLabel(voicing, locale) : null,
			locale
		);
	},
	answerLabel: (answer) => heardFrets(answer),
	feedback: (item, { answer, confusion, verdict }, locale) => {
		if (!isMiss(verdict)) return null;
		const heard = heardOf(answer as ChordReading | null);
		return {
			heard: heard && shapeOf(heard),
			expected: shapeOf(shapeAt(parseVoicingKey(item.voicingKey), item.position)),
			gap: answer === null ? TRIAD_MESSAGES[locale].gap.noChordHeard : chordGap(confusion, locale)
		};
	},
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
