import { describe, expect, it } from 'vitest';
import { figureSet, placedShapeSet, placedVoicingSet } from '$lib/domain/sets';
import { SET_PRESENTERS } from './index';

const FIGURE_PRESENTERS = {
	[figureSet.id]: SET_PRESENTERS[figureSet.id],
	[placedVoicingSet.id]: SET_PRESENTERS[placedVoicingSet.id],
	[placedShapeSet.id]: SET_PRESENTERS[placedShapeSet.id]
};

describe('the figure presenters', () => {
	it('play the rhythm on the attack sensor, a chord shape and a form on the note sensor, on the guitar', () => {
		expect(FIGURE_PRESENTERS[figureSet.id]).toMatchObject({
			scene: 'guitar',
			sensors: ['attack']
		});
		expect(FIGURE_PRESENTERS[placedVoicingSet.id]).toMatchObject({
			set: placedVoicingSet,
			scene: 'guitar',
			sensors: ['note']
		});
		expect(FIGURE_PRESENTERS[placedShapeSet.id]).toMatchObject({
			set: placedShapeSet,
			scene: 'guitar',
			sensors: ['note']
		});
		// Their screen is the figure view's, built by the series: no model of their own.
		for (const presenter of Object.values(FIGURE_PRESENTERS)) {
			expect(presenter.stageOf).toBeUndefined();
		}
	});
});
