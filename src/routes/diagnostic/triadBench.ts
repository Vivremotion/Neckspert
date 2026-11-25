import type { ChordExpectation } from '$lib/application/ports';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingCandidates,
	voicingOccurrences,
	type StringNumber,
	type StringSet,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';

/** Three adjacent strings a close triad is played on, lowest first, as the diagnostic page offers them. */
export interface StringSetChoice {
	label: string;
	strings: StringSet;
}

export const STRING_NAMES: Readonly<Record<StringNumber, string>> = {
	1: 'mi aigu',
	2: 'si',
	3: 'sol',
	4: 'ré',
	5: 'la',
	6: 'mi grave'
};

export const STRING_SETS: readonly StringSetChoice[] = [
	{ label: 'sol-si-mi', strings: [3, 2, 1] },
	{ label: 'ré-sol-si', strings: [4, 3, 2] },
	{ label: 'la-ré-sol', strings: [5, 4, 3] },
	{ label: 'mi-la-ré', strings: [6, 5, 4] }
];

/** closeTriadVoicings order: root on the lowest string, on the highest, on the middle one. */
export function inversionIndex(strings: StringSet, rootString: StringNumber): number {
	return [strings[0], strings[2], strings[1]].indexOf(rootString);
}

export function fretsOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes.map((n) => n.fret).join('-');
}

function inversionsOf(root: string, quality: 'maj' | 'min', strings: StringSet): Voicing[] {
	return closeTriadVoicings(
		{ root: parseSpelledNote(root), quality: qualityById(quality) },
		strings
	);
}

/** The places on the neck of the triad whose root is on `rootString`, lowest first. */
export function benchOccurrences(
	root: string,
	quality: 'maj' | 'min',
	strings: StringSet,
	rootString: StringNumber
): VoicingOccurrence[] {
	const inversions = inversionsOf(root, quality, strings);
	return voicingOccurrences(inversions[Math.max(0, inversionIndex(strings, rootString))]);
}

/** What the verifier listens for when the bench expects `occurrence`, and how the page names it. */
export function benchExpectation(
	root: string,
	quality: 'maj' | 'min',
	strings: StringSet,
	occurrence: VoicingOccurrence,
	opensAt: number
): { expectation: ChordExpectation; label: string } {
	const candidates = voicingCandidates(occurrence, inversionsOf(root, quality, strings)).map(
		(c) => ({
			id: fretsOf(c.occurrence),
			kind: c.kind,
			notes: c.occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
		})
	);
	return {
		expectation: { opensAt, expected: [fretsOf(occurrence)], candidates, style: 'unknown' },
		label: `${root}${quality === 'min' ? 'm' : ''} ${fretsOf(occurrence)}`
	};
}
