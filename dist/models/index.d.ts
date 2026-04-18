/**
 * Compatibility shim — re-exports from the domain layer so legacy callers
 * (e.g. ChordVerifier, HPCPComparisonResult users) keep working.
 * New code should import directly from $lib/domain/music.
 */
export type { NoteValue, NoteDuration } from '../domain/rhythm/Duration';
export { NOTE_VALUES, NOTE_BEATS, NOTE_LABELS, DEFAULT_DURATION, durationToBeats, beatsToDuration, cycleNoteValue } from '../domain/rhythm/Duration';
