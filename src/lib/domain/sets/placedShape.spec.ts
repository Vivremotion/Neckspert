import { describe, expect, it } from 'vitest';
import { placedShapeSet, shapeNamed, type FormFigureItem } from './placedShape';

describe('placedShapeSet', () => {
	it('keys an item by its shape and its first note', () => {
		expect(placedShapeSet.itemKey({ shape: 'maj7', first: 'bes' })).toBe('maj7@bes');
	});

	it('keeps the length of a turn out of the key', () => {
		expect(placedShapeSet.itemKey({ shape: 'maj7', first: 'bes', beats: 2 })).toBe('maj7@bes');
		expect(placedShapeSet.cardItem?.({ shape: 'maj7', first: 'bes', beats: 2 })).toEqual({
			shape: 'maj7',
			first: 'bes'
		});
	});

	it('parses a key back', () => {
		const items: FormFigureItem[] = [
			{ shape: 'maj7', first: 'd' },
			{ shape: 'maj7', first: 'g,' },
			{ shape: 'maj7', first: "bes'" },
			{ shape: 'm7-on-6', first: 'fis' }
		];
		for (const item of items) {
			expect(placedShapeSet.parseItem(placedShapeSet.itemKey(item))).toEqual(item);
		}
	});

	it('throws on a corrupted key, a length included', () => {
		for (const key of [
			'',
			'maj7',
			'maj7@',
			'@d',
			'maj7@h',
			'maj7@d4',
			'maj7@d\\5',
			'maj7@r',
			'maj7@d e',
			"maj7@d',",
			'maj7@d@4',
			'maj7@d@x'
		]) {
			expect(() => placedShapeSet.parseItem(key), key).toThrow();
		}
	});
});

describe('shapeNamed', () => {
	const shape = { id: 'maj7', symbol: 'maj7', notes: [{ midi: 48, string: 5, name: 'C' }] };

	it('finds a shape by its id', () => {
		expect(shapeNamed([shape], 'maj7')).toBe(shape);
	});

	it('throws naming the shape and the shapes written', () => {
		expect(() => shapeNamed([shape], 'm7')).toThrow(
			'names shape "m7", which the exercise does not write (maj7)'
		);
		expect(() => shapeNamed(undefined, 'm7')).toThrow(
			'names shape "m7", which the exercise does not write (none)'
		);
	});
});
