import { describe, expect, it } from 'vitest';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingOccurrences,
	type VoicingOccurrence
} from '$lib/domain/music';
import { TRIADS_ANCHOR } from '$lib/domain/exercise/catalog';
import { triadParams, triadVoicings } from './items';
import { cueFrets, occurrencePosition } from './position';

function occurrence(root: string, quality: string, frets: string): VoicingOccurrence {
	const chord = { root: parseSpelledNote(root), quality: qualityById(quality) };
	const found = closeTriadVoicings(chord, [3, 2, 1])
		.flatMap((voicing) => voicingOccurrences(voicing))
		.find((o) => o.notes.map((n) => n.fret).join('-') === frets);
	if (!found) throw new Error(`No ${root}${quality} at ${frets}`);
	return found;
}

describe('occurrencePosition', () => {
	it('is the lowest fretted fret of the shape', () => {
		expect(occurrencePosition(occurrence('D', 'maj', '2-3-2'))).toBe(2);
		expect(occurrencePosition(occurrence('D', 'maj', '7-7-5'))).toBe(5);
		expect(occurrencePosition(occurrence('D', 'maj', '11-10-10'))).toBe(10);
		expect(occurrencePosition(occurrence('D', 'maj', '14-15-14'))).toBe(14);
	});

	it('leaves the open strings out', () => {
		expect(occurrencePosition(occurrence('A', 'maj', '2-2-0'))).toBe(2);
	});

	it('calls a shape played on open strings only open', () => {
		expect(occurrencePosition(occurrence('E', 'min', '0-0-0'))).toBe('open');
	});
});

describe('cueFrets', () => {
	it('is every fret the shape covers, from its lowest fretted fret to its highest', () => {
		expect(cueFrets(occurrence('D', 'maj', '2-3-2'))).toEqual([2, 3]);
		expect(cueFrets(occurrence('D', 'maj', '7-7-5'))).toEqual([5, 6, 7]);
		expect(cueFrets(occurrence('A', 'maj', '2-2-0'))).toEqual([2]);
	});

	it('is empty for a shape on open strings only', () => {
		expect(cueFrets(occurrence('E', 'min', '0-0-0'))).toEqual([]);
	});

	it('never names a fret that two shapes of one chord on one string set share', () => {
		const byChord = new Map<string, number[]>();
		for (const voicing of triadVoicings(triadParams(TRIADS_ANCHOR))) {
			const { root, quality } = voicing.chord;
			const strings = voicing.strings.map(({ string }) => string).join();
			const chord = `${root.letter}${root.accidental}|${quality.id}|${strings}`;
			const frets = voicingOccurrences(voicing).flatMap(cueFrets);
			byChord.set(chord, [...(byChord.get(chord) ?? []), ...frets]);
		}
		expect(byChord.size).toBe(48);
		for (const frets of byChord.values()) expect(new Set(frets).size).toBe(frets.length);
	});
});
