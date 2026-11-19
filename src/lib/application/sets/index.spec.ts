import { describe, expect, it } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import { ITEM_SET_NAMES } from '$lib/domain/sets/names';
import { presenterOf, SET_PRESENTERS, VIEW_PRESENTERS } from './index';

describe('SET_PRESENTERS', () => {
	it('holds a presenter for each set, and by view a set’s other presenter', () => {
		expect(Object.keys(SET_PRESENTERS).sort()).toEqual([...ITEM_SET_NAMES].sort());
		for (const [id, presenter] of Object.entries(SET_PRESENTERS)) expect(presenter.set.id).toBe(id);
		// The link's shapes are placed voicings, which the sequence's figures present otherwise.
		expect(Object.keys(VIEW_PRESENTERS)).toEqual(['link-lane']);
		expect(VIEW_PRESENTERS['link-lane'].set.id).toBe('placed-voicing');
	});
});

describe('presenterOf', () => {
	it('presents an exercise with its view’s presenter when that presenter presents its set', () => {
		const link = exerciseById('inversion-run');
		const presenter = presenterOf(link);
		expect(presenter.stageOf).toBe(VIEW_PRESENTERS['link-lane'].stageOf);
		expect(presenter.set).toBe(VIEW_PRESENTERS['link-lane'].set);
		// Another set's exercise on that view keeps its own set's presenter.
		const jam = { ...exerciseById('grid-reading'), view: 'link-lane' };
		expect(presenterOf(jam).set).toBe(SET_PRESENTERS.change.set);
		expect(presenterOf(exerciseById('grid-reading')).stageOf).toBe(SET_PRESENTERS.change.stageOf);
	});

	it('presents the anchor and the zone with the voicings’ presenter', () => {
		const zone = presenterOf(exerciseById('chord-zone'));
		const anchor = presenterOf(exerciseById('chord-anchor'));
		expect(zone.set.id).toBe('voicing-on-strings');
		expect(anchor.expectation).toBe(zone.expectation);
	});

	it('listens with the sensors the round names, the set’s where it names none', () => {
		expect(presenterOf(exerciseById('chord-zone')).sensors).toEqual(['chord']);
		expect(presenterOf(exerciseById('chord-anchor')).sensors).toEqual(['note', 'chord']);
		const silent = { ...exerciseById('chord-zone'), round: undefined };
		expect(presenterOf(silent).sensors).toEqual(SET_PRESENTERS['voicing-on-strings'].sensors);
	});

	it('names the set and the skill it finds no presenter for', () => {
		const zone = exerciseById('chord-zone');
		expect(() => presenterOf(zone, {}, {})).toThrow(
			'No presenter for the item set "voicing-on-strings" of skill "chord-zone"'
		);
	});
});
