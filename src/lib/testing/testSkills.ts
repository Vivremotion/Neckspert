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

/** Registers the test skills beside the catalog's; a skill already registered is kept. */
export function registerTestSkills(): void {
	registerSkill(TEST_PLACED_VOICING_SKILL, 'test');
	registerSkill(TEST_PLACED_SHAPE_SKILL, 'test');
}

registerTestSkills();

/** A skill each mechanic plays, for a spec that draws an exercise of a mechanic. */
export const SKILL_OF_MECHANIC: Readonly<Record<string, SkillId>> = {
	locate: 'locate-note-string',
	identify: 'identify-note',
	'triad-anchor': 'chord-anchor',
	'triad-zone': 'chord-zone',
	'chord-grid': 'grid-reading',
	figure: 'inner-pulse',
	'voicing-figure': TEST_PLACED_VOICING_SKILL.id,
	'form-figure': TEST_PLACED_SHAPE_SKILL.id
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
 * The exercise practising a skill like its own (same items) that writes no direct recall, without
 * memory: registered once, kept for the rest of the file.
 */
export function practisingWithoutRecall(definition: ExerciseDefinition): ExerciseDefinition {
	const { directRecall: _none, ...rest } = skillById(definition.practices);
	const skill: SkillDefinition = {
		...rest,
		id: `${definition.practices}-without-recall`,
		memory: false
	};
	registerSkill(skill, 'test');
	return { ...definition, practices: skill.id };
}
