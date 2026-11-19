import { describe, expect, it } from 'vitest';
import { clearRoutines, findRoutine, registerRoutine, routines } from './registry';
import type { RoutineDefinition } from './types';

const routine = (id: string): RoutineDefinition => ({
	id,
	title: { fr: id, en: id },
	exercises: ['identify-note']
});

describe('the routine registry', () => {
	it('holds the catalog the test setup loads, in the order registered', () => {
		expect(routines().map((r) => r.id)).toEqual(['notes', 'chords', 'chords-zone', 'changes']);
	});

	it('registers a routine once, giving the holder of a taken id', () => {
		clearRoutines();
		const first = routine('a');
		expect(registerRoutine(first, 'a.json')).toBeNull();
		expect(registerRoutine(routine('b'), 'a.json')).toBeNull();
		expect(registerRoutine({ ...routine('a'), title: { fr: 'x', en: 'x' } }, 'b.json')).toBe(
			'a.json'
		);
		expect(findRoutine('a')).toBe(first);
		expect(findRoutine('nowhere')).toBeUndefined();
		expect(routines().map((r) => r.id)).toEqual(['a', 'b']);
		clearRoutines();
		expect(routines()).toEqual([]);
	});
});
