// src/utils/chordUtils.ts

import type { Note, Chord, ChordType, ChordPattern } from '$lib/models';
import { chordTypes } from '$lib/data/chordPositions';
import { NOTES, getDistance } from './musicTheory.js';

function getNoteAtFret(baseNote: string, fret: number): string {
  const baseIndex = NOTES.indexOf(baseNote);
  const targetIndex = (baseIndex + fret) % 12;
  return NOTES[targetIndex];
}

export function generateChords(root: string): Chord[] {
  const chords: Chord[] = [];
  
  // Standard tuning of guitar strings (from 6th to 1st)
  const openStrings = ['E', 'A', 'D', 'G', 'B', 'E'];

  chordTypes.forEach((chordType: ChordType) => {
    chordType.patterns.forEach((pattern: ChordPattern) => {
      // Calculate the actual fret positions based on the root note
      const rootDistance = getDistance(pattern.position, root);  // Assuming patterns are based on C
      const baseFret = rootDistance + pattern.relativeFret;
      
      // Generate the actual notes for this voicing
      const notes: Note[] = pattern.notes.map((note: Note) => {
        const actualFret = (note.fret + baseFret) % 12;
        const stringNote = openStrings[6 - note.string];  // Convert to 0-based index
        const noteName = getNoteAtFret(stringNote, actualFret);
        
        return {
          ...note,
          fret: actualFret,
          name: noteName
        };
      });

      // Create the chord object
      chords.push({
        id: `${root}${chordType.suffix}-${pattern.position}`,
        root: root,
        quality: chordType.suffix,
        voicing: pattern.position,
        hpcp: NOTES.sort().map(note => +notes.map(n => n.name).includes(note)),
        notes
      });
    });
  });

  return chords;
}

export function searchChords(searchTerm: string): Chord[] {
  if (!searchTerm) return [];
  
  const normalizedSearch = searchTerm.toUpperCase();
  const matchingNotes = NOTES.filter(note => 
    note.toUpperCase().startsWith(normalizedSearch)
  );
  
  return matchingNotes.flatMap(note => generateChords(note));
}