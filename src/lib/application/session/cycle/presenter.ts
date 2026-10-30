import { figureRules, type FigureItem } from '$lib/domain/mechanics';
import { RHYTHM_SENSOR } from '$lib/domain/time';
import type { MechanicPresenter } from '$lib/application/mechanics/types';

/**
 * The rhythm on the series: a figure played on the guitar, heard by the attack sensor. Its screen
 * model is the cycle's (`rhythmStage`), built by the series' stage dispatch, not by a presenter.
 */
export const figurePresenter: MechanicPresenter<FigureItem> = {
	rules: figureRules,
	scene: 'guitar',
	sensors: [RHYTHM_SENSOR]
};

export const RHYTHM_PRESENTERS: Record<string, MechanicPresenter> = {
	[figureRules.id]: figurePresenter
};
