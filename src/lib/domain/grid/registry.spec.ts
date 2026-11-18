import { describe, expect, it } from 'vitest';
import { allGrids, clearGrids, gridById, registerGrid } from './registry';
import { BLUES_F, IOHEFY_A } from '$lib/testing/catalog';

describe('the grid registry', () => {
	it('is seeded with the catalog', () => {
		expect(allGrids().map((grid) => grid.id)).toEqual(['iohefy-a', 'blues-f']);
	});

	it('registers a grid once', () => {
		clearGrids();
		expect(registerGrid(BLUES_F, 'a.json')).toBeNull();
		expect(registerGrid({ ...BLUES_F }, 'b.json')).toBe('a.json');
		expect(allGrids()).toEqual([BLUES_F]);
	});

	it('says that nothing is loaded when the registry is empty', () => {
		clearGrids();
		expect(() => gridById('x')).toThrow('Unknown grid: x (no definition is loaded)');
	});

	it('names an unknown grid', () => {
		clearGrids();
		registerGrid(IOHEFY_A, 'a.json');
		expect(gridById('iohefy-a')).toBe(IOHEFY_A);
		expect(() => gridById('x')).toThrow('Unknown grid: x');
		expect(() => gridById('x')).not.toThrow('no definition');
	});
});
