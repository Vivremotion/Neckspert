import { describe, expect, it } from 'vitest';
import { qualityById, type Chord, type ChordQuality } from './chord';
import { formatSpelledNote, parseSpelledNote } from './spelling';
import {
	MAX_SPAN_FRETS,
	MAX_VOICING_FRET,
	createVoicing,
	occurrencePositions,
	parseVoicingKey,
	voicingKey,
	voicingOccurrences,
	type VoicingOccurrence,
	type VoicingString
} from './voicing';

function chord(root: string, quality: string | ChordQuality): Chord {
	return {
		root: parseSpelledNote(root),
		quality: typeof quality === 'string' ? qualityById(quality) : quality
	};
}

/** `'3:5,2:1,1:3'` → strings with their degrees. */
function strings(spec: string): VoicingString[] {
	return spec.split(',').map((part) => {
		const [string, degree] = part.split(':');
		return { string: Number(string), degree } as VoicingString;
	});
}

const frets = (o: VoicingOccurrence) => o.notes.map((n) => n.fret);
const allFrets = (root: string, quality: string | ChordQuality, spec: string) =>
	voicingOccurrences(createVoicing(chord(root, quality), strings(spec))).map(frets);

const MAJ7: ChordQuality = { id: 'maj7', suffix: 'maj7', degrees: ['1', '3', '5', '7'] };
const D_ROOT_ON_B = createVoicing(chord('D', 'maj'), strings('3:5,2:1,1:3'));

describe('constants', () => {
	it('reach fret 17 within a four-fret hand', () => {
		expect([MAX_VOICING_FRET, MAX_SPAN_FRETS]).toEqual([17, 4]);
	});
});

describe('createVoicing', () => {
	it('rejects empty, doubled or unordered strings', () => {
		const d = chord('D', 'maj');
		expect(() => createVoicing(d, [])).toThrow(RangeError);
		expect(() => createVoicing(d, strings('3:1,3:3'))).toThrow(RangeError);
		expect(() => createVoicing(d, strings('1:1,2:3,3:5'))).toThrow(RangeError);
	});

	it('rejects a malformed root', () => {
		const strings3 = strings('3:1,2:b3,1:5');
		const bad = [
			{ letter: 'Eb', accidental: 0 },
			{ letter: 'E', accidental: '-1' },
			{ letter: 'e', accidental: -1 },
			{ letter: 'E', accidental: 3 },
			{ letter: 'E', accidental: 0.5 }
		];
		for (const root of bad) {
			const malformed = { root, quality: qualityById('min') } as unknown as Chord;
			expect(() => createVoicing(malformed, strings3)).toThrow(RangeError);
		}
	});

	it('rejects a degree outside the quality', () => {
		expect(() => createVoicing(chord('D', 'maj'), strings('3:b3,2:5,1:1'))).toThrow(RangeError);
	});

	it('accepts a missing or doubled degree', () => {
		expect(createVoicing(chord('G', 'maj'), strings('6:1,4:5')).strings).toHaveLength(2);
		expect(createVoicing(chord('D', 'maj'), strings('4:1,3:5,2:1')).strings).toHaveLength(3);
	});
});

describe('voicingKey', () => {
	it('is fixed: sharp pitch, quality, string:degree from low to high', () => {
		expect(voicingKey(D_ROOT_ON_B)).toBe('D|maj|3:5,2:1,1:3');
	});

	it('does not depend on spelling', () => {
		const key = (root: string, quality: string) =>
			voicingKey(createVoicing(chord(root, quality), strings('3:1,2:b3,1:5')));
		expect(key('Eb', 'min')).toBe(key('D#', 'min'));
		const major = (root: string) =>
			voicingKey(createVoicing(chord(root, 'maj'), strings('3:1,2:3,1:5')));
		expect(major('Cb')).toBe(major('B'));
	});

	it('survives a JSON round trip of the voicing', () => {
		expect(voicingKey(JSON.parse(JSON.stringify(D_ROOT_ON_B)))).toBe('D|maj|3:5,2:1,1:3');
	});
});

describe('parseVoicingKey', () => {
	it('gives back the voicing, root spelled with sharps', () => {
		expect(voicingKey(parseVoicingKey('D|maj|3:5,2:1,1:3'))).toBe('D|maj|3:5,2:1,1:3');
		const eb = createVoicing(chord('Eb', 'min'), strings('3:1,2:b3,1:5'));
		expect(formatSpelledNote(parseVoicingKey(voicingKey(eb)).chord.root)).toBe('D#');
	});

	it('rejects a corrupted key', () => {
		for (const key of ['D|sus4|3:1', 'D|maj|3:9', 'D|maj', 'H|maj|3:1', 'D|maj|7:1', 'D|maj|']) {
			expect(() => parseVoicingKey(key)).toThrow(RangeError);
		}
	});
});

describe('voicingOccurrences', () => {
	it('finds D on G-B-E in every inversion and octave', () => {
		expect(allFrets('D', 'maj', '3:5,2:1,1:3')).toEqual([
			[2, 3, 2],
			[14, 15, 14]
		]);
		expect(allFrets('D', 'maj', '3:1,2:3,1:5')).toEqual([[7, 7, 5]]);
		expect(allFrets('D', 'maj', '3:3,2:5,1:1')).toEqual([[11, 10, 10]]);
	});

	it('keeps open strings out of the span but never lets voices cross', () => {
		expect(allFrets('A', 'maj', '3:1,2:3,1:5')).toEqual([
			[2, 2, 0],
			[14, 14, 12]
		]);
		expect(allFrets('G', 'maj', '6:1,4:5')).toEqual([
			[3, 0],
			[15, 12]
		]);
	});

	it('keeps neighbouring strings within an octave, so a close shape stays close', () => {
		expect(allFrets('G', 'maj', '3:1,2:3,1:5')).toEqual([[12, 12, 10]]);
	});

	it('describes each note', () => {
		const [occurrence] = voicingOccurrences(D_ROOT_ON_B);
		expect(occurrence.notes.map((n) => n.midi)).toEqual([57, 62, 66]);
		expect(occurrence.notes.map((n) => n.degree)).toEqual(['5', '1', '3']);
		expect(occurrence.notes.map((n) => formatSpelledNote(n.note))).toEqual(['A', 'D', 'F#']);
	});

	it('handles a four-note quality on non-adjacent strings', () => {
		expect(allFrets('C', MAJ7, '6:1,4:7,3:3')).toEqual([[8, 9, 9]]);
	});
});

describe('occurrencePositions', () => {
	it('gives the neck positions of an occurrence', () => {
		expect(occurrencePositions(voicingOccurrences(D_ROOT_ON_B)[0])).toEqual([
			{ string: 3, fret: 2 },
			{ string: 2, fret: 3 },
			{ string: 1, fret: 2 }
		]);
	});
});
