import { Fraction } from '../fraction';
import {
	MAX_PITCH,
	MAX_STRING,
	MIN_PITCH,
	MIN_STRING,
	validateFigure,
	type Figure,
	type FigureElement,
	type Tuplet
} from '../figure';
import { barLength, METER_4_4, type Meter } from '../meter';

/**
 * A strict, declarative reader for a subset of LilyPond, so that figures can be written the
 * way musicians write them. Only the exercise catalog and the notation adapter should import it
 * (`boundaries.spec.ts` keeps it so): everything else works on a `Figure`.
 *
 * Accepted: a note (`a`-`g`, Dutch accidentals `is` `isis` `es` `eses` as in `cis` `des` `bes`,
 * and `es`/`as` alone for E and A flat, then absolute octave marks: `c` is MIDI 48, `c'` 60,
 * `c,` 36) or `r` (a rest) followed by a duration (`1 2 4 8 16 32`, then dots) and, on a note,
 * a string number `\1` to `\6`; an omitted duration repeats the previous one (a quarter at
 * first, as in LilyPond); `~` (a tie);
 * `\tuplet a/b { ... }` (not nested); `|` (a bar check: the position must be on a bar line);
 * any blanks. Anything else throws, in particular `#` and `$` (LilyPond's embedded Scheme) and
 * every `\` command but `\tuplet`. Nothing is evaluated.
 */

const DURATIONS = new Set(['1', '2', '4', '8', '16', '32']);
const MAX_DOTS = 3;
const MAX_TUPLET_DIGITS = 3;
const DEFAULT_DURATION = '4';
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
	return ACCIDENTALS[suffix] ?? null;
}

const isBlank = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/** The sounding length of a written duration (`'4'`) with dots, as a fraction of a whole note. */
function writtenDuration(denominator: string, dots: number): Fraction {
	return Fraction.of(2 ** (dots + 1) - 1, Number(denominator) * 2 ** dots);
}

class Reader {
	private at = 0;
	private position = Fraction.ZERO;
	private readonly elements: FigureElement[] = [];
	private readonly tuplets: Tuplet[] = [];
	private lastDuration = { denominator: DEFAULT_DURATION, dots: 0 };
	/** True right after a note, the only place a tie may stand. */
	private afterNote = false;
	/** Set inside `\tuplet`: the multiplier that turns a written duration into a sounding one. */
	private scale: Fraction | null = null;

	constructor(
		private readonly text: string,
		private readonly meter: Meter
	) {}

	/** Where the reader stands, for errors that come from elsewhere than `fail`. */
	get offset(): number {
		return this.at;
	}

	private fail(message: string, offset = this.at): never {
		throw new Error(`lilypond: ${message} at offset ${offset}`);
	}

	private char(): string {
		return this.text[this.at] ?? '';
	}

	private skipBlanks(): void {
		while (this.at < this.text.length && isBlank(this.char())) this.at++;
	}

	private describe(c: string): string {
		return c === '' ? 'end of text' : `'${c}'`;
	}

	read(): Figure {
		this.sequence();
		if (this.char() === '}') this.fail("unexpected '}'");
		if (this.elements.length === 0) this.fail('no note or rest');
		const bar = barLength(this.meter);
		const bars = Math.max(1, Math.ceil(this.position.div(bar).toNumber()));
		const figure: Figure = {
			schema: 2,
			meter: this.meter,
			bars,
			voices: [
				{
					id: 'main',
					elements: this.elements,
					...(this.tuplets.length > 0 ? { tuplets: this.tuplets } : {})
				}
			]
		};
		const problem = validateFigure(figure);
		if (problem) throw new Error(`lilypond: ${problem}`);
		return figure;
	}

	/** Reads up to the end of the text, or up to the `}` that closes a tuplet (left unread). */
	private sequence(): void {
		for (;;) {
			this.skipBlanks();
			const c = this.char();
			if (c === '' || c === '}') return;
			if (c === 'r' || (c >= 'a' && c <= 'g')) this.event(c);
			else if (c === '~') this.tie();
			else if (c === '|') this.barCheck();
			else if (c === '\\') this.command();
			else if (c === '#' || c === '$') {
				this.fail(`'${c}' (embedded Scheme) is not allowed`);
			} else if (c === '{') this.fail("unexpected '{'");
			else this.fail(`unexpected ${this.describe(c)}`);
		}
	}

	/** A note name's MIDI pitch: letter, accidental, octave marks. Leaves the reader after them. */
	private pitch(): number {
		const start = this.at;
		const letter = this.char();
		this.at++;
		let suffix = '';
		while (this.char() === 'i' || this.char() === 'e' || this.char() === 's') {
			suffix += this.text[this.at++];
		}
		const shift = noteShift(letter, suffix);
		if (shift === null) this.fail(`unknown note name '${letter}${suffix}'`, start);
		let octave = 0;
		const mark = this.char();
		if (mark === "'" || mark === ',') {
			while (this.char() === mark) {
				octave += mark === "'" ? 1 : -1;
				this.at++;
			}
			if (this.char() === "'" || this.char() === ',') {
				this.fail("octave marks must all go up (') or all go down (,)");
			}
		}
		const pitch = C_MIDI + NATURALS[letter] + shift + octave * OCTAVE_SEMITONES;
		if (pitch < MIN_PITCH || pitch > MAX_PITCH) {
			this.fail(`pitch ${pitch} is out of the MIDI range`, start);
		}
		return pitch;
	}

	/** A string number after a note's duration: `\1` to `\6`. Null when there is none. */
	private stringNumber(isNote: boolean): number | null {
		if (this.char() !== '\\') return null;
		const start = this.at;
		if (!isDigit(this.text[this.at + 1] ?? '')) {
			let name = '';
			let i = this.at + 1;
			while (isLetter(this.text[i] ?? '')) name += this.text[i++];
			this.fail(`unsupported command '\\${name}'`, start);
		}
		if (!isNote) this.fail('a rest cannot take a string number', start);
		this.at++;
		let digits = '';
		while (isDigit(this.char())) digits += this.text[this.at++];
		const string = Number(digits);
		if (string < MIN_STRING || string > MAX_STRING) {
			this.fail(`string number must be ${MIN_STRING} to ${MAX_STRING}, got ${digits}`, start);
		}
		return string;
	}

	private event(letter: string): void {
		const isNote = letter !== 'r';
		let pitch = 0;
		if (isNote) pitch = this.pitch();
		else this.at++;
		const durationStart = this.at;
		let digits = '';
		let dots: number;
		while (isDigit(this.char())) digits += this.text[this.at++];
		if (digits === '') {
			if (this.char() === '.') this.fail('dots need a duration');
			digits = this.lastDuration.denominator;
			dots = this.lastDuration.dots;
		} else {
			if (!DURATIONS.has(digits)) {
				this.fail(`unsupported duration "${digits}" (use 1 2 4 8 16 32)`, durationStart);
			}
			dots = 0;
			while (this.char() === '.') {
				dots++;
				if (dots > MAX_DOTS) this.fail(`more than ${MAX_DOTS} dots`);
				this.at++;
			}
		}
		const string = this.stringNumber(isNote);
		const next = this.char();
		if (!(next === '' || isBlank(next) || next === '~' || next === '|' || next === '}')) {
			this.fail(`unexpected ${this.describe(next)}`);
		}
		this.lastDuration = { denominator: digits, dots };
		const written = writtenDuration(digits, dots);
		const duration = this.scale ? written.mul(this.scale) : written;
		this.elements.push(
			isNote
				? {
						kind: 'note',
						duration,
						content: null,
						pitch,
						...(string === null ? {} : { string })
					}
				: { kind: 'rest', duration }
		);
		this.position = this.position.add(duration);
		this.afterNote = isNote;
	}

	private tie(): void {
		if (!this.afterNote) this.fail("a tie '~' must follow a note");
		const last = this.elements[this.elements.length - 1];
		if (last.kind === 'note') last.tieToNext = true;
		this.at++;
		this.afterNote = false;
	}

	private barCheck(): void {
		if (this.scale) this.fail("a bar check '|' is not allowed inside a tuplet");
		const bar = barLength(this.meter);
		if (this.position.div(bar).d !== 1) {
			this.fail(`bar check falls at ${this.position}, not on a bar line (${bar} per bar)`);
		}
		this.at++;
		this.afterNote = false;
	}

	private command(): void {
		const start = this.at;
		this.at++;
		let name = '';
		while (isLetter(this.char())) name += this.text[this.at++];
		if (name !== 'tuplet') this.fail(`unsupported command '\\${name}'`, start);
		if (this.scale) this.fail('tuplets cannot be nested', start);
		this.skipBlanks();
		const played = this.integer('tuplet ratio');
		if (this.char() !== '/')
			this.fail(`expected '/' in the tuplet ratio, got ${this.describe(this.char())}`);
		this.at++;
		const inTimeOf = this.integer('tuplet ratio');
		this.skipBlanks();
		if (this.char() !== '{') {
			this.fail(`expected '{' after the tuplet ratio, got ${this.describe(this.char())}`);
		}
		this.at++;
		const from = this.elements.length;
		this.scale = Fraction.of(inTimeOf, played);
		this.afterNote = false;
		this.sequence();
		if (this.char() !== '}') this.fail("missing '}' to close the tuplet");
		if (this.elements.length === from) this.fail('empty tuplet', start);
		this.at++;
		this.scale = null;
		this.afterNote = false;
		this.tuplets.push({ from, to: this.elements.length - 1, ratio: [played, inTimeOf] });
	}

	private integer(what: string): number {
		const start = this.at;
		let digits = '';
		while (isDigit(this.char())) digits += this.text[this.at++];
		if (digits === '' || digits.length > MAX_TUPLET_DIGITS || Number(digits) < 1) {
			this.fail(`${what} must be two positive integers such as 3/2`, start);
		}
		return Number(digits);
	}
}

/**
 * Parses `text` into a one-voice (`'main'`) figure in `options.meter` (4/4 by default); `bars` is
 * worked out from the text. Every note gets its MIDI pitch, a rhythm written `c` included (48). Throws an `Error` whose message names the offending offset (0-based).
 */
export function parseLilyPond(text: string, options: { meter?: Meter } = {}): Figure {
	const reader = new Reader(text, options.meter ?? METER_4_4);
	try {
		return reader.read();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.startsWith('lilypond:')) throw error;
		// Exact-arithmetic failures (a ratio that overflows the fractions, say) come from below.
		throw new Error(`lilypond: ${message} at offset ${reader.offset}`, { cause: error });
	}
}
