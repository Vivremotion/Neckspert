import { describe, expect, it } from 'vitest';
import type { Refusal } from '$lib/domain/definitions';
import { importedProblemCount } from './problems';

const refusal = (file: string, id: string | null = null): Refusal => ({
	file,
	kind: 'exercise',
	id,
	reason: 'no'
});

describe('importedProblemCount', () => {
	it('is zero without a refusal', () => {
		expect(importedProblemCount([])).toBe(0);
	});

	it('counts a file once however many objects it refuses', () => {
		expect(importedProblemCount([refusal('a.json', 'x'), refusal('a.json', 'y')])).toBe(1);
	});

	it('counts each file with a refusal', () => {
		expect(importedProblemCount([refusal('a.json'), refusal('b.json'), refusal('a.json')])).toBe(2);
	});
});
