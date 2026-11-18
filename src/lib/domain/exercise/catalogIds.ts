/** The catalog ids the code still names (D6); everything else about an exercise is read from the registry. */
export const LOCATE_NECK_ID = 'locate-neck';
export const IDENTIFY_NECK_ID = 'identify-neck';
export const TRIADS_ANCHOR_ID = 'triads-anchor';
export const TRIADS_ZONE_ID = 'triads-zone';
/** In the order of the ladder. */
export const GESTURE_EXERCISE_IDS = [
	'gesture-link',
	'gesture-climb',
	'gesture-zone',
	'gesture-jam'
] as const;
/** The grid the gesture demo plays (`/dev/gesture`). */
export const DEMO_GRID_ID = 'iohefy-a';
/** The exercise whose figure the figure view's development page shows (`/dev/rhythm`). */
export const RHYTHM_SILENT_BARS_ID = 'rhythm-silent-bars';
/** The catalog skills the code still names. */
export const LOCATE_SKILL_ID = 'locate-note-string';
export const IDENTIFY_SKILL_ID = 'identify-note';
export const CHORD_ANCHOR_SKILL_ID = 'chord-anchor';
export const CHORD_ZONE_SKILL_ID = 'chord-zone';
/** The skills the gesture's four exercises practise, in the order of the ladder. */
export const CHANGE_SKILL_IDS = [
	'inversion-run',
	'grid-in-direction',
	'grid-in-zone',
	'grid-reading'
] as const;
