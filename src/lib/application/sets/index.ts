import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { placedNotePresenter } from './placedNote';
import { noteOnStringPresenter } from './noteOnString';
import { figurePresenter, placedShapePresenter, placedVoicingPresenter } from './figurePresenters';
import { VIEW_PRESENTERS } from './chordGrid';
import { voicingOnStringsPresenter } from './voicingOnStrings';
import type { SetPresenter } from './types';
import { lookUpPresenter, requirePresenter } from './lookUp';

export * from './types';
export { lookUpPresenter, requirePresenter, type PresenterRegistries } from './lookUp';
export { placedNotePresenter } from './placedNote';
export { noteOnStringPresenter } from './noteOnString';
export { voicingOnStringsPresenter } from './voicingOnStrings';
export { figurePresenter, placedShapePresenter, placedVoicingPresenter } from './figurePresenters';
export {
	chordGridPresenter,
	VIEW_PRESENTERS,
	gridExpectation,
	NEIGHBOUR_FRETS,
	type GridCue,
	type GridStageModel,
	type LinkAidNote,
	type LinkLaneModel,
	type LinkTile
} from './chordGrid';

/** Every set the application presents, by set id; the changes are presented by their views. */
export const SET_PRESENTERS: Readonly<Record<string, SetPresenter>> = Object.fromEntries(
	[
		noteOnStringPresenter,
		placedNotePresenter,
		voicingOnStringsPresenter,
		placedVoicingPresenter,
		placedShapePresenter,
		figurePresenter
	].map((presenter) => [presenter.set.id, presenter])
);

/** The presenter an exercise finds (`lookUpPresenter`); undefined when none. */
export function findPresenter(
	definition: ExerciseDefinition,
	presenters: Readonly<Record<string, SetPresenter>> = SET_PRESENTERS,
	views: Readonly<Record<string, SetPresenter>> = VIEW_PRESENTERS
): SetPresenter | undefined {
	return lookUpPresenter(definition, { presenters, views });
}

/**
 * The presenter of an exercise: its view's when its view has one (the changes, D6), else the one
 * of its skill's set; it listens with the sensors its round names, the set's where it names none
 * (D5). Throws, naming the set and the skill, when there is none.
 */
export function presenterOf(
	definition: ExerciseDefinition,
	presenters: Readonly<Record<string, SetPresenter>> = SET_PRESENTERS,
	views: Readonly<Record<string, SetPresenter>> = VIEW_PRESENTERS
): SetPresenter {
	return requirePresenter(definition, { presenters, views });
}
