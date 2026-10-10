import { describe, expect, it } from 'vitest';
import { QUALITIES, chordTones, qualityById, type Chord, type ChordQuality } from './chord';
import { formatSpelledNote, parseSpelledNote, pitchOfSpelled, spelledFromPitch } from './spelling';
import { closeTriadVoicings } from './triads';
import { CHROMATIC_NOTES } from './types';
import {
	MAX_SPAN_FRETS,
	MAX_VOICING_FRET,
	voicingKey,
	voicingOccurrences,
	type StringSet
} from './voicing';

function chord(root: string, quality: string | ChordQuality): Chord {
	return {
		root: parseSpelledNote(root),
		quality: typeof quality === 'string' ? qualityById(quality) : quality
	};
}

const G_B_E: StringSet = [3, 2, 1];
const D_G_B: StringSet = [4, 3, 2];

describe('closeTriadVoicings', () => {
	it('gives root position, first inversion, then second inversion', () => {
		expect(closeTriadVoicings(chord('D', 'maj'), G_B_E).map(voicingKey)).toEqual([
			'D|maj|3:1,2:3,1:5',
			'D|maj|3:3,2:5,1:1',
			'D|maj|3:5,2:1,1:3'
		]);
	});

	it('shares keys across spellings and keeps the chord spelling for notes', () => {
		const eb = closeTriadVoicings(chord('Eb', 'min'), G_B_E);
		expect(eb.map(voicingKey)).toEqual(
			closeTriadVoicings(chord('D#', 'min'), G_B_E).map(voicingKey)
		);
		const [first] = voicingOccurrences(eb[0]);
		expect(first.notes.map((n) => formatSpelledNote(n.note))).toEqual(['Eb', 'Gb', 'Bb']);
	});

	it('refuses a seventh quality', () => {
		expect(() => closeTriadVoicings(chord('D', 'm7'), G_B_E)).toThrow(RangeError);
	});

	it('needs a three-note quality and three strings', () => {
		const maj7: ChordQuality = { id: 'maj7', suffix: 'maj7', degrees: ['1', '3', '5', '7'] };
		expect(() => closeTriadVoicings(chord('C', maj7), G_B_E)).toThrow(RangeError);
		expect(() => closeTriadVoicings(chord('C', 'maj'), [3, 2])).toThrow(RangeError);
	});

	it('always fits the neck and the hand, with chord tones rising string to string', () => {
		for (const pitch of CHROMATIC_NOTES) {
			for (const quality of QUALITIES) {
				const triad: Chord = { root: spelledFromPitch(pitch), quality };
				const tones = chordTones(triad).map((tone) => tone.pitch);
				for (const strings of [G_B_E, D_G_B]) {
					for (const voicing of closeTriadVoicings(triad, strings)) {
						const occurrences = voicingOccurrences(voicing);
						expect(occurrences.length).toBeGreaterThan(0);
						for (const { notes } of occurrences) {
							const fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
							const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
							expect(notes.every((n) => tones.includes(pitchOfSpelled(n.note)))).toBe(true);
							expect(span).toBeLessThanOrEqual(MAX_SPAN_FRETS);
							expect(notes.every((n) => n.fret <= MAX_VOICING_FRET)).toBe(true);
							expect(notes.every((n, i) => i === 0 || n.midi > notes[i - 1].midi)).toBe(true);
							expect(notes[notes.length - 1].midi - notes[0].midi).toBeLessThan(12);
						}
					}
				}
			}
		}
	});
});
