import type { MechanicId } from '$lib/domain/exercise/types';
import { identifyPresenter } from './identify';
import { locatePresenter } from './locate';
import type { MechanicPresenter } from './types';

export * from './types';
export { identifyPresenter } from './identify';
export { locatePresenter } from './locate';
export { TRIAD_PRESENTERS, triadAnchorPresenter, triadZonePresenter } from './triads';

/** The neck's mechanics as the session shows them, by mechanic id. */
export const NECK_PRESENTERS: Record<MechanicId, MechanicPresenter> = {
	[locatePresenter.rules.id]: locatePresenter,
	[identifyPresenter.rules.id]: identifyPresenter
};
