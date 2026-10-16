import { describe, expect, it } from 'vitest';
import { Fraction } from '../fraction';
import { attackPositions, validateFigure } from '../figure';
import { METER_4_4 } from '../meter';
import { parseLilyPondRhythm } from './lilypond';

const of = Fraction.of;
const attacks = (text: string) => attackPositions(parseLilyPondRhythm(text)).map(String);

describe('parseLilyPondRhythm', () => {
	it('reads eighths and rests into one 4/4 bar', () => {
		const figure = parseLilyPondRhythm('c8 c8 r8 c8 r8 c8 r8 c8');
		expect(figure.bars).toBe(1);
		expect(figure.meter).toEqual(METER_4_4);
		expect(figure.voices.map((v) => v.id)).toEqual(['main']);
		expect(validateFigure(figure)).toBeNull();
		expect(attacks('c8 c8 r8 c8 r8 c8 r8 c8')).toEqual(['0', '1/8', '3/8', '5/8', '7/8']);
	});

	it('repeats the previous duration when one is omitted', () => {
		expect(attackPositions(parseLilyPondRhythm('c8 c c c c c c c'))).toHaveLength(8);
	});

	it('repeats a dotted duration, and a rest sets it too', () => {
		expect(attacks('c4. c r8 c8')).toEqual(['0', '3/8', '7/8']);
		expect(attacks('r4 c c c')).toEqual(['1/4', '1/2', '3/4']);
	});

	it('reads dotted durations', () => {
		const figure = parseLilyPondRhythm('c4. c8 c2');
		expect(validateFigure(figure)).toBeNull();
		expect(figure.voices[0].elements[0]).toEqual({
			kind: 'note',
			duration: of(3, 8),
			content: null
		});
		expect(attacks('c4. c8 c2')).toEqual(['0', '3/8', '1/2']);
	});

	it('stores a triplet by its sounding durations and its range', () => {
		const figure = parseLilyPondRhythm('\\tuplet 3/2 { c8 c c } c4 c2');
		expect(attacks('\\tuplet 3/2 { c8 c c } c4 c2')).toEqual(['0', '1/12', '1/6', '1/4', '1/2']);
		expect(figure.voices[0].tuplets).toEqual([{ from: 0, to: 2, ratio: [3, 2] }]);
		expect(validateFigure(figure)).toBeNull();
	});

	it('reads a tuplet with a rest and no space around the braces', () => {
		const figure = parseLilyPondRhythm('c4 \\tuplet 3/2 {c8 r c} c4 c4');
		expect(figure.voices[0].tuplets).toEqual([{ from: 1, to: 3, ratio: [3, 2] }]);
		expect(attackPositions(figure).map(String)).toEqual(['0', '1/4', '5/12', '1/2', '3/4']);
	});

	it('ties a note to the next and drops the second attack', () => {
		const figure = parseLilyPondRhythm('c4~ c4 c2');
		expect(attackPositions(figure).map(String)).toEqual(['0', '1/2']);
		expect(attacks('c4 ~ c4 c2')).toEqual(['0', '1/2']);
	});

	it('accepts a bar check at a bar line and counts two bars', () => {
		const text = 'c8 c r c r c r c | r c r c r c r c';
		const figure = parseLilyPondRhythm(text);
		expect(figure.bars).toBe(2);
		expect(attackPositions(figure)).toHaveLength(9);
		expect(validateFigure(figure)).toBeNull();
	});

	it('accepts newlines and tabs as spaces, and a trailing bar check', () => {
		expect(parseLilyPondRhythm('c4 c4\n\tc4 c4 |\n').bars).toBe(1);
	});

	it('uses the meter given', () => {
		const meter = { count: 3, unit: of(1, 4), grouping: [1, 1, 1] };
		const figure = parseLilyPondRhythm('c4 c c | c c c', { meter });
		expect(figure.bars).toBe(2);
		expect(figure.meter).toEqual(meter);
	});

	describe('rejections', () => {
		it('rejects a misplaced bar check', () => {
			expect(() => parseLilyPondRhythm('c4 c4 | c4')).toThrow(/bar/i);
		});

		it('rejects an incomplete bar', () => {
			expect(() => parseLilyPondRhythm('c4 c4 c4')).toThrow(/bar 1/);
		});

		it('rejects embedded Scheme and names the position', () => {
			expect(() => parseLilyPondRhythm('c4 #(display 1)')).toThrow(/#/);
			expect(() => parseLilyPondRhythm('c4 #(display 1)')).toThrow(/3/);
			expect(() => parseLilyPondRhythm('c4 $x')).toThrow(/\$/);
		});

		it('rejects any command other than tuplet', () => {
			expect(() => parseLilyPondRhythm('\\relative c4 c4 c4 c4')).toThrow(/relative/);
			expect(() => parseLilyPondRhythm('\\tupletx 3/2 { c8 c c } c2 c4')).toThrow();
			expect(() => parseLilyPondRhythm('c4 \\ c4 c2')).toThrow();
		});

		it('rejects pitches and other characters', () => {
			expect(() => parseLilyPondRhythm('d4 c4 c4 c4')).toThrow(/'d'/);
			expect(() => parseLilyPondRhythm('cis4 c4 c4 c4')).toThrow();
			expect(() => parseLilyPondRhythm("c'4 c4 c4 c4")).toThrow();
			expect(() => parseLilyPondRhythm('c4 c4 c4 c4 % comment')).toThrow();
		});

		it('rejects unknown durations and stray dots', () => {
			expect(() => parseLilyPondRhythm('c3 c3 c3 c3')).toThrow(/duration/);
			expect(() => parseLilyPondRhythm('c64 c4')).toThrow(/duration/);
			expect(() => parseLilyPondRhythm('c4 . c4 c2')).toThrow();
			expect(() => parseLilyPondRhythm('c1.... ')).toThrow();
		});

		it('rejects broken tuplets', () => {
			expect(() => parseLilyPondRhythm('\\tuplet 3/2 { c8 c c c4 c2')).toThrow(/\}/);
			expect(() => parseLilyPondRhythm('\\tuplet 3/2 c8 c c } c4 c2')).toThrow(/\{/);
			expect(() => parseLilyPondRhythm('\\tuplet 3 { c8 c c } c4 c2')).toThrow();
			expect(() => parseLilyPondRhythm('\\tuplet 0/2 { c8 c c } c4 c2')).toThrow();
			expect(() => parseLilyPondRhythm('\\tuplet 3/2 { } c1')).toThrow();
			expect(() =>
				parseLilyPondRhythm('\\tuplet 3/2 { c8 \\tuplet 3/2 { c c c } c } c2')
			).toThrow();
			expect(() => parseLilyPondRhythm('\\tuplet 3/2 { c8 c | c } c4 c2')).toThrow();
			expect(() => parseLilyPondRhythm('c4 c4 c4 c4 }')).toThrow(/\}/);
		});

		it('rejects a tie to nothing, to a rest, or on a rest', () => {
			expect(() => parseLilyPondRhythm('c4 c4 c4 c4~')).toThrow();
			expect(() => parseLilyPondRhythm('c4 c4 c4~ r4')).toThrow();
			expect(() => parseLilyPondRhythm('c4 c4 c4 r4~ c4')).toThrow();
			expect(() => parseLilyPondRhythm('~ c1')).toThrow();
		});

		it('prefixes errors from the exact arithmetic and names the offset', () => {
			const text = [997, 991, 983, 977, 971, 967, 953]
				.map((n) => `\\tuplet ${n}/1 { c32 }`)
				.join(' ');
			expect(() => parseLilyPondRhythm(text)).toThrow(/^lilypond: .*safe integer.* at offset \d+$/);
		});

		it('rejects an empty text and a note crossing a bar line', () => {
			expect(() => parseLilyPondRhythm('   ')).toThrow();
			expect(() => parseLilyPondRhythm('c2 c1 c2')).toThrow(/bar/);
		});
	});
});
