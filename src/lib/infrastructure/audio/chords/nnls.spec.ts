import { describe, expect, it } from 'vitest';
import { noteComb } from './comb';
import { nnls } from './nnls';

const PROFILE = [1, 0.5, 0.33, 0.25];

function system(atoms: Float64Array[], target: Float64Array) {
	const dot = (a: Float64Array, b: Float64Array) => a.reduce((s, v, k) => s + v * b[k], 0);
	return {
		gram: atoms.map((a) => atoms.map((b) => dot(a, b))),
		projections: atoms.map((a) => dot(a, target))
	};
}

describe('nnls', () => {
	const atoms = [57, 62, 66].map((midi) => noteComb(midi, 4096, 48000, PROFILE));

	it('recovers known non-negative weights', () => {
		const target = atoms[0].map((v, k) => 2 * v + atoms[2][k]);
		const { gram, projections } = system(atoms, target);
		const weights = nnls(gram, projections);
		expect(weights[0]).toBeCloseTo(2, 6);
		expect(weights[1]).toBeCloseTo(0, 6);
		expect(weights[2]).toBeCloseTo(1, 6);
	});

	it('never returns a negative weight', () => {
		const target = atoms[0].map((v, k) => v - atoms[1][k]);
		const { gram, projections } = system(atoms, target);
		expect(nnls(gram, projections).every((w) => w >= 0)).toBe(true);
	});
});
