import { describe, expect, it } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { PlannedItem } from '$lib/domain/types';
import { GESTURE_PRESENTERS } from '$lib/application/mechanics/chordGrid';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import { SeriesItems } from './seriesItems';

const presenter: MechanicPresenter = {
	...GESTURE_PRESENTERS['chord-grid'],
	scene: 'guitar',
	previewBeats: 1,
	contestable: true
};
const item = { mechanic: 'chord-grid', exerciseId: 'gesture-link' } as unknown as PlannedItem;
const itemsOf = (flow?: ExerciseDefinition['flow']) =>
	new SeriesItems({ 'chord-grid': presenter }, (id) => ({ ...exerciseById(id), flow }));

describe('SeriesItems.flowOf', () => {
	it('takes the mechanic’s defaults when the exercise says nothing', () => {
		expect(itemsOf().flowOf(item)).toEqual({
			scene: 'guitar',
			previewBeats: 1,
			contestable: true
		});
	});

	it('lets the exercise set each part over the mechanic’s', () => {
		expect(itemsOf({ scene: 'screen', previewBeats: 3, contestable: false }).flowOf(item)).toEqual({
			scene: 'screen',
			previewBeats: 3,
			contestable: false
		});
	});

	it('keeps the mechanic’s defaults for what the exercise leaves out', () => {
		expect(itemsOf({ previewBeats: 2 }).flowOf(item)).toEqual({
			scene: 'guitar',
			previewBeats: 2,
			contestable: true
		});
	});

	it('gives no preview when neither says one', () => {
		const items = new SeriesItems(
			{ 'chord-grid': { ...presenter, previewBeats: undefined, contestable: undefined } },
			exerciseById
		);
		expect(items.flowOf(item)).toMatchObject({ previewBeats: null, contestable: false });
	});
});

describe('SeriesItems.presenterOf', () => {
	it('names a mechanic without a presenter', () => {
		const items = new SeriesItems({}, exerciseById);
		expect(() => items.presenterOf(item)).toThrow('No presenter for mechanic: chord-grid');
	});
});
