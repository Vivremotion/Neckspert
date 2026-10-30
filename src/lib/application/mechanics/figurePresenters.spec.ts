import { describe, expect, it } from 'vitest';
import { figureRules, voicingFigureRules } from '$lib/domain/mechanics';
import { FIGURE_PRESENTERS } from './figurePresenters';

describe('the figure presenters', () => {
	it('play the rhythm on the attack sensor and a chord shape on the note sensor, on the guitar', () => {
		expect(Object.keys(FIGURE_PRESENTERS).sort()).toEqual(
			[figureRules.id, voicingFigureRules.id].sort()
		);
		expect(FIGURE_PRESENTERS[figureRules.id]).toMatchObject({
			scene: 'guitar',
			sensors: ['attack']
		});
		expect(FIGURE_PRESENTERS[voicingFigureRules.id]).toMatchObject({
			rules: voicingFigureRules,
			scene: 'guitar',
			sensors: ['note']
		});
		// Their screen is the figure view's, built by the series: no model of their own.
		for (const presenter of Object.values(FIGURE_PRESENTERS)) {
			expect(presenter.stageOf).toBeUndefined();
		}
	});
});
