import { describe, expect, it } from 'vitest';
import { idProblem, RESERVED_IDS } from './ids';

const SHAPE =
	'id must be made of letters, digits, "-", "_" or ".", and start with a letter or a digit';

describe('idProblem', () => {
	it.each(['', 3, undefined])('refuses %j as no id', (id) => {
		expect(idProblem(id)).toBe('id must be a string, not empty');
	});

	it.each(['a:b', 'a#b', 'a b', '-a', 'é', '_a', '.a'])('refuses %j for its shape', (id) => {
		expect(idProblem(id)).toBe(SHAPE);
	});

	it.each(['a', 'inversion-run', 'iohefy-a', 'a_b.c', '7th', 'A1'])('accepts %j', (id) => {
		expect(idProblem(id)).toBeNull();
	});

	it('refuses a reserved id only when told which', () => {
		expect(idProblem('unknown', { reserved: RESERVED_IDS })).toBe('id "unknown" is reserved');
		expect(idProblem('unknown')).toBeNull();
	});
});
