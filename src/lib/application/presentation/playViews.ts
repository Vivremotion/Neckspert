/** The views that draw a `PromptStageModel`: the only ones an exercise's presentation can name. */
export const PROMPT_STAGE_VIEWS: readonly string[] = ['lane', 'answer-keys'];

/**
 * Every view the screen draws, by the name an exercise gives: the keys of the screen's registry
 * (`ui/play/views` `PLAY_VIEWS`, held equal to this list by a test of the screen), written here
 * so that the checks of the application, which cannot import the screen, know them. Kept out of
 * the session core, which never names the rhythm mechanic its view is named after.
 */
export const PLAY_VIEW_NAMES: readonly string[] = [
	'answer-keys',
	'grid-scroll',
	'lane',
	'link-lane',
	'rhythm-figure'
];
