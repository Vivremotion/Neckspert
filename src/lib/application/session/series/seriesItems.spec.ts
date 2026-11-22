import { describe, expect, it } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { PlannedItem } from '$lib/domain/types';
import { VIEW_PRESENTERS } from '$lib/application/sets';
import type { SetPresenter } from '$lib/application/sets/types';
import { SeriesItems } from './seriesItems';

const presenter: SetPresenter = {
	...VIEW_PRESENTERS['link-lane'],
	scene: 'guitar',
	previewBeats: 1,
	contestable: true
};
const item = { skill: 'grid-reading', exerciseId: 'inversion-run' } as unknown as PlannedItem;
const itemsOf = (flow?: ExerciseDefinition['flow']) =>
	new SeriesItems({ presenters: {}, views: { 'link-lane': presenter } }, (id) => ({
		...exerciseById(id),
		flow
	}));

describe('SeriesItems.flowOf', () => {
	it('takes the presenter’s defaults when the exercise says nothing', () => {
		expect(itemsOf().flowOf(item)).toEqual({
			scene: 'guitar',
			previewBeats: 1,
			contestable: true,
			briefing: 'each-series'
		});
	});

	it('lets the exercise set each part over the presenter’s', () => {
		expect(
			itemsOf({
				scene: 'screen',
				previewBeats: 3,
				contestable: false,
				briefing: 'first-encounter'
			}).flowOf(item)
		).toEqual({
			scene: 'screen',
			previewBeats: 3,
			contestable: false,
			briefing: 'first-encounter'
		});
	});

	it('keeps the presenter’s defaults for what the exercise leaves out', () => {
		expect(itemsOf({ previewBeats: 2 }).flowOf(item)).toEqual({
			scene: 'guitar',
			previewBeats: 2,
			contestable: true,
			briefing: 'each-series'
		});
	});

	it('gives no preview when neither says one', () => {
		const items = new SeriesItems(
			{
				presenters: {},
				views: { 'link-lane': { ...presenter, previewBeats: undefined, contestable: undefined } }
			},
			exerciseById
		);
		expect(items.flowOf(item)).toMatchObject({ previewBeats: null, contestable: false });
	});
});

describe('SeriesItems.presenterOf', () => {
	it('names the set and the skill of an exercise without a presenter', () => {
		const items = new SeriesItems({ presenters: {}, views: {} }, exerciseById);
		expect(() => items.presenterOf(item)).toThrow(
			'No presenter for the item set "placed-voicing" of skill "inversion-run"'
		);
	});

	it('finds the presenter of the item’s exercise: its view’s, before its set’s', () => {
		const items = new SeriesItems(
			{
				presenters: { 'placed-voicing': presenter },
				views: { 'link-lane': VIEW_PRESENTERS['link-lane'] }
			},
			exerciseById
		);
		expect(items.presenterOf(item).expectation).toBe(VIEW_PRESENTERS['link-lane'].expectation);
	});
});
