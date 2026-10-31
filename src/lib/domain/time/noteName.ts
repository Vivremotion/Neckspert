import { MAX_PITCH, MIN_PITCH } from './figure';

/**
 * A note's name as LilyPond writes it: `a`-`g`, Dutch accidentals `is` `isis` `es` `eses` as in
 * `cis` `des` `bes`, `es`/`as` alone for E and A flat, then absolute octave marks (`c` is MIDI 48,
 * `c'` 60, `c,` 36). The figure's parser reads its notes with it; it stands apart from that parser
 * so that an item naming a note reads it here and meets no figure (the parser's boundary).
 */

/** MIDI number of a `c` with no octave mark (`c'` is middle C, 60). */
const C_MIDI = 48;
const OCTAVE_SEMITONES = 12;
const NATURALS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** Dutch accidentals as the characters after the letter: `is` sharp, `es` flat, doubled for double. */
const ACCIDENTALS: Record<string, number> = { '': 0, is: 1, isis: 2, es: -1, eses: -2 };

/** Semitones of a Dutch note name (`c`, `cis`, `ees`, `es`, `as`...) from its natural, or null. */
function noteShift(letter: string, suffix: string): number | null {
	if ((letter === 'e' || letter === 'a') && (suffix === 's' || suffix === 'ses')) {
		return suffix === 's' ? -1 : -2; // `es`, `as`, `eses`, `ases`
	}
	return Object.hasOwn(ACCIDENTALS, suffix) ? ACCIDENTALS[suffix] : null;
}

export interface NoteName {
	midi: number;
	/** As a chart writes it, without its octave: `bes'` is `Bb`, `fis` is `F#`. */
	name: string;
}

/**
 * The note name at `start` in `text`, and where it ends; else what is wrong and where, for its
 * caller to tell.
 */
export function readNoteName(
	text: string,
	start: number
): (NoteName & { end: number }) | { problem: string; offset: number } {
	let at = start;
	const char = () => text[at] ?? '';
	const letter = char();
	at++;
	let suffix = '';
	while (char() === 'i' || char() === 'e' || char() === 's') suffix += text[at++];
	const shift = Object.hasOwn(NATURALS, letter) ? noteShift(letter, suffix) : null;
	if (shift === null) {
		return { problem: `unknown note name '${letter}${suffix}'`, offset: start };
	}
	let octave = 0;
	const mark = char();
	if (mark === "'" || mark === ',') {
		while (char() === mark) {
			octave += mark === "'" ? 1 : -1;
			at++;
		}
		if (char() === "'" || char() === ',') {
			return { problem: "octave marks must all go up (') or all go down (,)", offset: at };
		}
	}
	const midi = C_MIDI + NATURALS[letter] + shift + octave * OCTAVE_SEMITONES;
	if (midi < MIN_PITCH || midi > MAX_PITCH) {
		return { problem: `pitch ${midi} is out of the MIDI range`, offset: start };
	}
	const accidental = (shift > 0 ? '#' : 'b').repeat(Math.abs(shift));
	return { midi, name: `${letter.toUpperCase()}${accidental}`, end: at };
}

/** `text`, one note name and nothing else (no duration, no string). Throws naming the text. */
export function parseNoteName(text: string): NoteName {
	const read = readNoteName(text, 0);
	if ('problem' in read) {
		throw new Error(`"${text}" is no note name: ${read.problem} at offset ${read.offset}`);
	}
	if (read.end !== text.length) {
		throw new Error(`"${text}" is no note name: it goes on after the note, at offset ${read.end}`);
	}
	return { midi: read.midi, name: read.name };
}
