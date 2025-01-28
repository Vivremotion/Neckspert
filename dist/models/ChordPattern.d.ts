import type { Note } from "./Note.ts";
export interface ChordPattern {
    position: 'C' | 'A' | 'G' | 'E' | 'D';
    relativeFret: number;
    notes: Omit<Note, 'name'>[];
}
