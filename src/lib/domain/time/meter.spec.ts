import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import { METER_4_4, barLength, beatPositions, beatsOf, isBeatCount, validateMeter } from './meter';

const of = Fraction.of;

describe('meter', () => {
	it('measures a 4/4 bar as a whole note', () => {
		expect(barLength(METER_4_4).equals(of(1))).toBe(true);
	});

	it('counts beats in the meter’s unit, any exact fraction of a beat, refusing the others', () => {
		expect(beatsOf(METER_4_4, 1.5).toString()).toBe('3/8');
		expect(beatsOf(METER_4_4, -8).toString()).toBe('-2');
		expect(isBeatCount(1.5)).toBe(true);
		expect(isBeatCount(1.0001)).toBe(false);
		expect(isBeatCount('2')).toBe(false);
		expect(() => beatsOf(METER_4_4, 1.0001)).toThrow(RangeError);
	});

	it('places the beats of a 4/4 bar on the quarter notes', () => {
		expect(beatPositions(METER_4_4).map(String)).toEqual(['0', '1/4', '1/2', '3/4']);
	});

	it('groups the units of a compound meter into beats', () => {
		const sixEight = { count: 6, unit: of(1, 8), grouping: [3, 3] };
		expect(barLength(sixEight).equals(of(3, 4))).toBe(true);
		expect(beatPositions(sixEight).map(String)).toEqual(['0', '3/8']);
	});

	it('accepts a well-formed meter and names what is wrong otherwise', () => {
		expect(validateMeter(METER_4_4)).toBeNull();
		expect(validateMeter({ count: 0, unit: of(1, 4), grouping: [] })).toContain('count');
		expect(validateMeter({ count: 4, unit: Fraction.ZERO, grouping: [4] })).toContain('unit');
		expect(validateMeter({ count: 4, unit: of(1, 4), grouping: [1, 1, 1] })).toContain('grouping');
		expect(validateMeter({ count: 4, unit: of(1, 4), grouping: [2, 0, 2] })).toContain('grouping');
	});

	it('refuses the beats of a meter whose grouping does not fill the bar', () => {
		expect(() => beatPositions({ count: 4, unit: of(1, 4), grouping: [1, 1] })).toThrow('grouping');
	});
});
