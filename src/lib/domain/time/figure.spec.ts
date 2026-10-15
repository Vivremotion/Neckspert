import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import {
	attackPositions,
	figureFromJson,
	figureToJson,
	validateFigure,
	type Figure,
	type FigureElement,
	type Voice
} from './figure';
import { METER_4_4 } from './meter';

const of = Fraction.of;
const note = (n: number, d: number, tieToNext?: boolean): FigureElement => ({
	kind: 'note',
	duration: of(n, d),
	...(tieToNext ? { tieToNext } : {}),
	content: null
});
const rest = (n: number, d: number): FigureElement => ({ kind: 'rest', duration: of(n, d) });
const figure = (elements: FigureElement[], extra: Partial<Voice> = {}, bars = 1): Figure => ({
	schema: 1,
	meter: METER_4_4,
	bars,
	voices: [{ id: 'main', elements, ...extra }]
});
const eighths = (count: number) => Array.from({ length: count }, () => note(1, 8));

describe('validateFigure', () => {
	it('accepts eight eighths in one 4/4 bar', () => {
		expect(validateFigure(figure(eighths(8)))).toBeNull();
	});

	it('names the bar that is short', () => {
		expect(validateFigure(figure(eighths(7)))).toContain('bar 1');
		expect(validateFigure(figure([note(1, 1), ...eighths(7)], {}, 2))).toContain('bar 2');
	});

	it('names the bar an element crosses', () => {
		expect(validateFigure(figure([note(1, 2), note(3, 4), note(3, 4)], {}, 2))).toContain('bar 1');
		expect(validateFigure(figure([note(1, 1), note(1, 2), note(1, 1)], {}, 2))).toContain('bar 2');
	});

	it('refuses more music than the declared bars', () => {
		expect(validateFigure(figure([note(1, 1), note(1, 4)]))).toContain('bars');
	});

	it('accepts a triplet written with its sounding durations', () => {
		const triplet = figure([note(1, 12), note(1, 12), note(1, 12), note(3, 4)], {
			tuplets: [{ from: 0, to: 2, ratio: [3, 2] }]
		});
		expect(validateFigure(triplet)).toBeNull();
	});

	it('refuses a tuplet outside the voice, overlapping another or with a bad ratio', () => {
		const base = [note(1, 12), note(1, 12), note(1, 12), note(3, 4)];
		expect(
			validateFigure(figure(base, { tuplets: [{ from: 0, to: 9, ratio: [3, 2] }] }))
		).toContain('tuplet');
		expect(
			validateFigure(
				figure(base, {
					tuplets: [
						{ from: 0, to: 2, ratio: [3, 2] },
						{ from: 2, to: 3, ratio: [3, 2] }
					]
				})
			)
		).toContain('tuplet');
		expect(
			validateFigure(figure(base, { tuplets: [{ from: 0, to: 2, ratio: [3, 0] }] }))
		).toContain('tuplet');
	});

	it('refuses a non-positive duration', () => {
		expect(validateFigure(figure([note(0, 1), note(1, 1)]))).toContain('duration');
	});

	it('refuses a tie that leads nowhere or to a rest', () => {
		expect(validateFigure(figure([note(3, 4), note(1, 4, true)]))).toContain('tie');
		expect(validateFigure(figure([note(3, 4, true), rest(1, 4)]))).toContain('tie');
		expect(validateFigure(figure([note(3, 4, true), note(1, 4)]))).toBeNull();
	});

	it('refuses a figure without voices, with repeated voice ids or a bad meter or bar count', () => {
		const one = figure([note(1, 1)]);
		expect(validateFigure({ ...one, voices: [] })).toContain('voice');
		expect(validateFigure({ ...one, voices: [one.voices[0], one.voices[0]] })).toContain('voice');
		expect(
			validateFigure({ ...one, meter: { count: 4, unit: of(1, 4), grouping: [1] } })
		).toContain('grouping');
		expect(validateFigure({ ...one, bars: 0 })).toContain('bars');
	});
});

describe('attackPositions', () => {
	it('lists the notes, not the rests', () => {
		const pattern = [
			note(1, 8),
			note(1, 8),
			rest(1, 8),
			note(1, 8),
			rest(1, 8),
			note(1, 8),
			rest(1, 8),
			note(1, 8)
		];
		expect(attackPositions(figure(pattern)).map(String)).toEqual(['0', '1/8', '3/8', '5/8', '7/8']);
	});

	it('gives no attack to a note tied from the previous one', () => {
		const tied = figure([note(1, 4, true), note(1, 4), note(1, 4, true), note(1, 4)]);
		expect(attackPositions(tied).map(String)).toEqual(['0', '1/2']);
	});

	it('reads the named voice, the first by default', () => {
		const two: Figure = {
			...figure([note(1, 1)]),
			voices: [
				{ id: 'a', elements: [note(1, 1)] },
				{ id: 'b', elements: [note(1, 2), note(1, 2)] }
			]
		};
		expect(attackPositions(two).map(String)).toEqual(['0']);
		expect(attackPositions(two, 'b').map(String)).toEqual(['0', '1/2']);
		expect(() => attackPositions(two, 'c')).toThrow('"c"');
	});
});

describe('figure JSON', () => {
	it('round-trips through JSON text', () => {
		const f = figure([note(1, 12), note(1, 12), note(1, 12, true), note(1, 4), rest(1, 2)], {
			tuplets: [{ from: 0, to: 2, ratio: [3, 2] }]
		});
		// The tied triplet note is followed by a note, so the figure is valid.
		expect(validateFigure(f)).toBeNull();
		const back = figureFromJson(JSON.parse(JSON.stringify(figureToJson(f))));
		expect(back).toEqual(f);
		expect(back.voices[0].elements[0].duration.equals(of(1, 12))).toBe(true);
	});

	it('writes durations as readable fractions', () => {
		expect(JSON.stringify(figureToJson(figure([note(1, 2), rest(1, 2)])))).toContain('"1/2"');
	});

	it('rejects another schema, naming it', () => {
		expect(() => figureFromJson({ schema: 2 })).toThrow('schema');
		expect(() => figureFromJson(null)).toThrow('figure');
	});

	it('rejects malformed content with a readable message', () => {
		const text = JSON.stringify(figureToJson(figure([note(1, 1)])));
		const badDuration = JSON.parse(text);
		badDuration.voices[0].elements[0].duration = 'quick';
		expect(() => figureFromJson(badDuration)).toThrow('duration');
		const badKind = JSON.parse(text);
		badKind.voices[0].elements[0].kind = 'chord';
		expect(() => figureFromJson(badKind)).toThrow('kind');
	});

	it('rejects a figure that does not validate', () => {
		const json = JSON.parse(JSON.stringify(figureToJson(figure(eighths(7)))));
		expect(() => figureFromJson(json)).toThrow('bar 1');
	});
});
