export type SkillId = string;

/** What an exercise practises, written in a definition file. */
export interface SkillDefinition {
	id: SkillId;
	name: { fr: string; en: string };
	/** The registered set its items belong to. */
	items: string;
	/** With cards (FSRS), or measured by its attempts alone. */
	memory: boolean;
	/** What counts as a direct recall; a memory skill writes it. */
	directRecall?: { withinMs: number };
}
