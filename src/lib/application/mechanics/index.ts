import type { MechanicId } from '$lib/domain/exercise/types';
import { identifyPresenter } from './identify';
import { locatePresenter } from './locate';
import { FIGURE_PRESENTERS } from './figurePresenters';
import { GESTURE_PRESENTERS } from './chordGrid';
import { TRIAD_PRESENTERS } from './triads';
import type { MechanicPresenter } from './types';

export * from './types';
export { identifyPresenter } from './identify';
export { locatePresenter } from './locate';
export { TRIAD_PRESENTERS, triadAnchorPresenter, triadZonePresenter } from './triads';
export {
	chordGridPresenter,
	GESTURE_PRESENTERS,
	gridExpectation,
	NEIGHBOUR_FRETS,
	type GridCue,
	type GridStageModel,
	type LinkAidNote,
	type LinkLaneModel,
	type LinkTile
} from './chordGrid';

/** The neck's mechanics as the session shows them, by mechanic id. */
export const NECK_PRESENTERS: Record<MechanicId, MechanicPresenter> = {
	[locatePresenter.rules.id]: locatePresenter,
	[identifyPresenter.rules.id]: identifyPresenter
};

/** Every mechanic the application plays, by mechanic id. */
export const MECHANIC_PRESENTERS: Record<MechanicId, MechanicPresenter> = {
	...NECK_PRESENTERS,
	...TRIAD_PRESENTERS,
	...GESTURE_PRESENTERS,
	...FIGURE_PRESENTERS
};
