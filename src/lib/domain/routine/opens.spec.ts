import { describe, expect, it } from 'vitest';
import { opened, type Known } from './opens';
import type { Opening } from './types';

/** What the player knows: cards acquired by skill, levels held by exercise and scope. */
function known(acquired: Record<string, number> = {}, levels: Record<string, number> = {}): Known {
	return {
		acquired: (skill) => acquired[skill] ?? 0,
		level: (exercise, scope) => levels[`${exercise}/${scope ?? ''}`] ?? null
	};
}

const sixAnchors: Opening = { acquired: { skill: 'anchor', atLeast: 6 } };
const climbLevel3: Opening = { level: { exercise: 'climb', atLeast: 3 } };

describe('opened', () => {
	it('is open without an opening', () => {
		expect(opened(undefined, known())).toBe(true);
	});

	it('opens on cards acquired in a skill, from the number written', () => {
		expect(opened(sixAnchors, known({ anchor: 5 }))).toBe(false);
		expect(opened(sixAnchors, known({ anchor: 6 }))).toBe(true);
		expect(opened(sixAnchors, known({ other: 12 }))).toBe(false);
	});

	it('opens on a level reached, in its scope, and stays closed on no level held', () => {
		expect(opened(climbLevel3, known())).toBe(false);
		expect(opened(climbLevel3, known({}, { 'climb/': 2 }))).toBe(false);
		expect(opened(climbLevel3, known({}, { 'climb/': 3 }))).toBe(true);
		const scoped: Opening = { level: { exercise: 'climb', scope: 'blues', atLeast: 2 } };
		expect(opened(scoped, known({}, { 'climb/': 5 }))).toBe(false);
		expect(opened(scoped, known({}, { 'climb/blues': 2 }))).toBe(true);
	});

	it('reads all and any, nested', () => {
		const both: Opening = { all: [sixAnchors, climbLevel3] };
		expect(opened(both, known({ anchor: 6 }))).toBe(false);
		expect(opened(both, known({ anchor: 6 }, { 'climb/': 3 }))).toBe(true);
		const either: Opening = { any: [sixAnchors, climbLevel3] };
		expect(opened(either, known())).toBe(false);
		expect(opened(either, known({}, { 'climb/': 4 }))).toBe(true);
		const nested: Opening = {
			all: [{ any: [sixAnchors, { acquired: { skill: 'notes', atLeast: 1 } }] }, climbLevel3]
		};
		expect(opened(nested, known({ notes: 1 }, { 'climb/': 3 }))).toBe(true);
		expect(opened(nested, known({ notes: 1 }))).toBe(false);
		expect(opened(nested, known({}, { 'climb/': 3 }))).toBe(false);
	});
});
