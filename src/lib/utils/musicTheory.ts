// src/lib/utils/musicTheory.ts
import type { Chord, Note } from '$lib/models';

// Interval names based on semitone distance from root
const INTERVALS = {
  0: 'R',    // Root
  1: 'm2',   // Minor Second
  2: 'M2',   // Major Second
  3: 'm3',   // Minor Third
  4: '3',   // Major Third
  5: '4',   // Perfect Fourth
  6: 'TT',   // Tritone
  7: '5',   // Perfect Fifth
  8: 'm6',   // Minor Sixth
  9: 'M6',   // Major Sixth
  10: '7',  // Minor Seventh
  11: 'M7'  // Major Seventh
};

const CAGED_SHAPES: Record<string, Note[]> = {
  C: [
    { name: "C", string: 5, fret: 3, finger: 4 },
    { name: "E", string: 4, fret: 2, finger: 3 },
    { name: "G", string: 3, fret: 0, finger: 1 },
    { name: "C", string: 2, fret: 1, finger: 2 },
    { name: "E", string: 1, fret: 0, finger: 1 }
  ],
  A: [
    { name: "A", string: 5, fret: 0, finger: 1 },
    { name: "C#", string: 4, fret: 2, finger: 3 },
    { name: "E", string: 3, fret: 2, finger: 4 },
    { name: "A", string: 2, fret: 2, finger: 1 },
    { name: "E", string: 1, fret: 0, finger: 1 }
  ],
  G: [
    { name: "G", string: 6, fret: 3, finger: 3 },
    { name: "B", string: 5, fret: 2, finger: 2 },
    { name: "D", string: 4, fret: 0, finger: 1 },
    { name: "G", string: 3, fret: 0, finger: 1 },
    { name: "B", string: 2, fret: 0, finger: 1 },
    { name: "G", string: 1, fret: 3, finger: 4 }
  ],
  E: [
    { name: "E", string: 6, fret: 0, finger: 1 },
    { name: "B", string: 5, fret: 2, finger: 2 },
    { name: "E", string: 4, fret: 2, finger: 3 },
    { name: "G#", string: 3, fret: 1, finger: 4 },
    { name: "B", string: 2, fret: 0, finger: 1 },
    { name: "E", string: 1, fret: 0, finger: 1 }
  ],
  D: [
    { name: "D", string: 4, fret: 0, finger: 1 },
    { name: "A", string: 3, fret: 2, finger: 3 },
    { name: "D", string: 2, fret: 3, finger: 4 },
    { name: "F#", string: 1, fret: 2, finger: 2 }
  ],
  Cm: [
    { name: "C", string: 5, fret: 3, finger: 3 },
    { name: "Eb", string: 4, fret: 1, finger: 1 },
    { name: "G", string: 3, fret: 0 },
    { name: "C", string: 2, fret: 1, finger: 2 },
    { name: "G", string: 1, fret: 3, finger: 4 }
  ],
  Am: [],
  Gm: [],
  Em: [],
  Dm: []
};

// All notes in order for interval calculation
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getDistance(from: string, to: string): number {
  const fromIndex = NOTES.indexOf(from);
  const toIndex = NOTES.indexOf(to);
  return (toIndex - fromIndex + 12) % 12;
}

export function calculateInterval(from: string, to: string) {
  return INTERVALS[getDistance(from, to) as keyof typeof INTERVALS];
}

// Normalize note names (e.g., "Gb" to "F#")
function normalizeNoteName(note: string): string {
  const flatsToSharps: Record<string, string> = {
    'Db': 'C#',
    'Eb': 'D#',
    'Gb': 'F#',
    'Ab': 'G#',
    'Bb': 'A#'
  };

  return flatsToSharps[note] || note;
}

// Transpose note names by fret shift
function shiftNote(note: string, steps: number): string {
  const index = NOTES.indexOf(note);
  return NOTES[(index + steps + 12) % 12];
}

// Detect root and quality from input string
function parseChordName(input: string): { root: string; quality: string } | null {
  const match = input.match(/^([A-G][#b]?)(m)?/i);
  if (!match) return null;

  const root = match[1].toUpperCase();
  const quality = match[2];
  return { root, quality };
}

// Generate matching chords
export function findMatchingChords(input: string): Chord[] {
  const parsed = parseChordName(input);
  if (!parsed) {
    console.error("Invalid chord input.");
    return [];
  }

  const { root, quality } = parsed;
  const filteredShapeNames: string[] = quality
    ? Object.keys(CAGED_SHAPES).filter((shapeName) => shapeName.includes(quality))
    : Object.keys(CAGED_SHAPES);

  // Generate chords for each CAGED voicing
  const result = filteredShapeNames.map((shapeName) => {
    const shape = CAGED_SHAPES[shapeName];
    if (shape.length === 0) return;  // Skip undefined shapes

    const parsedShape = parseChordName(shapeName);
    const rootIndex = NOTES.indexOf(normalizeNoteName(root));
    const originalRootIndex = NOTES.indexOf(normalizeNoteName(parsedShape?.root || ''));
    let semitones = originalRootIndex - rootIndex;

    const transposedNotes = shape.map((originalNote) => ({
      ...originalNote,
      name: NOTES[(NOTES.indexOf(normalizeNoteName(originalNote.name)) - semitones) % 12],
      fret: originalNote.fret - semitones
    }));

    return {
      root,
      quality: parsedShape?.quality,
      voicing: shapeName,
      notes: transposedNotes
    };
  });

  return result.filter(i => i);
}