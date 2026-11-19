import { describe, expect, it } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import { ITEM_SET_NAMES } from '$lib/domain/sets/names';
import { presenterOf, SET_PRESENTERS, VIEW_PRESENTERS } from './index';

describe('SET_PRESENTERS', () => {
	it('holds a presenter for each set but the changes, which their views present', () => {
		expect(Object.keys(SET_PRESENTERS).sort()).toEqual(
			ITEM_SET_NAMES.filter((name) => name !== 'change').sort()
		);
		for (const [id, presenter] of Object.entries(SET_PRESENTERS)) expect(presenter.set.id).toBe(id);
		expect(Object.keys(VIEW_PRESENTERS).sort()).toEqual(['grid-scroll', 'link-lane']);
	});
});

describe('presenterOf', () => {
	it('presents an exercise drawn by a changes view with that view’s presenter, whatever its skill', () => {
		const link = exerciseById('inversion-run');
		const presenter = presenterOf(link);
		expect(presenter.stageOf).toBe(VIEW_PRESENTERS['link-lane'].stageOf);
		expect(presenter.set).toBe(VIEW_PRESENTERS['link-lane'].set);
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
