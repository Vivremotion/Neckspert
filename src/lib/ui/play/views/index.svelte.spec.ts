import { describe, expect, it } from 'vitest';
import { PLAY_VIEW_NAMES, PROMPT_STAGE_VIEWS } from '$lib/application/presentation/playViews';
import { PLAY_VIEWS, VIEW_WORLDS } from './index';

/**
 * Tripwire: the application checks the views an exercise names against its own list
 * (`screenProblem`), since it cannot import the screen; the screen's registry must draw exactly
 * those.
 */
describe('the play views', () => {
	it('are the views the application knows, each in a world', () => {
		expect(Object.keys(PLAY_VIEWS).sort()).toEqual([...PLAY_VIEW_NAMES].sort());
		expect(Object.keys(VIEW_WORLDS).sort()).toEqual([...PLAY_VIEW_NAMES].sort());
		expect(PLAY_VIEW_NAMES).toContain('figure');
	});

	it('draw a presentation in every view the application gives one to', () => {
		for (const view of PROMPT_STAGE_VIEWS) expect(Object.hasOwn(PLAY_VIEWS, view)).toBe(true);
		// The figure view draws a prompt above its figure.
		expect(PROMPT_STAGE_VIEWS).toContain('figure');
	});
});
