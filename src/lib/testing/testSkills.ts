import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { registerSkill, skillById } from '$lib/domain/skill/registry';
import type { SkillDefinition, SkillId } from '$lib/domain/skill/types';

/** A skill on the shapes of chords placed on the neck, which no catalog exercise practises. */
export const TEST_PLACED_VOICING_SKILL: SkillDefinition = {
	id: 'test-placed-voicing',
	name: { fr: 'Arpèges de triades', en: 'Triad arpeggios' },
	items: 'placed-voicing',
	memory: false
};

/** A skill on a shape moved from chord to chord, which no catalog exercise practises. */
export const TEST_PLACED_SHAPE_SKILL: SkillDefinition = {
	id: 'test-placed-shape',
	name: { fr: 'Une forme déplacée', en: 'A moved form' },
	items: 'placed-shape',
	memory: false
};

/** A skill with cards on the notes on a string, which no catalog exercise practises. */
export const TEST_NOTE_SKILL: SkillDefinition = {
	id: 'test-note-on-string',
	name: { fr: 'Une note sur une corde', en: 'A note on a string' },
	items: 'note-on-string',
	memory: true,
	directRecall: { withinMs: 1500 }
};

/** A second skill with cards on the same set, for what one skill's cards open to another. */
export const TEST_OTHER_NOTE_SKILL: SkillDefinition = {
	...TEST_NOTE_SKILL,
	id: 'test-other-note-on-string',
	name: { fr: 'Une autre note sur une corde', en: 'Another note on a string' }
};

/** Registers the test skills beside the catalog's; a skill already registered is kept. */
export function registerTestSkills(): void {
	registerSkill(TEST_PLACED_VOICING_SKILL, 'test');
	registerSkill(TEST_PLACED_SHAPE_SKILL, 'test');
	registerSkill(TEST_NOTE_SKILL, 'test');
	registerSkill(TEST_OTHER_NOTE_SKILL, 'test');
}

/** A skill on each set, for a spec that draws an exercise of a set. */
export const SKILL_OF_SET: Readonly<Record<string, SkillId>> = {
	'note-on-string': 'locate-note-string',
	'placed-note': 'identify-note',
	'voicing-on-strings': 'chord-anchor',
	change: 'grid-reading',
	figure: 'inner-pulse',
	'placed-voicing': TEST_PLACED_VOICING_SKILL.id,
	'placed-shape': TEST_PLACED_SHAPE_SKILL.id
};

/**
 * The exercise practising a skill like its own (same items, with memory) whose direct recall is
 * within `withinMs`: registered once under an id naming both, kept for the rest of the file.
 */
export function practisingWithin(
	definition: ExerciseDefinition,
	withinMs: number
): ExerciseDefinition {
	const skill: SkillDefinition = {
		...skillById(definition.practices),
		id: `${definition.practices}-within-${withinMs}`,
		memory: true,
		directRecall: { withinMs }
	};
	registerSkill(skill, 'test');
	return { ...definition, practices: skill.id };
}

/**
 * The id of a skill like `skill` (same items) that writes no direct recall, without memory:
 * registered once, kept for the rest of the file.
 */
export function withoutRecall(skill: SkillId): SkillId {
	const { directRecall: _none, ...rest } = skillById(skill);
	const twin: SkillDefinition = { ...rest, id: `${skill}-without-recall`, memory: false };
	registerSkill(twin, 'test');
	return twin.id;
}

/**
 * The exercise practising a skill like its own (same items) that writes no direct recall, without
 * memory (`withoutRecall`).
 */
export function practisingWithoutRecall(definition: ExerciseDefinition): ExerciseDefinition {
	return { ...definition, practices: withoutRecall(definition.practices) };
}
