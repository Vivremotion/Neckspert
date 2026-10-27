import { describe, expect, it } from 'vitest';
import type { StringNumber } from '$lib/domain/music';
import { occurrenceOfId } from '$lib/domain/triads';
import { shapeId } from '$lib/testing/shapes';
import {
	admits,
	admittedShapes,
	chordGridRules,
	climbDirection,
	shapePosition,
	type ChordGridItem
} from './chordGrid';
import { cardKeyOf, mechanicRules } from './index';

const G_B_E: StringNumber[] = [3, 2, 1];
const D_G_B: StringNumber[] = [4, 3, 2];

function item(overrides: Partial<ChordGridItem>): ChordGridItem {
	return {
		rule: 'jam',
		element: 'jam:test',
		passageId: 's:0',
		index: 0,
		changes: [{ at: 0, length: 4, symbol: 'D' }],
		symbol: 'D',
		chord: 'D|maj',
		sets: [G_B_E, D_G_B],
		previous: null,
		...overrides
	};
}

const judge = (it: ChordGridItem, decided: string | null) => chordGridRules.judge(it, { decided });

describe('chordGridRules', () => {
	it('is a skill, registered among the mechanics', () => {
		expect(chordGridRules).toMatchObject({ id: 'chord-grid', learner: 'skill' });
		expect(mechanicRules('chord-grid')).toBe(chordGridRules);
	});

	it('keys an attempt by its element and its place in the passage, and parses it back', () => {
		const link = item({ rule: 'link', element: 'link:D|maj:3,2,1', index: 2 });
		expect(chordGridRules.itemKey(link)).toBe('link:D|maj:3,2,1#2');
		expect(cardKeyOf(chordGridRules, link)).toBe('chord-grid:link:D|maj:3,2,1#2');
		expect(chordGridRules.parseItem('link:D|maj:3,2,1#2')).toEqual({
			element: 'link:D|maj:3,2,1',
			index: 2
		});
		expect(chordGridRules.cardItem?.(link)).toEqual({ element: 'link:D|maj:3,2,1', index: 2 });
		expect(chordGridRules.parseItem('link:C#|maj:3,2,1#0').element).toBe('link:C#|maj:3,2,1');
		expect(() => chordGridRules.parseItem('link:D|maj:3,2,1')).toThrow();
		expect(() => chordGridRules.parseItem('#2')).toThrow();
		expect(() => chordGridRules.parseItem('x#-1')).toThrow();
	});

	describe('link', () => {
		const link = item({
			rule: 'link',
			sets: [G_B_E],
			shape: shapeId('D', 'maj', G_B_E, '7-7-5')
		});

		it('is right on the shape asked only', () => {
			expect(judge(link, shapeId('D', 'maj', G_B_E, '7-7-5'))).toEqual({
				correct: true,
				answer: { decided: shapeId('D', 'maj', G_B_E, '7-7-5') },
				confusion: null
			});
			expect(judge(link, shapeId('D', 'maj', G_B_E, '2-3-2')).confusion).toEqual({
				kind: 'other-shape',
				part: 'chord'
			});
		});

		it('names another quality, another chord, another string set, or nothing', () => {
			expect(judge(link, shapeId('D', 'min', G_B_E, '7-6-5')).confusion?.kind).toBe(
				'other-quality'
			);
			expect(judge(link, shapeId('G', 'maj', G_B_E, '7-8-7')).confusion?.kind).toBe('other-chord');
			expect(judge(link, shapeId('D', 'maj', D_G_B, '7-7-7')).confusion?.kind).toBe('other-set');
			expect(judge(link, null)).toEqual({
				correct: false,
				answer: { decided: null },
				confusion: { kind: 'none', part: 'chord' }
			});
		});
	});

	describe('climb', () => {
		const climb = (direction: 'up' | 'down', previous: string | null) =>
			item({ rule: 'climb', sets: [G_B_E], direction, previous });
		const after775 = shapeId('D', 'maj', G_B_E, '7-7-5');

		it('going up, takes a shape strictly higher than the one heard before', () => {
			expect(judge(climb('up', after775), shapeId('D', 'maj', G_B_E, '7-7-5')).confusion).toEqual({
				kind: 'not-higher',
				part: 'chord'
			});
			expect(judge(climb('up', after775), shapeId('D', 'maj', G_B_E, '11-10-10')).correct).toBe(
				true
			);
		});

		it('takes any shape on the set as the first one', () => {
			expect(judge(climb('up', null), shapeId('D', 'maj', G_B_E, '2-3-2')).correct).toBe(true);
			expect(judge(climb('up', null), shapeId('D', 'maj', D_G_B, '7-7-7')).confusion?.kind).toBe(
				'other-set'
			);
		});

		it('judges by the direction the item carries: no shape beyond the one before is refused', () => {
			// After Em 16-17-15 (position 15), Ebm has no shape above it on G-B-E.
			const top = item({
				rule: 'climb',
				sets: [G_B_E],
				direction: 'up',
				chord: 'Eb|min',
				previous: shapeId('E', 'min', G_B_E, '16-17-15')
			});
			expect(judge(top, shapeId('D#', 'min', G_B_E, '3-4-2')).confusion?.kind).toBe('not-higher');
			expect(admittedShapes(top)).toEqual([]);
		});

		it('turns the climb where the neck runs out, and only there', () => {
			const at = (direction: 'up' | 'down', chord: string, previous: string | null) =>
				climbDirection({ chord, sets: [G_B_E], direction, previous });
			const em15 = shapeId('E', 'min', G_B_E, '16-17-15');
			expect(at('up', 'Eb|min', em15)).toBe('down');
			expect(at('up', 'Ab|maj', em15)).toBe('up');
			expect(at('down', 'Eb|min', shapeId('D', 'min', G_B_E, '2-3-1'))).toBe('up');
			expect(at('down', 'Eb|min', null)).toBe('down');
		});

		it('going down, takes a shape strictly lower', () => {
			expect(
				judge(climb('down', after775), shapeId('D', 'maj', G_B_E, '11-10-10')).confusion
			).toEqual({ kind: 'not-lower', part: 'chord' });
			expect(judge(climb('down', after775), shapeId('D', 'maj', G_B_E, '2-3-2')).correct).toBe(
				true
			);
		});
	});

	describe('zone', () => {
		const zone = item({ rule: 'zone', zone: { from: 5, to: 8 } });

		it('takes a shape whose frets all lie in the zone, on either set', () => {
			expect(judge(zone, shapeId('D', 'maj', D_G_B, '7-7-7')).correct).toBe(true);
			expect(judge(zone, shapeId('D', 'maj', G_B_E, '7-7-5')).correct).toBe(true);
			expect(judge(zone, shapeId('D', 'maj', G_B_E, '11-10-10')).confusion).toEqual({
				kind: 'out-of-zone',
				part: 'chord'
			});
		});

		it('counts an open string inside the zone at fret 1, outside any other', () => {
			const low = item({ rule: 'zone', chord: 'E|min', zone: { from: 1, to: 4 } });
			expect(judge(low, shapeId('E', 'min', G_B_E, '0-0-0')).correct).toBe(true);
			const c = item({ rule: 'zone', chord: 'C|maj', zone: { from: 1, to: 4 } });
			expect(judge(c, shapeId('C', 'maj', D_G_B, '2-0-1')).correct).toBe(true);
			const higher = item({ rule: 'zone', chord: 'A|maj', zone: { from: 2, to: 5 } });
			expect(judge(higher, shapeId('A', 'maj', G_B_E, '2-2-0')).confusion?.kind).toBe(
				'out-of-zone'
			);
		});
	});

	describe('jam', () => {
		it('takes the right chord on either set, anywhere', () => {
			const jam = item({ rule: 'jam' });
			for (const id of [
				shapeId('D', 'maj', G_B_E, '2-3-2'),
				shapeId('D', 'maj', G_B_E, '14-15-14'),
				shapeId('D', 'maj', D_G_B, '7-7-7')
			]) {
				expect(judge(jam, id).correct).toBe(true);
			}
			expect(judge(jam, shapeId('D', 'min', G_B_E, '7-6-5')).correct).toBe(false);
		});

		it('takes a chord spelled flat as the same pitch', () => {
			const jam = item({ rule: 'jam', chord: 'Eb|min' });
			expect(judge(jam, shapeId('D#', 'min', G_B_E, '8-7-6')).correct).toBe(true);
		});
	});

	it('lists the shapes a rule admits, lowest first', () => {
		const shapes = admittedShapes(
			item({
				rule: 'climb',
				sets: [G_B_E],
				direction: 'up',
				previous: shapeId('D', 'maj', G_B_E, '7-7-5')
			})
		);
		expect(shapes.map((o) => o.notes.map((n) => n.fret).join('-'))).toEqual([
			'11-10-10',
			'14-15-14'
		]);
		const link = item({ rule: 'link', sets: [G_B_E], shape: shapeId('D', 'maj', G_B_E, '2-3-2') });
		expect(admittedShapes(link)).toHaveLength(1);
		expect(admits(link, occurrenceOfId(shapeId('D', 'maj', G_B_E, '2-3-2'))!)).toBe(true);
	});

	it('places a shape at its lowest fretted fret, an open shape at 0', () => {
		expect(shapePosition(occurrenceOfId(shapeId('D', 'maj', G_B_E, '7-7-5'))!)).toBe(5);
		expect(shapePosition(occurrenceOfId(shapeId('E', 'min', G_B_E, '0-0-0'))!)).toBe(0);
	});
});
