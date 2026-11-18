import { afterEach, describe, expect, it } from 'vitest';
import { mechanicOfSkill } from './bridge';
import { registerSkill, allSkills, clearSkills } from './registry';
import type { SkillDefinition } from './types';

describe('mechanicOfSkill', () => {
	it.each([
		['locate-note-string', 'locate'],
		['identify-note', 'identify'],
		['chord-anchor', 'triad-anchor'],
		['chord-zone', 'triad-zone'],
		['inversion-run', 'chord-grid'],
		['grid-in-direction', 'chord-grid'],
		['grid-in-zone', 'chord-grid'],
		['grid-reading', 'chord-grid'],
		['inner-pulse', 'figure'],
		['displaced-pulse', 'figure'],
		['figure-independence', 'figure']
	])('plays %s with the mechanic %s', (skill, mechanic) => {
		expect(mechanicOfSkill(skill)).toBe(mechanic);
	});

	describe('another skill', () => {
		const loaded = [...allSkills()];
		const add = (items: string): void => {
			const skill: SkillDefinition = {
				id: 'invented',
				name: { fr: 'x', en: 'x' },
				items,
				memory: false
			};
			registerSkill(skill, 'test.json');
		};
		afterEach(() => {
			clearSkills();
			for (const skill of loaded) registerSkill(skill, 'catalog');
		});

		it('is played by the mechanic of its set', () => {
			add('placed-shape');
			expect(mechanicOfSkill('invented')).toBe('form-figure');
		});

		it('of a set shared by two mechanics takes the first', () => {
			add('voicing-on-strings');
			expect(mechanicOfSkill('invented')).toBe('triad-anchor');
		});

		it('unknown to the registry names the mechanic of its own id', () => {
			expect(mechanicOfSkill('fake')).toBe('fake');
		});
	});
});
