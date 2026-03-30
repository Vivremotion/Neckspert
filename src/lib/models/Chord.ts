import type { Note } from './Note.ts';
import type { NoteDuration } from './Duration.ts';
import { DEFAULT_DURATION, durationToBeats } from './Duration.ts';

export const DEFAULT_BEATS = 4;

export interface Chord {
  id?: string;
  root: string;
  displayRoot?: string;
  quality: string;
  notes: Array<Note>;
  voicing?: string;
  hpcp: Array<number>;
  beats?: number;
  duration?: NoteDuration;
}

export function getChordBeats(chord: Chord): number {
  if (chord.duration) return durationToBeats(chord.duration);
  return chord.beats ?? DEFAULT_BEATS;
}

export function getChordDuration(chord: Chord): NoteDuration {
  return chord.duration ?? DEFAULT_DURATION;
}
