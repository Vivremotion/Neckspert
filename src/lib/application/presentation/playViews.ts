/**
 * The view that draws the figure of a round (`figureStage`), the exercise's prompt above it when
 * it writes a presentation. Named here, out of the session core, which never names the mechanic
 * of the same name.
 */
export const FIGURE_VIEW = 'figure';

/**
 * The views that draw an exercise's presentation: the only ones it can name. The lane and the
 * answer keys read a `PromptStageModel`; the figure view, its prompt above the figure.
 */
export const PROMPT_STAGE_VIEWS: readonly string[] = ['lane', 'answer-keys', FIGURE_VIEW];

/**
 * Every view the screen draws, by the name an exercise gives: the keys of the screen's registry
 * (`ui/play/views` `PLAY_VIEWS`, held equal to this list by a test of the screen), written here
 * so that the checks of the application, which cannot import the screen, know them.
 */
export const PLAY_VIEW_NAMES: readonly string[] = [
	'answer-keys',
	FIGURE_VIEW,
	'grid-scroll',
	'lane',
	'link-lane'
];
