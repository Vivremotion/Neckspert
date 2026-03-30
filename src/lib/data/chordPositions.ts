// src/data/chordPositions.ts

import type { ChordPattern, ChordType } from '$lib/models';

const _majorPatterns: ChordPattern[] = [
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
const _minorPatterns: ChordPattern[] = [
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

const _maj7: ChordPattern[] = [
  {
    position: 'Root on 5th string',
    relativeFret: 11,
    notes: [
      { string: 5, fret: 0, finger: 1 },
      { string: 4, fret: 2, finger: 3 },
      { string: 3, fret: 1 ,finger: 2 },
      { string: 2, fret: 2, finger: 4 }
    ],
  },
];

const _m7b5: ChordPattern[] = [
  {
    position: 'Root on 5th string',
    relativeFret: 11,
    notes: [
      { string: 5, fret: 0, finger: 1 },
      { string: 4, fret: 1, finger: 3 },
      { string: 3, fret: 0 ,finger: 2 },
      { string: 2, fret: 1, finger: 4 }
    ],
  },
];

const _maj9: ChordPattern[] = [
  {
    position: 'Root on 5th string',
    relativeFret: 0,
    notes: [
      { string: 5, fret: 3, finger: 2 },
      { string: 4, fret: 2, finger: 1 },
      { string: 3, fret: 4 ,finger: 4 },
      { string: 2, fret: 3, finger: 3 }
    ],
  },
  {
    position: 'Root on 6th string',
    relativeFret: 4,
    notes: [
      { string: 6, fret: 0, finger: 1 },
      { string: 4, fret: 1, finger: 2 },
      { string: 3, fret: 1 ,finger: 3 },
      { string: 2, fret: 0, finger: 1 },
      { string: 1, fret: 2, finger: 4 }
    ],
  },
];

export const chordTypes: ChordType[] = [
  {
    suffix: "",  // Major
    patterns: _majorPatterns
  },
  {
    suffix: "m",  // Minor
    patterns: _minorPatterns
  },
  {
    suffix: "Maj7",
    patterns: _maj7
  },
  {
    suffix: "m7b5",
    patterns: _m7b5
  },
  {
    suffix: "Maj9",
    patterns: _maj9
  }
  
];