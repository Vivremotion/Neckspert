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
import type { ChordShape } from '$lib/domain/families/guitar/chordShapes';
import { admittedMembers, MEMBER_CONTENT, type MemberContent } from '$lib/domain/judges';
import { occurrenceId, occurrencePosition } from '$lib/domain/triads';
import type { Expectation, ExpectationResult, ResponseValue } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
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
 * What the chord sensor listens for: the shapes its round admits, and around the lowest of them
 * the look-alikes (spec 2026-10-07), never a shape of the chord still ringing from the prompt
 * before.
 */
function chordExpectation(
	voicing: Voicing,
	admitted: readonly ChordShape[],
	round: { opensAt: number; previous: PlannedItem | null }
): ChordExpectation {
	const inversions = closeTriadVoicings(
		voicing.chord,
		voicing.strings.map((s) => s.string)
	);
	// As the lowest shape is drawn: a shape on open strings only when no other is admitted.
	const centre =
		admitted.find((shape) => occurrencePosition(shape.occurrence) !== 'open') ?? admitted[0];
	const expected = new Set(admitted.map((shape) => shape.id));
	const excluded = ringing(round.previous);
	const candidates = voicingCandidates(centre.occurrence, inversions)
		.filter((c) => voicingKey(c.occurrence.voicing) !== excluded)
		.map((c) =>
			toCandidate(expected.has(occurrenceId(c.occurrence)) ? 'expected' : c.kind, c.occurrence)
		);
	return {
		opensAt: round.opensAt,
		expected: candidates.filter((c) => c.kind === 'expected').map((c) => c.id),
		candidates,
		style: 'unknown'
	};
}

/** The shapes the round's chord expectation admits; none when it has no chord expectation. */
function admittedShapes(expectations: readonly Pick<Expectation, 'sensor' | 'content'>[]) {
	const chord = expectations.find(
		(e) => e.sensor === 'chord' && e.content?.kind === MEMBER_CONTENT
	);
	return chord ? (admittedMembers(chord.content!.value as MemberContent) as ChordShape[]) : [];
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
 * exercise's presentation. The chord sensor listens for the shapes the round's chord
 * expectation admits. An attempt keeps what was heard of each part when its round asks the root
 * then the chord (the anchor), else of the chord alone (the zone).
 */
export const voicingOnStringsPresenter: SetPresenter<VoicingOnStringsItem> = {
	set: voicingOnStringsSet,
	scene: 'guitar',
	sensors: ['note', 'chord'],
	contestable: true,
	expectation: (item, round) => {
		const admitted = admittedShapes(round.expectations);
		// A round that admits no shape tells the chord sensor nothing.
		if (admitted.length === 0) return {};
		return { chord: chordExpectation(parseVoicingKey(item.voicingKey), admitted, round) };
	},
	attemptData: (item, value) =>
		value.expectations.length === 2 ? anchorData(item, value) : chordData(item, value)
};
