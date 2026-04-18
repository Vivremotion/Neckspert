// src/utils/chordUtils.ts
import { chordTypes } from '../data/chordPositions';
import { NOTES, getDistance, normalizeNoteName } from './musicTheory.js';
function getNoteAtFret(baseNote, fret) {
    const baseIndex = NOTES.indexOf(baseNote);
    const targetIndex = (baseIndex + fret) % 12;
    return NOTES[targetIndex];
}
export function generateChords(root) {
    const chords = [];
    // Standard tuning of guitar strings (from 6th to 1st)
    const openStrings = ['E', 'A', 'D', 'G', 'B', 'E'];
    chordTypes.forEach((chordType) => {
        chordType.patterns.forEach((pattern) => {
            // Calculate the actual fret positions based on the root note
            const rootDistance = getDistance(pattern.position, root); // Assuming patterns are based on C
            const baseFret = rootDistance + pattern.relativeFret;
            // Generate the actual notes for this voicing
            let notes = pattern.notes.map((note) => {
                const rawFret = note.fret + baseFret;
                const actualFret = ((rawFret % 12) + 12) % 12; // proper modulo for negative
                const stringNote = openStrings[6 - note.string]; // Convert to 0-based index
                const noteName = getNoteAtFret(stringNote, actualFret);
                return {
                    ...note,
                    fret: actualFret,
                    name: noteName
                };
            });
            // If chord has open strings (0) but other notes are high on the neck,
            // show the octave-up position so the diagram is playable in one position
            // (e.g. B in D shape: 2nd string 12th fret, 1st/3rd at 11, not open 2nd + 9/11)
            const hasOpen = notes.some((n) => n.fret === 0);
            const maxFretInChord = Math.max(...notes.map((n) => n.fret));
            if (hasOpen && maxFretInChord > 5) {
                notes = notes.map((n) => ({
                    ...n,
                    fret: n.fret === 0 ? 12 : n.fret
                }));
            }
            // Create the chord object
            chords.push({
                id: `${root}${chordType.suffix}-${pattern.position}`,
                root: root,
                quality: chordType.suffix,
                voicing: pattern.position,
                hpcp: NOTES.sort().map(note => +notes.map(n => n.name).includes(note)),
                notes
            });
        });
    });
    return chords;
}
export function searchChords(searchTerm) {
    if (!searchTerm)
        return [];
    const match = searchTerm.match(/^([A-Ga-g][#b]?)(.*)$/);
    if (!match)
        return [];
    const rawRoot = match[1][0].toUpperCase() + (match[1][1] ?? '');
    const suffixSearch = match[2];
    const sharpRoot = normalizeNoteName(rawRoot);
    if (!NOTES.includes(sharpRoot))
        return [];
    const isFlat = rawRoot !== sharpRoot;
    const allChords = generateChords(sharpRoot).map(chord => isFlat ? { ...chord, displayRoot: rawRoot } : chord);
    if (!suffixSearch)
        return allChords;
    return allChords.filter(chord => chord.quality.toLowerCase().startsWith(suffixSearch.toLowerCase()));
}
