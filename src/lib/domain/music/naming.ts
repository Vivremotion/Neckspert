import type { NoteLabel, PitchName, StringNumber } from '$lib/domain/music/types';
import type { Locale } from '$lib/domain/types';

const FLAT_NAMES: Partial<Record<PitchName, string>> = {
	'C#': 'Db',
	'D#': 'Eb',
	'F#': 'Gb',
	'G#': 'Ab',
	'A#': 'Bb'
};

const STRING_LABELS: Record<Locale, Record<StringNumber, string>> = {
	fr: {
		1: 'corde de E aiguë',
		2: 'corde de B',
		3: 'corde de G',
		4: 'corde de D',
		5: 'corde de A',
		6: 'corde de E grave'
	},
	en: {
		1: 'high E string',
		2: 'B string',
		3: 'G string',
		4: 'D string',
		5: 'A string',
		6: 'low E string'
	}
};

const OPEN_STRING_LABELS: Record<Locale, string> = { fr: 'corde à vide', en: 'open string' };

const FRET_WORDS: Record<Locale, string> = { fr: 'case', en: 'fret' };

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

export function stringLabel(string: StringNumber, locale: Locale): string {
	return STRING_LABELS[locale][string];
}

export function fretLabel(fret: number, locale: Locale): string {
	return fret === 0 ? OPEN_STRING_LABELS[locale] : `${FRET_WORDS[locale]} ${fret}`;
}
