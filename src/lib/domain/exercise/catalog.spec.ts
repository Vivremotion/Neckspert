import { describe, expect, it } from 'vitest';
import { EXERCISES, IDENTIFY_NECK, LOCATE_NECK, exerciseById } from './catalog';

describe('exercise catalog', () => {
	it('describes the two neck exercises', () => {
		expect(LOCATE_NECK).toEqual({ id: 'locate-neck', version: 1, mechanic: 'locate', params: {} });
		expect(IDENTIFY_NECK).toEqual({
			id: 'identify-neck',
			version: 1,
			mechanic: 'identify',
			params: {}
		});
	});

	it('finds an exercise by id and throws on an unknown one', () => {
		expect(exerciseById('identify-neck')).toBe(IDENTIFY_NECK);
		expect(() => exerciseById('nope')).toThrow(/nope/);
	});

	it('holds data only', () => {
		expect(JSON.parse(JSON.stringify(EXERCISES))).toEqual(EXERCISES);
	});
});
