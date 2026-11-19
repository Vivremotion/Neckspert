import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { skillById } from '$lib/domain/skill/registry';
import type { SkillId } from '$lib/domain/skill/types';
import { changeSet } from './change';
import { figureSet } from './figure';
import { noteOnStringSet } from './noteOnString';
import { placedNoteSet } from './placedNote';
import { placedShapeSet } from './placedShape';
import { placedVoicingSet } from './placedVoicing';
import { voicingOnStringsSet } from './voicingOnStrings';
import type { ItemSet } from './types';

export * from './types';
export { ITEM_SET_NAMES, type ItemSetName } from './names';
export { changeSet, type ChangeData, type ChangeItem } from './change';
export { figureSet, type FigureItem } from './figure';
export { placedVoicingSet, type VoicingFigureItem } from './placedVoicing';
export { placedShapeSet, shapeNamed, type FormFigureItem } from './placedShape';
export { placedNoteSet, type IdentifyData } from './placedNote';
export { noteOnStringSet, type LocateData } from './noteOnString';
export {
	voicingOnStringsSet,
	rootPosition,
	type VoicingOnStringsItem,
	type TriadAnchorItem,
	type TriadAnchorData,
	type TriadAnchorConfusion,
	type TriadZoneItem,
	type TriadZoneData,
	type RootConfusion
} from './voicingOnStrings';
export type {
	ChordConfusion,
	ChordGridConfusion,
	ChordReading
} from '$lib/domain/families/guitar/chordShapes';

/** The sets the code knows, in the order of `ITEM_SET_NAMES`. */
export const ITEM_SETS: readonly ItemSet[] = [
	noteOnStringSet,
	placedNoteSet,
	voicingOnStringsSet,
	placedVoicingSet,
	placedShapeSet,
	changeSet,
	figureSet
] as readonly ItemSet[];

/** Throws on an id no set holds. */
export function itemSet(id: string): ItemSet {
	const found = ITEM_SETS.find((candidate) => candidate.id === id);
	if (!found) throw new Error(`Unknown item set: ${id}`);
	return found;
}

/** The set a skill's items belong to; throws on an unknown skill or set. */
export function setOfSkill(skill: SkillId): ItemSet {
	return itemSet(skillById(skill).items);
}

/** The set whose items an exercise's rounds read: its skill's. */
export function exerciseItemSet(definition: ExerciseDefinition): ItemSet {
	return setOfSkill(definition.practices);
}

/**
 * The id of the set whose items an exercise's rounds read (`exerciseItemSet`), which the
 * vocabulary's `reads` name: a set the code may not hold (a spec's invented one) is named too.
 */
export function exerciseSetId(definition: ExerciseDefinition): string {
	return skillById(definition.practices).items;
}
