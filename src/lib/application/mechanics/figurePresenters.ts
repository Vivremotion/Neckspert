import {
	figureRules,
	formFigureRules,
	voicingFigureRules,
	type FigureItem,
	type FormFigureItem,
	type VoicingFigureItem
} from '$lib/domain/mechanics';
import { RHYTHM_SENSOR } from '$lib/domain/time';
import type { MechanicPresenter } from './types';

/**
 * The rhythm on the series: a figure played on the guitar, heard by the attack sensor. Its screen
 * model is the figure view's (`figureStage`), built by the series' stage dispatch, not by a
 * presenter.
 */
export const figurePresenter: MechanicPresenter<FigureItem> = {
	rules: figureRules,
	scene: 'guitar',
	sensors: [RHYTHM_SENSOR]
};

/**
 * The notes of a chord shape played as a figure, heard by the note sensor, each judged on its
 * pitch. Its screen model is the figure view's too.
 */
export const voicingFigurePresenter: MechanicPresenter<VoicingFigureItem> = {
	rules: voicingFigureRules,
	scene: 'guitar',
	sensors: ['note']
};

/**
 * A form moved from chord to chord, played as a figure, heard by the note sensor, each note judged
 * on its pitch. Its screen model is the figure view's too.
 */
export const formFigurePresenter: MechanicPresenter<FormFigureItem> = {
	rules: formFigureRules,
	scene: 'guitar',
	sensors: ['note']
};

/** The mechanics played as a figure, by mechanic id. */
export const FIGURE_PRESENTERS: Record<string, MechanicPresenter> = {
	[figureRules.id]: figurePresenter,
	[voicingFigureRules.id]: voicingFigurePresenter,
	[formFigureRules.id]: formFigurePresenter
};
