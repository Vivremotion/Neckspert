import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RHYTHM_OFFBEATS } from '$lib/domain/exercise/rhythmCatalog';
import {
	attackPositions,
	Fraction,
	METER_4_4,
	type Figure,
	type FigureElement,
	type Voice
} from '$lib/domain/time';
import { renderFigure } from './renderFigure';

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

// jsdom has no canvas, and VexFlow measures its text (the tuplet numbers, the time signature's
// fallback) on one: a fixed-size stand-in keeps the engraver quiet and its layout deterministic.
beforeAll(() => {
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
		() =>
			({
				font: '',
				measureText: () => ({
					width: 8,
					actualBoundingBoxLeft: 0,
					actualBoundingBoxRight: 8,
					actualBoundingBoxAscent: 8,
					actualBoundingBoxDescent: 0
				})
			}) as unknown as CanvasRenderingContext2D
	);
});
afterAll(() => {
	vi.restoreAllMocks();
});

let host: HTMLElement;
beforeEach(() => {
	document.body.innerHTML = '';
	host = document.createElement('div');
	document.body.append(host);
});

const increasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe('renderFigure', () => {
	it('engraves the offbeats figure: five notes left to right, one bar', () => {
		const offbeats = RHYTHM_OFFBEATS.figures?.[0].figure;
		if (!offbeats) throw new Error('the offbeats exercise has no figure');
		const layout = renderFigure(host, offbeats, { maxWidth: 600 });
		expect(layout.noteX).toHaveLength(5);
		expect(increasing(layout.noteX)).toBe(true);
		expect(layout.barX).toHaveLength(1);
		expect(host.querySelector('svg')).not.toBeNull();
		expect(layout.width).toBeGreaterThan(0);
		expect(layout.width).toBeLessThanOrEqual(600);
		expect(layout.height).toBeGreaterThan(0);
	});

	it('wraps four bars onto several lines at a narrow width', () => {
		const wide = renderFigure(host, figure(eighths(32), {}, 4), { maxWidth: 2000 });
		const narrow = renderFigure(host, figure(eighths(32), {}, 4), { maxWidth: 360 });
		expect(narrow.barX).toHaveLength(4);
		expect(narrow.noteX).toHaveLength(32);
		expect(Math.max(...narrow.noteX)).toBeLessThanOrEqual(360);
		expect(narrow.width).toBeLessThanOrEqual(360);
		expect(narrow.height).toBeGreaterThan(wide.height);
		// A bar that opens a new line starts back at the left edge.
		expect(narrow.barX.some((x, i) => i > 0 && x <= narrow.barX[0])).toBe(true);
	});

	it('keeps one bar a single line when it fits', () => {
		const narrow = renderFigure(host, figure(eighths(8)), { maxWidth: 360 });
		const wide = renderFigure(host, figure(eighths(8)), { maxWidth: 800 });
		expect(narrow.height).toBe(wide.height);
	});

	it('gives a note per attack: a tie is one note, a rest none', () => {
		const tied = figure([note(1, 4, true), note(1, 4), rest(1, 4), note(1, 4)]);
		const layout = renderFigure(host, tied, { maxWidth: 600 });
		expect(layout.noteX).toHaveLength(attackPositions(tied).length);
		expect(layout.noteX).toHaveLength(2);
		expect(increasing(layout.noteX)).toBe(true);
	});

	it('ties a note over a bar line', () => {
		const across = figure([note(1, 2), note(1, 2, true), note(1, 2), note(1, 2)], {}, 2);
		const layout = renderFigure(host, across, { maxWidth: 600 });
		expect(layout.noteX).toHaveLength(attackPositions(across).length);
		expect(layout.noteX).toHaveLength(3);
		expect(host.querySelector('.vf-stavetie')).not.toBeNull();
	});

	it('ties a note over a line break', () => {
		const across = figure([...eighths(7), note(1, 8, true), note(1, 2), note(1, 2)], {}, 2);
		const layout = renderFigure(host, across, { maxWidth: 200 });
		expect(layout.noteX).toHaveLength(attackPositions(across).length);
		expect(host.querySelectorAll('.vf-stavetie').length).toBeGreaterThanOrEqual(1);
	});

	it('engraves a triplet and gives it a bracket number', () => {
		const triplet = figure([note(1, 12), note(1, 12), note(1, 12), note(3, 4)], {
			tuplets: [{ from: 0, to: 2, ratio: [3, 2] }]
		});
		const layout = renderFigure(host, triplet, { maxWidth: 600 });
		expect(layout.noteX).toHaveLength(4);
		expect(increasing(layout.noteX)).toBe(true);
		expect(host.querySelector('.vf-tuplet')).not.toBeNull();
	});

	it('beams eighths by beat', () => {
		renderFigure(host, figure(eighths(8)), { maxWidth: 600 });
		expect(host.querySelectorAll('.vf-beam')).toHaveLength(4);
	});

	it('writes durations that are not a single note value as tied notes', () => {
		// 5/16 is not a note value (a quarter plus a sixteenth): one attack, two heads.
		const odd = figure([note(5, 16), note(3, 16), note(1, 2)]);
		const layout = renderFigure(host, odd, { maxWidth: 600 });
		expect(layout.noteX).toHaveLength(attackPositions(odd).length);
		expect(layout.noteX).toHaveLength(3);
	});

	it('draws one row of bars per voice and reports the first voice', () => {
		const two: Figure = {
			schema: 1,
			meter: METER_4_4,
			bars: 1,
			voices: [
				{ id: 'a', elements: eighths(8) },
				{ id: 'b', elements: [note(1, 2), note(1, 2)] }
			]
		};
		const one = renderFigure(host, figure(eighths(8)), { maxWidth: 600 });
		const both = renderFigure(host, two, { maxWidth: 600 });
		expect(both.height).toBeGreaterThan(one.height);
		expect(both.noteX).toHaveLength(8);
		expect(both.barX).toHaveLength(1);
	});

	it('scales the drawing and its reported positions together', () => {
		const base = renderFigure(host, figure(eighths(8)), { maxWidth: 600 });
		const big = renderFigure(host, figure(eighths(8)), { maxWidth: 600, scale: 1.5 });
		expect(big.width).toBeLessThanOrEqual(600);
		expect(big.height).toBeGreaterThan(base.height);
		expect(Math.max(...big.noteX)).toBeLessThanOrEqual(600);
	});

	it('replaces what the host held and sizes its svg to the layout', () => {
		renderFigure(host, figure(eighths(8)), { maxWidth: 600 });
		const layout = renderFigure(host, figure(eighths(8)), { maxWidth: 600 });
		expect(host.querySelectorAll('svg')).toHaveLength(1);
		expect(host.querySelector('svg')?.getAttribute('width')).toBe(String(layout.width));
		expect(host.querySelector('svg')?.getAttribute('height')).toBe(String(layout.height));
	});

	it('refuses an invalid figure', () => {
		expect(() => renderFigure(host, figure(eighths(7)), { maxWidth: 600 })).toThrow(/bar 1/);
	});
});
