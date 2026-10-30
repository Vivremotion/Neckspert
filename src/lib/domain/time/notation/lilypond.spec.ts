import { describe, expect, it } from 'vitest';
import { Fraction } from '../fraction';
import { attackNotes, attackPositions, validateFigure } from '../figure';
import { METER_4_4 } from '../meter';
import { RHYTHM_EXERCISES } from '$lib/domain/exercise/rhythmCatalog';
import { parseLilyPond, parseLilyPondNotes } from './lilypond';

const of = Fraction.of;
const attacks = (text: string) => attackPositions(parseLilyPond(text)).map(String);

const pitches = (text: string) => attackNotes(parseLilyPond(text)).map(({ note }) => note.pitch);
const strings = (text: string) => attackNotes(parseLilyPond(text)).map(({ note }) => note.string);

describe('parseLilyPond', () => {
	it('reads eighths and rests into one 4/4 bar', () => {
		const figure = parseLilyPond('c8 c8 r8 c8 r8 c8 r8 c8');
		expect(figure.bars).toBe(1);
		expect(figure.meter).toEqual(METER_4_4);
		expect(figure.voices.map((v) => v.id)).toEqual(['main']);
		expect(validateFigure(figure)).toBeNull();
		expect(attacks('c8 c8 r8 c8 r8 c8 r8 c8')).toEqual(['0', '1/8', '3/8', '5/8', '7/8']);
	});

	it('repeats the previous duration when one is omitted', () => {
		expect(attackPositions(parseLilyPond('c8 c c c c c c c'))).toHaveLength(8);
	});

	it('repeats a dotted duration, and a rest sets it too', () => {
		expect(attacks('c4. c r8 c8')).toEqual(['0', '3/8', '7/8']);
		expect(attacks('r4 c c c')).toEqual(['1/4', '1/2', '3/4']);
	});

	it('reads dotted durations', () => {
		const figure = parseLilyPond('c4. c8 c2');
		expect(validateFigure(figure)).toBeNull();
		expect(figure.voices[0].elements[0]).toEqual({
			kind: 'note',
			duration: of(3, 8),
			content: null,
			pitch: 48
		});
		expect(attacks('c4. c8 c2')).toEqual(['0', '3/8', '1/2']);
	});

	it('stores a triplet by its sounding durations and its range', () => {
		const figure = parseLilyPond('\\tuplet 3/2 { c8 c c } c4 c2');
		expect(attacks('\\tuplet 3/2 { c8 c c } c4 c2')).toEqual(['0', '1/12', '1/6', '1/4', '1/2']);
		expect(figure.voices[0].tuplets).toEqual([{ from: 0, to: 2, ratio: [3, 2] }]);
		expect(validateFigure(figure)).toBeNull();
	});

	it('reads a tuplet with a rest and no space around the braces', () => {
		const figure = parseLilyPond('c4 \\tuplet 3/2 {c8 r c} c4 c4');
		expect(figure.voices[0].tuplets).toEqual([{ from: 1, to: 3, ratio: [3, 2] }]);
		expect(attackPositions(figure).map(String)).toEqual(['0', '1/4', '5/12', '1/2', '3/4']);
	});

	it('ties a note to the next and drops the second attack', () => {
		const figure = parseLilyPond('c4~ c4 c2');
		expect(attackPositions(figure).map(String)).toEqual(['0', '1/2']);
		expect(attacks('c4 ~ c4 c2')).toEqual(['0', '1/2']);
	});

	it('accepts a bar check at a bar line and counts two bars', () => {
		const text = 'c8 c r c r c r c | r c r c r c r c';
		const figure = parseLilyPond(text);
		expect(figure.bars).toBe(2);
		expect(attackPositions(figure)).toHaveLength(9);
		expect(validateFigure(figure)).toBeNull();
	});

	it('accepts newlines and tabs as spaces, and a trailing bar check', () => {
		expect(parseLilyPond('c4 c4\n\tc4 c4 |\n').bars).toBe(1);
	});

	it('uses the meter given', () => {
		const meter = { count: 3, unit: of(1, 4), grouping: [1, 1, 1] };
		const figure = parseLilyPond('c4 c c | c c c', { meter });
		expect(figure.bars).toBe(2);
		expect(figure.meter).toEqual(meter);
	});

	describe('pitches and strings', () => {
		it('reads absolute pitches', () => {
			expect(pitches("c4 c' c, c''")).toEqual([48, 60, 36, 72]);
			expect(pitches("c4 d e f | g a b c'")).toEqual([48, 50, 52, 53, 55, 57, 59, 60]);
		});

		it('reads accidentals', () => {
			expect(pitches("cis'4 des' fis bes | eses' as r2")).toEqual([61, 61, 54, 58, 62, 56]);
			expect(pitches("es'4 aisis g,, ces' | bis r2.")).toEqual([63, 59, 31, 59, 60]);
		});

		it('gives every note a pitch, the rhythm figures written c included', () => {
			expect(pitches('c8 c c c c c c c')).toEqual(Array(8).fill(48));
			expect(pitches('c4 r c c')).toEqual([48, 48, 48]);
		});

		it('reads a string number after the duration', () => {
			const notes = attackNotes(parseLilyPond("e''8\\1 c'4\\3 g\\4 r4.")).map(({ note }) => note);
			expect(notes.map((n) => n.string)).toEqual([1, 3, 4]);
			expect(notes.map((n) => n.duration.toString())).toEqual(['1/8', '1/4', '1/4']);
			expect(notes.map((n) => n.pitch)).toEqual([76, 60, 55]);
		});

		it('reads a string number after dots and after an omitted duration', () => {
			expect(strings('c4.\\2 c8\\5 c2\\6')).toEqual([2, 5, 6]);
			expect(strings('c4\\2 c\\3 c c')).toEqual([2, 3, undefined, undefined]);
		});

		it('leaves the string out of a note that has none', () => {
			const note = attackNotes(parseLilyPond('c1'))[0].note;
			expect('string' in note).toBe(false);
		});

		it('keeps pitches and strings with ties and tuplets', () => {
			const text = '\\tuplet 3/2 { c8\\5 d e } f4~ f g4';
			expect(pitches(text)).toEqual([48, 50, 52, 53, 55]);
			expect(strings(text)).toEqual([5, undefined, undefined, undefined, undefined]);
		});

		it('refuses a string number that is not 1 to 6, or after a rest', () => {
			expect(() => parseLilyPond('c\\7 c2.')).toThrow(/string.* at offset 1/);
			expect(() => parseLilyPond('c4\\0 c2.')).toThrow(/string/);
			expect(() => parseLilyPond('c4\\12 c2.')).toThrow(/string/);
			expect(() => parseLilyPond('c4 r4\\1 c2')).toThrow(/rest.* at offset 5/);
		});

		it('still refuses what it refused', () => {
			expect(() => parseLilyPond('\\relative c4 c4 c4 c4')).toThrow(/relative/);
			expect(() => parseLilyPond('<c e g>1')).toThrow();
			expect(() => parseLilyPond('c4 #(display 1)')).toThrow(/#/);
			expect(() => parseLilyPond('c4 $x')).toThrow(/\$/);
			expect(() => parseLilyPond('c4\\fermata c2.')).toThrow(/fermata/);
		});
	});

	describe('rhythm figures', () => {
		// What each figure of the three rhythm exercises was before pitches: element kind (n/r),
		// duration, `~` for a tie, then the tuplets.
		const frozen = [
			['rhythm-silent-bars', 'eighths', 1, 'n1/8 n1/8 n1/8 n1/8 n1/8 n1/8 n1/8 n1/8'],
			[
				'rhythm-two-four',
				'line-1',
				4,
				'n1/4 n1/4 n1/4 n1/4 n1/4 n1/4 n1/2 n1/2 n1/4 n1/4 n1/4 n1/4 n1/4 n1/4'
			],
			[
				'rhythm-two-four',
				'line-2',
				4,
				'n1/4 n1/8 n1/8 n1/4 n1/4 n1/8 n1/8 n1/8 n1/8 n1/4 n1/4 n1/2 n1/4 n1/4 n1/4 n1/4 n1/2'
			],
			[
				'rhythm-two-four',
				'line-3',
				4,
				'n1/2 n1/2 n1/4 n1/4 n1/8 n1/8 n1/4 n1/8 n1/8 n1/4 n1/8 n1/8 n1/4 n1/4 n1/4 n1/4 n1/4'
			],
			[
				'rhythm-two-four',
				'line-4',
				4,
				'n1/8 n1/8 n1/8 n1/8 n1/8 n1/8 n1/8 n1/8 n1/4 n1/4 n1/2 n1/4 n1/8 n1/8 n1/4 n1/8 n1/8 n1/2 n1/2'
			],
			[
				'rhythm-two-four',
				'line-5',
				4,
				'n1/4 n1/4 n1/4 n1/4 n1/2 n1/4 n1/8 n1/8 n1/8 n1/8 n1/8 n1/8 n1/4 n1/4 n1/4 n1/2 n1/4'
			],
			[
				'rhythm-two-four',
				'line-6',
				4,
				'n1/4 r1/4 n1/4 n1/4 n1/8 n1/8 n1/8 n1/8 n1/2 n1/4 n1/4 n1/8 n1/8 n1/4 n1/2 n1/4 r1/4'
			],
			['rhythm-offbeats', 'offbeats-1', 1, 'n1/8 n1/8 r1/8 n1/8 r1/8 n1/8 r1/8 n1/8'],
			[
				'rhythm-offbeats',
				'offbeats-2',
				2,
				'n1/8 n1/8 r1/8 n1/8 r1/8 n1/8 r1/8 n1/8 r1/8 n1/8 r1/8 n1/8 r1/8 n1/8 r1/8 n1/8'
			]
		] as const;

		it('keeps the durations, ties and tuplets of the three rhythm exercises', () => {
			const found = RHYTHM_EXERCISES.flatMap((exercise) =>
				(exercise.figures ?? []).map(({ id, figure }) => {
					const voice = figure.voices[0];
					const elements = voice.elements
						.map((e) => `${e.kind[0]}${e.duration}${e.kind === 'note' && e.tieToNext ? '~' : ''}`)
						.join(' ');
					return [exercise.id, id, figure.bars, elements, voice.tuplets ?? []];
				})
			);
			expect(found).toEqual(frozen.map((row) => [...row, []]));
		});

		it('gives every note of them the pitch c', () => {
			const pitched = RHYTHM_EXERCISES.flatMap((e) => e.figures ?? []).flatMap(({ figure }) =>
				figure.voices[0].elements.flatMap((el) => (el.kind === 'note' ? [el.pitch] : []))
			);
			expect(pitched.length).toBeGreaterThan(0);
			expect(new Set(pitched)).toEqual(new Set([48]));
		});
	});

	describe('rejections', () => {
		it('rejects a misplaced bar check', () => {
			expect(() => parseLilyPond('c4 c4 | c4')).toThrow(/bar/i);
		});

		it('rejects an incomplete bar', () => {
			expect(() => parseLilyPond('c4 c4 c4')).toThrow(/bar 1/);
		});

		it('rejects embedded Scheme and names the position', () => {
			expect(() => parseLilyPond('c4 #(display 1)')).toThrow(/#/);
			expect(() => parseLilyPond('c4 #(display 1)')).toThrow(/3/);
			expect(() => parseLilyPond('c4 $x')).toThrow(/\$/);
		});

		it('rejects any command other than tuplet', () => {
			expect(() => parseLilyPond('\\relative c4 c4 c4 c4')).toThrow(/relative/);
			expect(() => parseLilyPond('\\tupletx 3/2 { c8 c c } c2 c4')).toThrow();
			expect(() => parseLilyPond('c4 \\ c4 c2')).toThrow();
		});

		it('rejects what is not a note name, an octave mark or a string number', () => {
			expect(() => parseLilyPond('h4 c4 c4 c4')).toThrow(/'h'/);
			expect(() => parseLilyPond('cs4 c4 c4 c4')).toThrow(/cs/);
			expect(() => parseLilyPond('ceis4 c4 c4 c4')).toThrow(/ceis/);
			expect(() => parseLilyPond("c',4 c4 c4 c4")).toThrow(/octave/);
			expect(() => parseLilyPond('c4 c4 c4 c4 % comment')).toThrow();
		});

		it('rejects unknown durations and stray dots', () => {
			expect(() => parseLilyPond('c3 c3 c3 c3')).toThrow(/duration/);
			expect(() => parseLilyPond('c64 c4')).toThrow(/duration/);
			expect(() => parseLilyPond('c4 . c4 c2')).toThrow();
			expect(() => parseLilyPond('c1.... ')).toThrow();
		});

		it('rejects broken tuplets', () => {
			expect(() => parseLilyPond('\\tuplet 3/2 { c8 c c c4 c2')).toThrow(/\}/);
			expect(() => parseLilyPond('\\tuplet 3/2 c8 c c } c4 c2')).toThrow(/\{/);
			expect(() => parseLilyPond('\\tuplet 3 { c8 c c } c4 c2')).toThrow();
			expect(() => parseLilyPond('\\tuplet 0/2 { c8 c c } c4 c2')).toThrow();
			expect(() => parseLilyPond('\\tuplet 3/2 { } c1')).toThrow();
			expect(() => parseLilyPond('\\tuplet 3/2 { c8 \\tuplet 3/2 { c c c } c } c2')).toThrow();
			expect(() => parseLilyPond('\\tuplet 3/2 { c8 c | c } c4 c2')).toThrow();
			expect(() => parseLilyPond('c4 c4 c4 c4 }')).toThrow(/\}/);
		});

		it('rejects a tie to nothing, to a rest, or on a rest', () => {
			expect(() => parseLilyPond('c4 c4 c4 c4~')).toThrow();
			expect(() => parseLilyPond('c4 c4 c4~ r4')).toThrow();
			expect(() => parseLilyPond('c4 c4 c4 r4~ c4')).toThrow();
			expect(() => parseLilyPond('~ c1')).toThrow();
		});

		it('prefixes errors from the exact arithmetic and names the offset', () => {
			const text = [997, 991, 983, 977, 971, 967, 953]
				.map((n) => `\\tuplet ${n}/1 { c32 }`)
				.join(' ');
			expect(() => parseLilyPond(text)).toThrow(/^lilypond: .*safe integer.* at offset \d+$/);
		});

		it('rejects an empty text and a note crossing a bar line', () => {
			expect(() => parseLilyPond('   ')).toThrow();
			expect(() => parseLilyPond('c2 c1 c2')).toThrow(/bar/);
		});
	});
});

describe('parseLilyPondNotes', () => {
	it('reads notes with their strings, two on one string allowed', () => {
		expect(parseLilyPondNotes('c\\5 e\\4 g\\4 b\\3')).toEqual([
			{ midi: 48, string: 5 },
			{ midi: 52, string: 4 },
			{ midi: 55, string: 4 },
			{ midi: 59, string: 3 }
		]);
	});

	it('reads the pitches as a figure does: absolute octaves, Dutch accidentals', () => {
		expect(parseLilyPondNotes("g,\\6 bes\\3 es'\\2 fis''\\1").map((n) => n.midi)).toEqual([
			43, 58, 63, 78
		]);
	});

	it('ignores durations, with no bar to fill', () => {
		expect(parseLilyPondNotes('c4\\5 e8.\\4')).toEqual(parseLilyPondNotes('c\\5 e\\4'));
		expect(parseLilyPondNotes('c1\\5 e1\\4 g1\\4 b16\\3')).toHaveLength(4);
	});

	it('refuses a rest, a tie, a tuplet, a note without string, each with its offset', () => {
		expect(() => parseLilyPondNotes('c\\5 r e\\4')).toThrow(/rest.* at offset 4/);
		expect(() => parseLilyPondNotes('c\\5~ c\\5')).toThrow(/tie.* at offset 3/);
		expect(() => parseLilyPondNotes('\\tuplet 3/2 { c\\5 e\\4 g\\4 }')).toThrow(
			/tuplet.* at offset 0/
		);
		expect(() => parseLilyPondNotes('c\\5 e g\\4')).toThrow(/string.* at offset 4/);
	});

	it('refuses what is no note: no text, a bar check, Scheme, an unknown name, a seventh string', () => {
		expect(() => parseLilyPondNotes('  ')).toThrow(/no note at offset 2/);
		expect(() => parseLilyPondNotes('c\\5 | e\\4')).toThrow(/unexpected '\|' at offset 4/);
		expect(() => parseLilyPondNotes('c\\5 #(foo)')).toThrow(/Scheme.* at offset 4/);
		expect(() => parseLilyPondNotes('cisi\\5')).toThrow(/unknown note name.* at offset 0/);
		expect(() => parseLilyPondNotes('c\\7')).toThrow(/string number.* at offset 1/);
	});
});
