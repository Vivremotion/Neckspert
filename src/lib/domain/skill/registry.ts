import type { SkillDefinition, SkillId } from './types';

/** The live skills, with the origin (file) that defined each; empty until files are read. */
const registered = new Map<SkillId, { skill: SkillDefinition; origin: string }>();

/** Null: registered. Else the origin that already holds this id; nothing changes. */
export function registerSkill(skill: SkillDefinition, origin: string): string | null {
	const known = registered.get(skill.id);
	if (known) return known.origin;
	registered.set(skill.id, { skill, origin });
	return null;
}

export function allSkills(): readonly SkillDefinition[] {
	return [...registered.values()].map((entry) => entry.skill);
}

export function skillById(id: SkillId): SkillDefinition {
	const found = registered.get(id);
	if (found) return found.skill;
	throw new Error(
		`Unknown skill: ${id}${registered.size === 0 ? ' (no definition is loaded)' : ''}`
	);
}

export function hasSkill(id: SkillId): boolean {
	return registered.has(id);
}

/** Whether the items of a skill have cards (FSRS): a registered skill with memory. */
export function hasCards(id: SkillId): boolean {
	return registered.get(id)?.skill.memory === true;
}

export function clearSkills(): void {
	registered.clear();
}
