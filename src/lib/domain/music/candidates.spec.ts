import { describe, expect, it } from 'vitest';
import { voicingCandidates, type VoicingCandidate } from './candidates';
import { chordLabel, qualityById, type Chord } from './chord';
import { parseSpelledNote } from './spelling';
import { closeTriadVoicings } from './triads';
import { voicingOccurrences, type VoicingOccurrence } from './voicing';

const chord = (root: string, quality: string): Chord => ({
	root: parseSpelledNote(root),
	quality: qualityById(quality)
});

const summary = (c: VoicingCandidate) => [c.kind, c.occurrence.notes.map((n) => n.fret)];

/** Occurrence of the close voicing with the root on the B string, at `frets`. */
function rootOnB(
	chordOf: Chord,
	frets: number[]
): { at: VoicingOccurrence; inversions: ReturnType<typeof closeTriadVoicings> } {
	const inversions = closeTriadVoicings(chordOf, [3, 2, 1]);
	const at = voicingOccurrences(inversions[2]).find(
		(o) => o.notes.map((n) => n.fret).join() === frets.join()
	);
	if (!at) throw new Error(`No occurrence at ${frets}`);
	return { at, inversions };
}

describe('voicingCandidates', () => {
	it('lists what D 2-3-2 could be mistaken for, nearest first within each kind', () => {
		const { at, inversions } = rootOnB(chord('D', 'maj'), [2, 3, 2]);
		expect(voicingCandidates(at, inversions).map(summary)).toEqual([
			['expected', [2, 3, 2]],
			['other-octave', [14, 15, 14]],
			['other-inversion', [7, 7, 5]],
			['other-inversion', [11, 10, 10]],
			['other-quality', [2, 3, 1]],
			['other-quality', [3, 3, 2]]
		]);
	});

	it('picks the other qualities nearest to the expected octave', () => {
		const { at, inversions } = rootOnB(chord('D', 'maj'), [14, 15, 14]);
		const candidates = voicingCandidates(at, inversions).map(summary);
		expect(candidates.filter(([kind]) => kind === 'other-octave')).toEqual([
			['other-octave', [2, 3, 2]]
		]);
		expect(candidates.filter(([kind]) => kind === 'other-quality')).toEqual([
			['other-quality', [14, 15, 13]],
			['other-quality', [15, 15, 14]]
		]);
	});

	it('moves a minor triad to major and diminished', () => {
		const { at, inversions } = rootOnB(chord('D', 'min'), [2, 3, 1]);
		expect(
			voicingCandidates(at, inversions)
				.filter((c) => c.kind === 'other-quality')
				.map(summary)
		).toEqual([
			['other-quality', [2, 3, 2]],
			['other-quality', [1, 3, 1]]
		]);
	});

	it('names the chords of the other qualities', () => {
		const { at, inversions } = rootOnB(chord('D', 'maj'), [2, 3, 2]);
		expect(
			voicingCandidates(at, inversions)
				.filter((c) => c.kind === 'other-quality')
				.map((c) => chordLabel(c.occurrence.voicing.chord))
		).toEqual(['Dm', 'Daug']);
	});
});
