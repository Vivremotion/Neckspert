import type { ChordCandidate, ChordExpectation } from '$lib/application/ports';
import {
	voicingOnStringsSet,
	type ChordConfusion,
	type ChordReading,
	type TriadAnchorConfusion,
	type TriadAnchorData,
	type TriadZoneData,
	type TriadZoneItem,
	type VoicingOnStringsItem
} from '$lib/domain/sets';
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
import type { SetPresenter } from './types';

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
function anchorData(item: VoicingOnStringsItem, value: ResponseValue): TriadAnchorData {
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
		item: item as TriadAnchorData['item'],
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

/** `Attempt.data` of a round that asks the chord alone (the zone's). */
function chordData(item: VoicingOnStringsItem, value: ResponseValue): TriadZoneData {
	const chord = resultAt(value, 0);
	return {
		item: item as TriadZoneItem,
		answer: chord.answer as ChordReading | null,
		confusion: chord.confusion as ChordConfusion | null
	};
}

/**
 * A triad voicing on its strings, played on the guitar: its words and what it draws are its
 * exercise's presentation. The chord sensor listens for the shape at the item's position when it
 * has one, else for the lowest shape at any octave. An attempt keeps what was heard of each part
 * when its round asks the root then the chord (the anchor), else of the chord alone (the zone).
 */
export const voicingOnStringsPresenter: SetPresenter<VoicingOnStringsItem> = {
	set: voicingOnStringsSet,
	scene: 'guitar',
	sensors: ['note', 'chord'],
	contestable: true,
	expectation: (item, round) => {
		const voicing = parseVoicingKey(item.voicingKey);
		return {
			chord:
				item.position === undefined
					? chordExpectation(voicing, lowestShape(voicing), true, round)
					: chordExpectation(voicing, shapeAt(voicing, item.position), false, round)
		};
	},
	attemptData: (item, value) =>
		value.expectations.length === 2 ? anchorData(item, value) : chordData(item, value)
};
