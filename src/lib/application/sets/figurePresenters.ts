import {
	figureSet,
	placedShapeSet,
	placedVoicingSet,
	type FigureItem,
	type FormFigureItem,
	type VoicingFigureItem
} from '$lib/domain/sets';
import { RHYTHM_SENSOR } from '$lib/domain/time';
import type { SetPresenter } from './types';

/**
 * The rhythm on the series: a figure played on the guitar, heard by the attack sensor. Its screen
 * model is the figure view's (`figureStage`), built by the series' stage dispatch, not by a
 * presenter.
 */
export const figurePresenter: SetPresenter<FigureItem> = {
	set: figureSet,
	scene: 'guitar',
	sensors: [RHYTHM_SENSOR]
};

/**
 * The notes of a chord shape played as a figure, heard by the note sensor, each judged on its
 * pitch. Its screen model is the figure view's too.
 */
export const placedVoicingPresenter: SetPresenter<VoicingFigureItem> = {
	set: placedVoicingSet,
	scene: 'guitar',
	sensors: ['note']
};

/**
 * A form moved from chord to chord, played as a figure, heard by the note sensor, each note judged
 * on its pitch. Its screen model is the figure view's too.
 */
export const placedShapePresenter: SetPresenter<FormFigureItem> = {
	set: placedShapeSet,
	scene: 'guitar',
	sensors: ['note']
};
