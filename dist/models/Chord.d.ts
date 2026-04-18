import type { Note } from './Note.ts';
import type { NoteDuration } from './Duration.ts';
export declare const DEFAULT_BEATS = 4;
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
export declare function getChordBeats(chord: Chord): number;
export declare function getChordDuration(chord: Chord): NoteDuration;
