export type NoteValue = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export interface NoteDuration {
	value: NoteValue;
	dotted: boolean;
}

export const NOTE_VALUES: NoteValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];

export const NOTE_BEATS: Record<NoteValue, number> = {
	whole: 4,
	half: 2,
	quarter: 1,
	eighth: 0.5,
	sixteenth: 0.25
};

export const NOTE_LABELS: Record<NoteValue, string> = {
	whole: 'Whole',
	half: 'Half',
	quarter: 'Quarter',
	eighth: 'Eighth',
	sixteenth: '16th'
};

export const DEFAULT_DURATION: NoteDuration = { value: 'quarter', dotted: false };

export function durationToBeats(duration: NoteDuration): number {
	const base = NOTE_BEATS[duration.value];
	return duration.dotted ? base * 1.5 : base;
}

export function beatsToDuration(beats: number): NoteDuration {
	const mapping: [number, NoteDuration][] = [
		[6, { value: 'whole', dotted: true }],
		[4, { value: 'whole', dotted: false }],
		[3, { value: 'half', dotted: true }],
		[2, { value: 'half', dotted: false }],
		[1.5, { value: 'quarter', dotted: true }],
		[1, { value: 'quarter', dotted: false }],
		[0.75, { value: 'eighth', dotted: true }],
		[0.5, { value: 'eighth', dotted: false }],
		[0.375, { value: 'sixteenth', dotted: true }],
		[0.25, { value: 'sixteenth', dotted: false }]
	];

	let closest = mapping[0];
	let closestDiff = Math.abs(beats - closest[0]);

	for (const entry of mapping) {
		const diff = Math.abs(beats - entry[0]);
		if (diff < closestDiff) {
			closest = entry;
			closestDiff = diff;
		}
	}

	return closest[1];
}

export function cycleNoteValue(current: NoteValue, direction: 1 | -1 = 1): NoteValue {
	const idx = NOTE_VALUES.indexOf(current);
	const next = (idx + direction + NOTE_VALUES.length) % NOTE_VALUES.length;
	return NOTE_VALUES[next];
}
