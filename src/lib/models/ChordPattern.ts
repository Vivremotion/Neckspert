import type { Note } from "./Note.ts";

export interface ChordPattern {
    position: 'C' | 'A' | 'G' | 'E' | 'D';
    relativeFret: number;  // Relative to the root note
    notes: Omit<Note, 'name'>[];  // Note without name as it will be calculated
  }