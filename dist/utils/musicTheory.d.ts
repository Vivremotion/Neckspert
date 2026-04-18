import type { Chord } from '../models';
export declare const NOTES: string[];
export declare function getDistance(from: string, to: string): number;
export declare function calculateInterval(from: string, to: string): string;
export declare function normalizeNoteName(note: string): string;
export declare function getDisplayNoteName(noteName: string, displayRoot: string | undefined): string;
export declare function findMatchingChords(input: string): Chord[];
