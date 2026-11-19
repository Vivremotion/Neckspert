import { describe, expect, it } from 'vitest';
import { skillFromJson } from './fromJson';

const SKILL = {
	id: 'locate-note-string',
	name: { fr: 'Trouver une note sur une corde', en: 'Find a note on a string' },
	items: 'note-on-string',
	memory: true,
	directRecall: { withinMs: 1500 }
};

const refused = (json: unknown) => () => skillFromJson(json);

describe('skillFromJson', () => {
	it('reads a memory skill', () => {
		expect(skillFromJson(SKILL)).toEqual(SKILL);
	});

	it('reads a skill without memory', () => {
		const { directRecall: _unused, ...rest } = SKILL;
		expect(skillFromJson({ ...rest, memory: false })).toEqual({ ...rest, memory: false });
	});

	it('reads a directRecall on a skill without memory as written', () => {
		expect(skillFromJson({ ...SKILL, memory: false })).toEqual({ ...SKILL, memory: false });
	});

	it.each([[[]], [null]])('refuses %j', (json) => {
		expect(refused(json)).toThrow('a skill must be a JSON object');
	});

	it('refuses an unknown key', () => {
		expect(refused({ ...SKILL, level: 1 })).toThrow('unknown key "level"');
	});

	it('refuses an empty id', () => {
		expect(refused({ ...SKILL, id: '' })).toThrow('id must be a string, not empty');
	});

	it('refuses a name that is not { fr, en }', () => {
		expect(refused({ ...SKILL, name: 'x' })).toThrow('name must be { fr, en }');
		expect(refused({ ...SKILL, name: { fr: 'x' } })).toThrow('name must be { fr, en }');
	});

	it('refuses an unknown set', () => {
		expect(refused({ ...SKILL, items: 'cards' })).toThrow(
			'items must name a registered set, got "cards"'
		);
	});

	it('refuses a memory that is not a boolean', () => {
		expect(refused({ ...SKILL, memory: 'yes' })).toThrow('memory must be true or false');
	});

	it('requires directRecall of a memory skill', () => {
		const { directRecall: _unused, ...rest } = SKILL;
		expect(refused(rest)).toThrow('directRecall is required for a memory skill');
	});

	it('refuses a directRecall.withinMs that is not positive', () => {
		expect(refused({ ...SKILL, directRecall: { withinMs: 0 } })).toThrow(
			'directRecall.withinMs must be a positive number'
		);
	});

	it('refuses an unknown key of directRecall', () => {
		expect(refused({ ...SKILL, directRecall: { withinMs: 1, x: 1 } })).toThrow(
			'directRecall: unknown key "x"'
		);
	});

	it.each(['', 3])('refuses the id %j', (id) => {
		expect(refused({ ...SKILL, id })).toThrow('id must be a string, not empty');
	});

	it.each(['a:b', 'a#b', 'a b', '-a', 'é'])('refuses the id %j for its shape', (id) => {
		expect(refused({ ...SKILL, id })).toThrow(
			'id must be made of letters, digits, "-", "_" or ".", and start with a letter or a digit'
		);
	});

	it('refuses the reserved id', () => {
		expect(refused({ ...SKILL, id: 'unknown' })).toThrow('id "unknown" is reserved');
	});
});
