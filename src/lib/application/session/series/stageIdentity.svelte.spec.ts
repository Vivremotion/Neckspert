import { describe, expect, it } from 'vitest';
import { ORIGIN, rhythmSeries, stageOf } from '$lib/testing/rhythmSeries';
import { RHYTHM_OFFBEATS } from '$lib/testing/catalog';

const BAR_S = 3; // ♩ = 80 bpm

/**
 * Run in the browser's project on purpose: there the controller's view is reactive state, which
 * wraps plain objects. A stage wrapped anew on every beat gave its figure a new identity each
 * time, and the figure view engraved the whole score again several times a second.
 */
describe('the stage of a round that follows the beats, held as reactive state', () => {
	it('is built again on each beat with the same figure, as the same object', async () => {
		const { controller, advance } = await rhythmSeries(RHYTHM_OFFBEATS, { met: true });
		await controller.ready();
		await controller.start();
		await advance(ORIGIN + 3.3 * BAR_S);
		const first = stageOf(controller);
		expect(first.phase).toBe('play');
		await advance(ORIGIN + 3.6 * BAR_S);
		const second = stageOf(controller);
		expect(second.cursor).not.toEqual(first.cursor);
		expect(second.figure).toBe(first.figure);
		controller.quit();
	});
});
