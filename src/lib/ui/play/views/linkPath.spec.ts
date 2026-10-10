import { describe, expect, it } from 'vitest';
import type { LinkPathModel } from '$lib/application/mechanics/chordGrid';
import { linkPathLayout } from './linkPath';

/** D on G-B-E: 2-3-2, 7-7-5, 11-10-10, 14-15-14, up then down, one bar each from beat 4. */
const SHAPES: LinkPathModel['shapes'] = [
	['2-3-2', 2, 'fondamentale sur si'],
	['7-7-5', 5, 'fondamentale sur sol'],
	['11-10-10', 10, 'fondamentale sur mi'],
	['14-15-14', 14, 'fondamentale sur si']
].map(([frets, position, inversion], i) => ({
	number: i + 1,
	notes: (frets as string).split('-').map((fret, s) => ({
		string: ([3, 2, 1] as const)[s],
		fret: Number(fret)
	})),
	position: position as number,
	inversion: inversion as string
}));

function model(index: number, aided = true): LinkPathModel {
	return {
		kind: 'link-path',
		chord: 'D',
		set: 'sol‑si‑mi',
		strings: [
			{ string: 3, name: 'sol' },
			{ string: 2, name: 'si' },
			{ string: 1, name: 'mi' }
		],
		shapes: SHAPES,
		path: [0, 1, 2, 3, 2, 1, 0],
		changes: [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'D' })),
		index,
		beatsPerBar: 4,
		aided
	};
}

const at = (
	index: number,
	nowBeat: number,
	history: { beatIndex: number; verdict: 'perfect' | 'late' | 'wrong' }[] = [],
	aided = true
) => linkPathLayout(model(index, aided), { targetBeatIndex: 4 + index * 4, nowBeat, history });

describe('linkPathLayout', () => {
	it('spans the neck from a fret below the lowest to a fret above the highest, high string on top', () => {
		const layout = at(0, 4.2);
		expect(layout.frets).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
		expect(layout.strings.map((s) => s.name)).toEqual(['mi', 'si', 'sol']);
	});

	it('says what to play now and what comes next, by number', () => {
		expect(at(1, 8.5)).toMatchObject({ current: 2, next: 3, descending: false, label: 'now' });
		expect(at(3, 16.5)).toMatchObject({ current: 4, next: 3, descending: true });
		expect(at(5, 24.5)).toMatchObject({ current: 2, next: 1, descending: true });
		expect(at(6, 28.5)).toMatchObject({ current: 1, next: null });
	});

	it('before the first change, shows the first shape as the one to begin with', () => {
		const layout = linkPathLayout(model(0), { targetBeatIndex: null, nowBeat: 1, history: [] });
		expect(layout).toMatchObject({ current: 1, next: 2, label: 'first', filledBeats: 0 });
	});

	it('fills a square per beat of the current bar', () => {
		expect([7.9, 8, 8.5, 9.1, 10, 11.99].map((now) => at(1, now).filledBeats)).toEqual([
			0, 1, 1, 2, 3, 4
		]);
	});

	it('draws the dots of every shape when aided: the current filled, the next outlined', () => {
		const dots = at(1, 8.5).dots;
		expect(dots.filter((d) => d.state === 'current')).toEqual([
			{ string: 3, fret: 7, number: 2, state: 'current' },
			{ string: 2, fret: 7, number: 2, state: 'current' },
			{ string: 1, fret: 5, number: 2, state: 'current' }
		]);
		expect(dots.filter((d) => d.state === 'next').map((d) => d.fret)).toEqual([11, 10, 10]);
		expect(dots.filter((d) => d.state === 'other')).toHaveLength(6);
	});

	it('draws no dot when not aided, only the numbered blocks', () => {
		const layout = at(1, 8.5, [], false);
		expect(layout.dots).toEqual([]);
		expect(layout.blocks.map((b) => [b.number, b.from, b.to, b.state])).toEqual([
			[1, 2, 3, 'other'],
			[2, 5, 7, 'current'],
			[3, 10, 11, 'next'],
			[4, 14, 15, 'other']
		]);
	});

	it('points the arrows up the neck, then back down', () => {
		expect(at(1, 8.5).arrows.map((a) => a.direction)).toEqual(['up', 'up', 'up']);
		expect(at(4, 20.5).arrows.map((a) => a.direction)).toEqual(['down', 'down', 'down']);
		expect(at(1, 8.5).arrows[0].fret).toBe(4);
	});

	it('marks each shape with the verdict of its latest change', () => {
		const layout = at(5, 24.5, [
			{ beatIndex: 4, verdict: 'perfect' },
			{ beatIndex: 8, verdict: 'late' },
			{ beatIndex: 12, verdict: 'perfect' },
			{ beatIndex: 16, verdict: 'perfect' },
			{ beatIndex: 20, verdict: 'wrong' }
		]);
		expect(layout.blocks.map((b) => b.verdict)).toEqual(['perfect', 'late', 'wrong', 'perfect']);
	});
});
