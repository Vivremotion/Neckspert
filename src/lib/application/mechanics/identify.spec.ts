import { describe, expect, it } from 'vitest';
import { identifyRules } from '$lib/domain/mechanics';
import { identifyPresenter } from './identify';
import { NECK_PRESENTERS } from './index';

const item = { string: 5, fret: 8 } as const;
const unaided = { aid: 'none', stringAid: false } as const;

describe('identifyPresenter', () => {
	it('is answered on the screen, by a tap', () => {
		expect(identifyPresenter.rules).toBe(identifyRules);
		expect(identifyPresenter.scene).toBe('screen');
		expect(identifyPresenter.sensor).toBe('tap');
		expect(NECK_PRESENTERS.identify).toBe(identifyPresenter);
	});

	it('builds an identify prompt (fret primary, no aid)', () => {
		const view = identifyPresenter.prompt(item, unaided, 'fr', () => 0);
		expect(view.primary).toBe('case 8');
		expect(view.secondary).toBe('corde de A');
		expect(view.aid).toBeNull();
		expect(view.diagram).toBeNull();
	});

	it('never draws the string', () => {
		expect(
			identifyPresenter.prompt(item, { aid: 'none', stringAid: true }, 'fr', () => 0).diagram
		).toBeNull();
	});

	it('names the note as the aid of an identify presentation', () => {
		const view = identifyPresenter.prompt(
			item,
			{ aid: 'show-position', stringAid: false },
			'fr',
			() => 0
		);
		expect(view.aid).toBe('F');
	});

	it('uses English labels', () => {
		const view = identifyPresenter.prompt(item, unaided, 'en', () => 0);
		expect(view.primary).toBe('fret 8');
		expect(view.secondary).toBe('A string');
	});

	it('returns twelve chromatic choices, valued by pitch', () => {
		const choices = identifyPresenter.answerChoices!();
		expect(choices).toHaveLength(12);
		expect(choices[0]).toEqual({ value: 'C', label: 'C' });
		expect(choices[1]).toEqual({ value: 'C#', label: 'C# / Db' });
		expect(choices[6]).toEqual({ value: 'F#', label: 'F# / Gb' });
	});

	it('spells the tapped name as the answer', () => {
		expect(identifyPresenter.answerLabel({ pitch: 'A#' }, item, 'fr', () => 0)).toBe('A#');
		expect(identifyPresenter.answerLabel({ pitch: 'A#' }, item, 'fr', () => 0.5)).toBe('Bb');
	});

	it('reveals the name, both spellings for an altered one, after a miss', () => {
		const miss = { correct: false, verdict: 'wrong' } as const;
		expect(identifyPresenter.reveal(item, miss, 'fr')).toBe('F');
		expect(identifyPresenter.reveal({ string: 5, fret: 1 } as const, miss, 'fr')).toBe('A# / Bb');
	});

	it('reveals nothing on a right name', () => {
		expect(identifyPresenter.reveal(item, { correct: true, verdict: 'perfect' }, 'fr')).toBeNull();
		expect(identifyPresenter.reveal(item, { correct: true, verdict: 'late' }, 'fr')).toBeNull();
	});
});
