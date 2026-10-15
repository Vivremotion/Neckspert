import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';

const of = Fraction.of;

describe('Fraction', () => {
	it('normalises to lowest terms with a positive denominator', () => {
		expect(of(6, 8).toString()).toBe('3/4');
		expect(of(1, -4).toString()).toBe('-1/4');
		expect(of(-2, -4).toString()).toBe('1/2');
		expect(of(0, 5).toString()).toBe('0');
		expect(Object.is(of(0, -5).n, 0)).toBe(true);
	});

	it('defaults the denominator to 1 and prints integers bare', () => {
		expect(of(2).toString()).toBe('2');
		expect(Fraction.ZERO.toString()).toBe('0');
	});

	it('rejects a zero or non-integer part', () => {
		expect(() => of(1, 0)).toThrow(RangeError);
		expect(() => of(1.5, 2)).toThrow(RangeError);
		expect(() => of(1, 2.5)).toThrow(RangeError);
		expect(() => of(Number.NaN)).toThrow(RangeError);
		expect(() => of(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
	});

	it('adds, subtracts, multiplies and divides exactly', () => {
		expect(of(1, 8).add(of(1, 12)).toString()).toBe('5/24');
		expect(of(1, 2).sub(of(3, 4)).toString()).toBe('-1/4');
		expect(of(2, 3).mul(of(3, 4)).toString()).toBe('1/2');
		const ratio = of(1, 4).div(of(1, 12));
		expect(ratio.equals(of(3))).toBe(true);
		expect(ratio.toString()).toBe('3');
		expect(() => of(1, 2).div(Fraction.ZERO)).toThrow(RangeError);
	});

	it('raises RangeError when a result leaves the safe integers', () => {
		const big = of(Number.MAX_SAFE_INTEGER);
		expect(() => big.add(big)).toThrow(RangeError);
		expect(() => big.mul(big)).toThrow(RangeError);
		expect(() => of(1, Number.MAX_SAFE_INTEGER).mul(of(1, 2))).toThrow(RangeError);
	});

	it('compares and sorts', () => {
		expect(of(1, 4).compare(of(3, 8))).toBe(-1);
		expect(of(1, 2).compare(of(2, 4))).toBe(0);
		expect(of(3, 4).compare(of(1, 2))).toBe(1);
		const sorted = [of(3, 8), of(1, 4), of(1, 2)].sort((a, b) => a.compare(b));
		expect(sorted.map(String)).toEqual(['1/4', '3/8', '1/2']);
	});

	it('compares exactly even when cross products exceed the safe range', () => {
		const a = of(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER);
		const b = of(Number.MAX_SAFE_INTEGER - 2, Number.MAX_SAFE_INTEGER - 1);
		expect(a.compare(b)).toBe(1);
		expect(b.compare(a)).toBe(-1);
	});

	it('converts to a number', () => {
		expect(of(3, 8).toNumber()).toBe(0.375);
	});

	it('parses text and round-trips', () => {
		expect(Fraction.parse('3/8').equals(of(3, 8))).toBe(true);
		expect(Fraction.parse('2').equals(of(2))).toBe(true);
		expect(Fraction.parse('-1/4').toString()).toBe('-1/4');
		expect(Fraction.parse(of(5, 24).toString()).equals(of(5, 24))).toBe(true);
	});

	it('rejects malformed text', () => {
		expect(() => Fraction.parse('3/x')).toThrow();
		expect(() => Fraction.parse('')).toThrow();
		expect(() => Fraction.parse('1/0')).toThrow();
		expect(() => Fraction.parse('1.5')).toThrow();
		expect(() => Fraction.parse(' 1/2')).toThrow();
	});

	it('serialises as its text', () => {
		expect(JSON.stringify({ at: of(1, 3) })).toBe('{"at":"1/3"}');
		expect(of(1, 3).toJSON()).toBe('1/3');
	});
});
