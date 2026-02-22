import type { Note } from './Note.ts';
/** Duration in beats (e.g. 4 = one bar in 4/4). Used in progression for rhythm mode. */
export declare const DEFAULT_CHORD_DURATION_BEATS = 4;
export interface Chord {
    id?: string;
    root: string;
    quality: string;
    notes: Array<Note>;
    voicing?: string;
    hpcp: Array<number>;
    /** Beats this chord lasts in the progression (for rhythm mode). Default 4. */
    durationBeats?: number;
}
