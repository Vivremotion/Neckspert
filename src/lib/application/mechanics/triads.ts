import type { ChordCandidate, ChordExpectation } from '$lib/application/ports';
import {
	triadAnchorRules,
	triadZoneRules,
	type ChordConfusion,
	type ChordReading,
	type TriadAnchorConfusion,
	type TriadAnchorData,
	type TriadAnchorItem,
	type TriadZoneData,
	type TriadZoneItem
} from '$lib/domain/mechanics';
import {
	closeTriadVoicings,
	type Confusion,
	parseVoicingKey,
	voicingCandidates,
	voicingKey,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import type { ExpectationResult, ResponseValue } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { lowestShape, shapeAt } from '$lib/application/presentation/triadWords';
import type { MechanicPresenter } from './types';

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

/** The confusion of an anchor whose root was right and whose chord never came in its band. */
const NO_CHORD: TriadAnchorConfusion = { kind: 'no-chord', part: 'chord' };

/** What the round's expectation `index` received; unanswered when the value has none. */
function resultAt(value: ResponseValue, index: number): ExpectationResult {
	return (
		value.expectations.find((result) => result.index === index) ?? {
			index,
			answer: null,
			correct: null,
			confusion: null,
			correction: null,
			late: false
		}
	);
}

/**
 * An anchor's `Attempt.data` as the anchor relation stored it: what was heard of each part (null
 * when nothing was), and where it went wrong, the root first (named as locate names it), then the
 * chord (none heard: `no-chord`).
 */
function anchorData(item: TriadAnchorItem, value: ResponseValue): TriadAnchorData {
	const root = resultAt(value, 0);
	const chord = resultAt(value, 1);
	const answered = root.answer !== null || chord.answer !== null;
	const rootConfusion = root.confusion as Confusion | null;
	const confusion: TriadAnchorConfusion | null =
		root.correct !== true
			? root.answer === null || rootConfusion === null
				? null
				: { ...rootConfusion, part: 'root' }
			: chord.answer === null
				? NO_CHORD
				: chord.correct === true
					? null
					: (chord.confusion as ChordConfusion | null);
	return {
		item,
		answer: answered
			? {
					root: root.answer as { midi: number } | null,
					chord: chord.answer as ChordReading | null,
					correction: chord.correction as ChordReading | null
				}
			: null,
		confusion
	};
}

/**
 * Find a triad from its root on a named string: "D · fondamentale sur si"; its words and what it
 * draws are its exercise's presentation. The round answers with both parts (`{ root, chord }`).
 */
export const triadAnchorPresenter: MechanicPresenter<TriadAnchorItem> = {
	rules: triadAnchorRules,
	scene: 'guitar',
	sensors: ['note', 'chord'],
	contestable: true,
	expectation: (item, round) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return { chord: chordExpectation(voicing, lowestShape(voicing), true, round) };
	},
	attemptData: anchorData
};

/** Find a triad around a fret: "D · vers la case 3"; its words are its exercise's presentation. */
export const triadZonePresenter: MechanicPresenter<TriadZoneItem, ChordReading> = {
	rules: triadZoneRules,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	expectation: (item, round) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return { chord: chordExpectation(voicing, shapeAt(voicing, item.position), false, round) };
	},
	attemptData: (item, value): TriadZoneData => {
		const chord = resultAt(value, 0);
		return {
			item,
			answer: chord.answer as ChordReading | null,
			confusion: chord.confusion as ChordConfusion | null
		};
	}
};

/** The triads of the memory track as the session shows them, by mechanic id. */
export const TRIAD_PRESENTERS: Record<string, MechanicPresenter> = {
	[triadAnchorPresenter.rules.id]: triadAnchorPresenter,
	[triadZonePresenter.rules.id]: triadZonePresenter
};
