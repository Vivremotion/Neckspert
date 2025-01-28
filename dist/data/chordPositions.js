// src/data/chordPositions.ts
// Define basic major CAGED positions
const _majorPatterns = [
    {
        position: 'C',
        relativeFret: 0,
        notes: [
            { string: 5, fret: 3, finger: 3 },
            { string: 4, fret: 2, finger: 2 },
            { string: 3, fret: 0 },
            { string: 2, fret: 1, finger: 1 },
            { string: 1, fret: 0 }
        ]
    },
    {
        position: 'A',
        relativeFret: 0,
        notes: [
            { string: 6, fret: 0 },
            { string: 5, fret: 0 },
            { string: 4, fret: 2, finger: 2 },
            { string: 3, fret: 2, finger: 3 },
            { string: 2, fret: 2, finger: 4 },
            { string: 1, fret: 0 }
        ]
    },
    {
        position: 'G',
        relativeFret: 0,
        notes: [
            { string: 6, fret: 3 },
            { string: 5, fret: 2 },
            { string: 4, fret: 0 },
            { string: 3, fret: 0 },
            { string: 2, fret: 3 },
            { string: 1, fret: 3 }
        ]
    },
    {
        position: 'E',
        relativeFret: 0,
        notes: [
            { string: 6, fret: 0 },
            { string: 5, fret: 2 },
            { string: 4, fret: 2 },
            { string: 3, fret: 1 },
            { string: 2, fret: 0 },
            { string: 1, fret: 0 }
        ]
    },
    {
        position: 'D',
        relativeFret: 0,
        notes: [
            { string: 4, fret: 0 },
            { string: 3, fret: 2 },
            { string: 2, fret: 3 },
            { string: 1, fret: 2 }
        ]
    },
    // Add other CAGED positions similarly
];
// Define basic minor CAGED positions
const _minorPatterns = [
    {
        position: 'C',
        relativeFret: 0,
        notes: [
            { string: 5, fret: 3, finger: 4 },
            { string: 4, fret: 1, finger: 2 },
            { string: 3, fret: 0 },
            { string: 2, fret: 1, finger: 1 },
            { string: 1, fret: 3 },
        ]
    },
    {
        position: 'A',
        relativeFret: 0,
        notes: [
            { string: 6, fret: 0 },
            { string: 5, fret: 0 },
            { string: 4, fret: 2, finger: 2 },
            { string: 3, fret: 2, finger: 3 },
            { string: 2, fret: 1, finger: 1 },
            { string: 1, fret: 0 }
        ]
    },
    {
        position: 'G',
        relativeFret: 0,
        notes: [
            { string: 6, fret: 3 },
            { string: 5, fret: 1 },
            { string: 4, fret: 0 },
            { string: 3, fret: 3 },
            { string: 2, fret: 3 },
            { string: 1, fret: 3 }
        ]
    },
    {
        position: 'E',
        relativeFret: 0,
        notes: [
            { string: 6, fret: 0 },
            { string: 5, fret: 2 },
            { string: 4, fret: 2 },
            { string: 3, fret: 0 },
            { string: 2, fret: 0 },
            { string: 1, fret: 0 }
        ]
    },
    {
        position: 'D',
        relativeFret: 0,
        notes: [
            { string: 4, fret: 0 },
            { string: 3, fret: 2 },
            { string: 2, fret: 3 },
            { string: 1, fret: 1 }
        ]
    },
];
const _7sharp9 = [
    {
        position: 'F',
        relativeFret: 1,
        notes: [
            { string: 6, fret: 4 },
            { string: 5, fret: 3 },
            { string: 4, fret: 1 },
            { string: 3, fret: 2 }
        ]
    },
    {
        position: 'A#',
        relativeFret: 0,
        notes: [
            { string: 5, fret: 1 },
            { string: 4, fret: 0 },
            { string: 3, fret: 1 },
            { string: 2, fret: 2 }
        ]
    },
    {
        position: 'D#',
        relativeFret: 1,
        notes: [
            { string: 4, fret: 4 },
            { string: 3, fret: 3 },
            { string: 2, fret: 2 },
            { string: 1, fret: 3 }
        ]
    },
];
export const chordTypes = [
    {
        suffix: "", // Major
        patterns: _majorPatterns
    },
    {
        suffix: "m", // Minor
        patterns: _minorPatterns
    },
    {
        suffix: "7(#9)",
        patterns: _7sharp9
    }
    // Add more chord types (7, maj7, etc.)
];
