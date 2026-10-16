import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import { createTempoMap } from './tempoMap';

const of = Fraction.of;
const quarter = of(1, 4);

describe('tempo map', () => {
	it('puts a whole note at four quarters of half a second at 120', () => {
		const map = createTempoMap(10, [{ at: Fraction.ZERO, bpm: 120, unit: quarter }]);
		expect(map.toSeconds(of(1))).toBeCloseTo(12, 9);
		expect(map.toSeconds(Fraction.ZERO)).toBe(10);
	});

	it('counts the beat in the unit of the segment', () => {
		const map = createTempoMap(10, [{ at: Fraction.ZERO, bpm: 60, unit: of(3, 8) }]);
		expect(map.toSeconds(of(3, 8))).toBeCloseTo(11, 9);
	});

	it('continues from a new segment', () => {
		const map = createTempoMap(10, [{ at: Fraction.ZERO, bpm: 120, unit: quarter }]).withSegment({
			at: of(1),
			bpm: 60,
			unit: quarter
		});
		expect(map.segments).toHaveLength(2);
		expect(map.toSeconds(of(5, 4))).toBeCloseTo(10 + 2 + 1, 9);
	});

	it('leaves the original map unchanged when a segment is added', () => {
		const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 120, unit: quarter }]);
		map.withSegment({ at: of(1), bpm: 60, unit: quarter });
		expect(map.segments).toHaveLength(1);
	});

	it('reads a position back from seconds', () => {
		const map = createTempoMap(10, [{ at: Fraction.ZERO, bpm: 100, unit: quarter }]);
		expect(map.toPosition(map.toSeconds(of(7, 24))).equals(of(7, 24))).toBe(true);
	});

	it('reads positions back across segments', () => {
		const map = createTempoMap(1, [
			{ at: Fraction.ZERO, bpm: 90, unit: quarter },
			{ at: of(3, 4), bpm: 140, unit: of(1, 8) }
		]);
		for (const p of [of(1, 8), of(3, 4), of(7, 8), of(11, 6)]) {
			expect(map.toPosition(map.toSeconds(p)).equals(p)).toBe(true);
		}
	});

	it('rounds a position to 1/3840 of a whole note', () => {
		const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 120, unit: quarter }]);
		const step = 2 / 3840; // seconds in 1/3840 of a whole note
		expect(map.toPosition(2 + 0.1 * step).equals(of(1))).toBe(true);
		expect(map.toPosition(2 + 0.9 * step).equals(of(3841, 3840))).toBe(true);
		expect(map.toPosition(2 - 0.9 * step).equals(of(3839, 3840))).toBe(true);
	});

	it('refuses an empty, unsorted or unsupported map', () => {
		expect(() => createTempoMap(0, [])).toThrow('empty');
		expect(() =>
			createTempoMap(0, [
				{ at: of(1), bpm: 120, unit: quarter },
				{ at: Fraction.ZERO, bpm: 120, unit: quarter }
			])
		).toThrow('sorted');
		expect(() =>
			createTempoMap(0, [
				{ at: Fraction.ZERO, bpm: 120, unit: quarter },
				{ at: Fraction.ZERO, bpm: 100, unit: quarter }
			])
		).toThrow('sorted');
		expect(() =>
			createTempoMap(0, [{ at: Fraction.ZERO, bpm: 120, unit: quarter, ramp: 'linear' }])
		).toThrow('not supported yet');
		expect(() => createTempoMap(0, [{ at: Fraction.ZERO, bpm: 0, unit: quarter }])).toThrow('bpm');
	});

	it('refuses a segment that does not follow the last one', () => {
		const map = createTempoMap(0, [{ at: of(1), bpm: 120, unit: quarter }]);
		expect(() => map.withSegment({ at: of(1), bpm: 60, unit: quarter })).toThrow('sorted');
	});
});
