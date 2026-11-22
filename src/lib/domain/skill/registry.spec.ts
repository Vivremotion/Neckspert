import { describe, expect, it } from 'vitest';
import { allSkills, clearSkills, hasCards, hasSkill, registerSkill, skillById } from './registry';
import type { SkillDefinition } from './types';

const SKILL: SkillDefinition = {
	id: 'inner-pulse',
	name: { fr: 'x', en: 'x' },
	items: 'figure',
	memory: false
};

describe('the skill registry', () => {
	it('holds the catalog the test setup loads', () => {
		expect(allSkills()).toHaveLength(11);
		expect(hasSkill('locate-note-string')).toBe(true);
	});

	it('gives cards to the items of a registered memory skill only', () => {
		expect(hasCards('locate-note-string')).toBe(true);
		expect(hasCards('chord-zone')).toBe(true);
		expect(hasCards('inner-pulse')).toBe(false);
		expect(hasCards('grid-reading')).toBe(false);
		expect(hasCards('unregistered')).toBe(false);
	});

	it('registers a skill once', () => {
		clearSkills();
		expect(registerSkill(SKILL, 'a.json')).toBeNull();
		expect(registerSkill({ ...SKILL }, 'b.json')).toBe('a.json');
		expect(allSkills()).toEqual([SKILL]);
		expect(hasSkill('inner-pulse')).toBe(true);
		expect(hasSkill('x')).toBe(false);
	});

	it('says that nothing is loaded when the registry is empty', () => {
		clearSkills();
		expect(() => skillById('x')).toThrow('Unknown skill: x (no definition is loaded)');
	});

	it('names an unknown skill', () => {
		clearSkills();
		registerSkill(SKILL, 'a.json');
		expect(skillById('inner-pulse')).toBe(SKILL);
		expect(() => skillById('x')).toThrow('Unknown skill: x');
		expect(() => skillById('x')).not.toThrow('no definition');
	});
});
