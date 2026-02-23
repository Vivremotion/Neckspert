import type { Note } from './Note.ts';

export const DEFAULT_BEATS = 4;

export interface Chord {
  id?: string;
  root: string;
  quality: string;
  notes: Array<Note>;
  voicing?: string;
  hpcp: Array<number>;
  beats?: number;
}
