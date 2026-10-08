import { describe, expect, it } from 'vitest';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingOccurrences,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrencePosition } from './position';

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
