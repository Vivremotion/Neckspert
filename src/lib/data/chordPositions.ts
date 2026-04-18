import type { Shape } from '$lib/domain/music/Shape';
import type { ChordQuality } from '$lib/domain/music/Chord';

// ─── Major (CAGED open shapes) ────────────────────────────────────────────────
// Each anchor.referencePitch is the CAGED letter; anchor.fret = 0 means the
// template IS the open-position voicing for that root.

const majorShapes: Shape[] = [
	{
		id: 'major-C',
		label: 'C shape',
		anchor: { fret: 0, referencePitch: 'C' },
		positions: [
			{ string: 5, fret: 3, finger: 3 },
			{ string: 4, fret: 2, finger: 2 },
			{ string: 3, fret: 0 },
			{ string: 2, fret: 1, finger: 1 },
			{ string: 1, fret: 0 }
		]
	},
	{
		id: 'major-A',
		label: 'A shape',
		anchor: { fret: 0, referencePitch: 'A' },
		positions: [
			{ string: 6, fret: 0 },
			{ string: 5, fret: 0 },
			{ string: 4, fret: 2, finger: 2 },
			{ string: 3, fret: 2, finger: 3 },
			{ string: 2, fret: 2, finger: 4 },
			{ string: 1, fret: 0 }
		]
	},
	{
		id: 'major-G',
		label: 'G shape',
		anchor: { fret: 0, referencePitch: 'G' },
		positions: [
			{ string: 6, fret: 3, finger: 2 },
			{ string: 5, fret: 2, finger: 1 },
			{ string: 4, fret: 0 },
			{ string: 3, fret: 0 },
			{ string: 2, fret: 3, finger: 3 },
			{ string: 1, fret: 3, finger: 4 }
		]
	},
	{
		id: 'major-E',
		label: 'E shape',
		anchor: { fret: 0, referencePitch: 'E' },
		positions: [
			{ string: 6, fret: 0 },
			{ string: 5, fret: 2, finger: 2 },
			{ string: 4, fret: 2, finger: 3 },
			{ string: 3, fret: 1, finger: 1 },
			{ string: 2, fret: 0 },
			{ string: 1, fret: 0 }
		]
	},
	{
		id: 'major-D',
		label: 'D shape',
		anchor: { fret: 0, referencePitch: 'D' },
		positions: [
			{ string: 4, fret: 0 },
			{ string: 3, fret: 2, finger: 1 },
			{ string: 2, fret: 3, finger: 3 },
			{ string: 1, fret: 2, finger: 2 }
		]
	}
];

// ─── Minor (CAGED open shapes) ────────────────────────────────────────────────

const minorShapes: Shape[] = [
	{
		id: 'minor-C',
		label: 'Cm shape',
		anchor: { fret: 0, referencePitch: 'C' },
		positions: [
			{ string: 5, fret: 3, finger: 4 },
			{ string: 4, fret: 1, finger: 2 },
			{ string: 3, fret: 0 },
			{ string: 2, fret: 1, finger: 1 },
			{ string: 1, fret: 3, finger: 3 }
		]
	},
	{
		id: 'minor-A',
		label: 'Am shape',
		anchor: { fret: 0, referencePitch: 'A' },
		positions: [
			{ string: 6, fret: 0 },
			{ string: 5, fret: 0 },
			{ string: 4, fret: 2, finger: 2 },
			{ string: 3, fret: 2, finger: 3 },
			{ string: 2, fret: 1, finger: 1 },
			{ string: 1, fret: 0 }
		]
	},
	{
		id: 'minor-G',
		label: 'Gm shape',
		anchor: { fret: 0, referencePitch: 'G' },
		positions: [
			{ string: 6, fret: 3, finger: 2 },
			{ string: 5, fret: 1, finger: 1 },
			{ string: 4, fret: 0 },
			{ string: 3, fret: 3, finger: 4 },
			{ string: 2, fret: 3, finger: 3 },
			{ string: 1, fret: 3, finger: 3 }
		]
	},
	{
		id: 'minor-E',
		label: 'Em shape',
		anchor: { fret: 0, referencePitch: 'E' },
		positions: [
			{ string: 6, fret: 0 },
			{ string: 5, fret: 2, finger: 2 },
			{ string: 4, fret: 2, finger: 3 },
			{ string: 3, fret: 0 },
			{ string: 2, fret: 0 },
			{ string: 1, fret: 0 }
		]
	},
	{
		id: 'minor-D',
		label: 'Dm shape',
		anchor: { fret: 0, referencePitch: 'D' },
		positions: [
			{ string: 4, fret: 0 },
			{ string: 3, fret: 2, finger: 2 },
			{ string: 2, fret: 3, finger: 3 },
			{ string: 1, fret: 1, finger: 1 }
		]
	}
];

// ─── Maj7 (root on 5th string = A shape) ─────────────────────────────────────
// Template: Am7-style fingering producing Amaj7 at anchor fret 0.

const maj7Shapes: Shape[] = [
	{
		id: 'maj7-A',
		label: 'Maj7 (A-string root)',
		anchor: { fret: 0, referencePitch: 'A' },
		positions: [
			{ string: 5, fret: 0, finger: 1 },
			{ string: 4, fret: 2, finger: 3 },
			{ string: 3, fret: 1, finger: 2 },
			{ string: 2, fret: 2, finger: 4 }
		]
	}
];

// ─── m7b5 (root on 5th string = A shape) ─────────────────────────────────────

const m7b5Shapes: Shape[] = [
	{
		id: 'm7b5-A',
		label: 'm7b5 (A-string root)',
		anchor: { fret: 0, referencePitch: 'A' },
		positions: [
			{ string: 5, fret: 0, finger: 1 },
			{ string: 4, fret: 1, finger: 3 },
			{ string: 3, fret: 0, finger: 2 },
			{ string: 2, fret: 1, finger: 4 }
		]
	}
];

// ─── Maj9 ─────────────────────────────────────────────────────────────────────
// First pattern: Cmaj9 voicing → anchor referencePitch = 'C'.
// Second pattern: Emaj9 voicing → anchor referencePitch = 'E'.

const maj9Shapes: Shape[] = [
	{
		id: 'maj9-C',
		label: 'Maj9 (C-string root)',
		anchor: { fret: 0, referencePitch: 'C' },
		positions: [
			{ string: 5, fret: 3, finger: 2 },
			{ string: 4, fret: 2, finger: 1 },
			{ string: 3, fret: 4, finger: 4 },
			{ string: 2, fret: 3, finger: 3 }
		]
	},
	{
		id: 'maj9-E',
		label: 'Maj9 (E-string root)',
		anchor: { fret: 0, referencePitch: 'E' },
		positions: [
			{ string: 6, fret: 0, finger: 1 },
			{ string: 4, fret: 1, finger: 2 },
			{ string: 3, fret: 1, finger: 3 },
			{ string: 2, fret: 0, finger: 1 },
			{ string: 1, fret: 2, finger: 4 }
		]
	}
];

// ─── Registry ─────────────────────────────────────────────────────────────────

export const shapesByQuality: Record<ChordQuality, Shape[]> = {
	'': majorShapes,
	m: minorShapes,
	Maj7: maj7Shapes,
	m7b5: m7b5Shapes,
	Maj9: maj9Shapes
};

/** All known quality suffixes in display order. */
export const knownQualities: ChordQuality[] = Object.keys(shapesByQuality);
