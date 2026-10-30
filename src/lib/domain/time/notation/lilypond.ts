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
import { readNoteName } from '../noteName';

/**
 * A strict, declarative reader for a subset of LilyPond, so that figures can be written the
 * way musicians write them. Only the exercise catalog and the notation adapter should import it
 * (`boundaries.spec.ts` keeps it so): everything else works on a `Figure`.
 *
 * Accepted: a note (its name as `noteName.ts` reads it: `a`-`g`, Dutch accidentals as in `cis`
 * `des` `bes`, then absolute octave marks: `c` is MIDI 48, `c'` 60, `c,` 36) or `r` (a rest)
 * followed by a duration (`1 2 4 8 16 32`, then dots) and, on a note, a string number `\1` to
 * `\6`; an omitted duration repeats the previous one (a quarter at first, as in LilyPond); `~` (a
 * tie); `\tuplet a/b { ... }` (not nested); `|` (a bar check: the position must be on a bar line);
 * any blanks. Anything else throws, in particular `#` and `$` (LilyPond's embedded Scheme) and
 * every `\` command but `\tuplet`. Nothing is evaluated.
 */

const DURATIONS = new Set(['1', '2', '4', '8', '16', '32']);
const MAX_DOTS = 3;
const MAX_TUPLET_DIGITS = 3;
const DEFAULT_DURATION = '4';
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

	/** The notes of the whole text, each with its string; no rhythm, so nothing a rhythm needs. */
	readNotes(): { midi: number; string: number }[] {
		const notes: { midi: number; string: number }[] = [];
		for (;;) {
			this.skipBlanks();
			const c = this.char();
			if (c === '') break;
			if (c === 'r') this.fail('a form has no rest');
			if (c === '~') this.fail('a form has no tie');
			if (c === '\\' && this.text.startsWith('\\tuplet', this.at)) {
				this.fail('a form has no tuplet');
			}
			if (!(c >= 'a' && c <= 'g')) this.refuse(c);
			const start = this.at;
			const midi = this.pitch();
			this.duration();
			const string = this.stringNumber(true);
			if (string === null) this.fail('a note of a form needs its string number', start);
			this.afterEvent();
			notes.push({ midi, string });
		}
		if (notes.length === 0) this.fail('no note');
		return notes;
	}

	/** What stands where a note or a command should: `#` and `$` are told apart, as Scheme. */
	private refuse(c: string): never {
		if (c === '#' || c === '$') this.fail(`'${c}' (embedded Scheme) is not allowed`);
		return this.fail(`unexpected ${this.describe(c)}`);
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
			else this.refuse(c);
		}
	}

	/** A note name's MIDI pitch: letter, accidental, octave marks. Leaves the reader after them. */
	private pitch(): number {
		const read = readNoteName(this.text, this.at);
		if ('problem' in read) this.fail(read.problem, read.offset);
		this.at = read.end;
		return read.midi;
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

	/** A written duration with its dots; an omitted one repeats the last. */
	private duration(): { denominator: string; dots: number } {
		const start = this.at;
		let digits = '';
		while (isDigit(this.char())) digits += this.text[this.at++];
		if (digits === '') {
			if (this.char() === '.') this.fail('dots need a duration');
			return this.lastDuration;
		}
		if (!DURATIONS.has(digits)) {
			this.fail(`unsupported duration "${digits}" (use 1 2 4 8 16 32)`, start);
		}
		let dots = 0;
		while (this.char() === '.') {
			dots++;
			if (dots > MAX_DOTS) this.fail(`more than ${MAX_DOTS} dots`);
			this.at++;
		}
		return { denominator: digits, dots };
	}

	/** Nothing may be glued to a note or a rest but a tie, a bar check or a closing brace. */
	private afterEvent(): void {
		const next = this.char();
		if (!(next === '' || isBlank(next) || next === '~' || next === '|' || next === '}')) {
			this.fail(`unexpected ${this.describe(next)}`);
		}
	}

	private event(letter: string): void {
		const isNote = letter !== 'r';
		let pitch = 0;
		if (isNote) pitch = this.pitch();
		else this.at++;
		const { denominator, dots } = this.duration();
		const string = this.stringNumber(isNote);
		this.afterEvent();
		this.lastDuration = { denominator, dots };
		const written = writtenDuration(denominator, dots);
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

/**
 * The notes of `text` for a form, each with its string: the notes and string numbers of
 * `parseLilyPond`, and no rhythm to fill, so durations are read and ignored. A rest, a tie, a
 * tuplet, a note without string number, or anything else throws an `Error` naming the offset.
 */
export function parseLilyPondNotes(text: string): { midi: number; string: number }[] {
	return new Reader(text, METER_4_4).readNotes();
}
