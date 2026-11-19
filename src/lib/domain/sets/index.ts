import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { skillById } from '$lib/domain/skill/registry';
import type { SkillId } from '$lib/domain/skill/types';
import { changeSet } from './change';
import { gestureChangeSet } from './chordGrid';
import { figureSet } from './figure';
import { noteOnStringSet } from './noteOnString';
import { placedNoteSet } from './placedNote';
import { placedShapeSet } from './placedShape';
import { placedVoicingSet } from './placedVoicing';
import { voicingOnStringsSet } from './voicingOnStrings';
import type { ItemSet } from './types';

export * from './types';
export { ITEM_SET_NAMES, type ItemSetName } from './names';
export { changeSet, type ChangeItem } from './change';
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
export type { ChordConfusion, ChordReading } from '$lib/domain/families/guitar/chordShapes';
export {
	admits,
	admittedShapes,
	gestureChangeSet,
	climbDirection,
	closestShape,
	expectedShape,
	inZone,
	parseTriadId,
	shapePosition,
	triadId,
	triadShapes,
	type ChordGridConfusion,
	type ChordGridData,
	type ChordGridItem,
	type GestureRule
} from './chordGrid';

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

/** The views of the changes, whose rounds read a gesture change until plan 4 (D6). */
const CHANGE_VIEWS: readonly string[] = ['grid-scroll', 'link-lane'];

/**
 * The set whose items an exercise's rounds read: its skill's, but a gesture change for an exercise
 * drawn by a changes view until plan 4 (D6), whatever its skill's set (the link's skill is on
 * placed voicings, its rounds read changes).
 */
export function exerciseItemSet(definition: ExerciseDefinition): ItemSet {
	return readsChanges(definition)
		? (gestureChangeSet as ItemSet)
		: setOfSkill(definition.practices);
}

/**
 * The id of the set whose items an exercise's rounds read (`exerciseItemSet`), which the
 * vocabulary's `reads` name: a set the code may not hold (a spec's invented one) is named too.
 */
export function exerciseSetId(definition: ExerciseDefinition): string {
	return readsChanges(definition) ? gestureChangeSet.id : skillById(definition.practices).items;
}

/** An exercise drawn by a changes view reads gesture changes: the gesture's params run it. */
export function readsChanges(definition: ExerciseDefinition): boolean {
	return definition.view !== undefined && CHANGE_VIEWS.includes(definition.view);
}
