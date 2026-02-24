import { DEFAULT_DURATION, durationToBeats } from './Duration.ts';
export const DEFAULT_BEATS = 4;
export function getChordBeats(chord) {
    if (chord.duration)
        return durationToBeats(chord.duration);
    return chord.beats ?? DEFAULT_BEATS;
}
export function getChordDuration(chord) {
    return chord.duration ?? DEFAULT_DURATION;
}
