import type { NoteLabel, PitchName } from '$lib/domain/music/types';

const FLAT_NAMES: Partial<Record<PitchName, string>> = {
	'C#': 'Db',
	'D#': 'Eb',
	'F#': 'Gb',
	'G#': 'Ab',
	'A#': 'Bb'
};

/** Naturals keep their name; altered pitches get sharp or flat at random (random() < 0.5 → sharp). Naturals are labelled 'sharp' and draw nothing. */
export function spellPitch(pitch: PitchName, random: () => number = Math.random): NoteLabel {
	if (!FLAT_NAMES[pitch]) return { pitch, spelling: 'sharp' };
	return { pitch, spelling: random() < 0.5 ? 'sharp' : 'flat' };
}

export function formatNote(label: NoteLabel): string {
	return label.spelling === 'flat' ? (FLAT_NAMES[label.pitch] ?? label.pitch) : label.pitch;
}

export function answerChoiceLabel(pitch: PitchName): string {
	const flat = FLAT_NAMES[pitch];
	return flat ? `${pitch} / ${flat}` : pitch;
}
