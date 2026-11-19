import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { placedNotePresenter } from './placedNote';
import { noteOnStringPresenter } from './noteOnString';
import { figurePresenter, placedShapePresenter, placedVoicingPresenter } from './figurePresenters';
import { changePresenter, VIEW_PRESENTERS } from './chordGrid';
import { voicingOnStringsPresenter } from './voicingOnStrings';
import type { SetPresenter } from './types';
import { lookUpPresenter, requirePresenter } from './lookUp';

export * from './types';
export { lookUpPresenter, requirePresenter, type PresenterRegistries } from './lookUp';
export { placedNotePresenter } from './placedNote';
export { noteOnStringPresenter } from './noteOnString';
export { voicingOnStringsPresenter } from './voicingOnStrings';
export { figurePresenter, placedShapePresenter, placedVoicingPresenter } from './figurePresenters';
export { changeExpectation, NEIGHBOUR_FRETS } from './changeExpectation';
export {
	changePresenter,
	linkPresenter,
	VIEW_PRESENTERS,
	type GridCue,
	type GridStageModel,
	type LinkAidNote,
	type LinkLaneModel,
	type LinkTile
} from './chordGrid';

/** Every set the application presents, by set id; a set's other presenters by view (`VIEW_PRESENTERS`). */
export const SET_PRESENTERS: Readonly<Record<string, SetPresenter>> = Object.fromEntries(
	[
		noteOnStringPresenter,
		placedNotePresenter,
		voicingOnStringsPresenter,
		placedVoicingPresenter,
		placedShapePresenter,
		changePresenter,
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
 * The presenter of an exercise: the one registered for its view when it presents its skill's
 * set (the link's lane), else its set's; it listens with the sensors its round names, the set's where it names none
 * (D5). Throws, naming the set and the skill, when there is none.
 */
export function presenterOf(
	definition: ExerciseDefinition,
	presenters: Readonly<Record<string, SetPresenter>> = SET_PRESENTERS,
	views: Readonly<Record<string, SetPresenter>> = VIEW_PRESENTERS
): SetPresenter {
	return requirePresenter(definition, { presenters, views });
}
