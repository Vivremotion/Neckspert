import type { Note } from './Note.ts';

export interface Chord {
  id?: string;
  root: string;
  quality: string;
  notes: Array<Note>;
  voicing?: string;
  hpcp: Array<number>
}
