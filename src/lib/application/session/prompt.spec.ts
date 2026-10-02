import { describe, expect, it } from 'vitest';
import { buildAnswerChoices, buildPromptView } from './prompt';
import type { PlannedItem } from '$lib/domain/types';

const locate: PlannedItem = {
	target: { direction: 'locate', string: 2, pitch: 'F' },
	phase: 'review',
	temperature: 'cold',
	aid: 'show-position',
	leadBeats: 2
};

const identify: PlannedItem = {
	target: { direction: 'identify', string: 5, fret: 8 },
	phase: 'review',
	temperature: 'cold',
	aid: 'none',
	leadBeats: null
};

describe('buildPromptView', () => {
	it('builds a locate prompt with aid fret', () => {
		const view = buildPromptView(locate, 'fr', () => 0);
		expect(view.direction).toBe('locate');
		expect(view.primary).toBe('F');
		expect(view.secondary).toBe('corde de B');
		expect(view.aid).toBe('case 6');
	});

	it('omits aid when aid is none', () => {
		const view = buildPromptView({ ...locate, aid: 'none' }, 'fr', () => 0);
		expect(view.aid).toBeNull();
	});

	it('spells altered pitches from random', () => {
		const item: PlannedItem = {
			...locate,
			target: { direction: 'locate', string: 2, pitch: 'F#' },
			aid: 'none'
		};
		expect(buildPromptView(item, 'fr', () => 0).primary).toBe('F#');
		expect(buildPromptView(item, 'fr', () => 0.5).primary).toBe('Gb');
	});

	it('builds an identify prompt (fret primary, no aid)', () => {
		const view = buildPromptView(identify, 'fr', () => 0);
		expect(view.direction).toBe('identify');
		expect(view.primary).toBe('case 8');
		expect(view.secondary).toBe('corde de A');
		expect(view.aid).toBeNull();
	});

	it('names the note as the aid of an identify presentation', () => {
		const view = buildPromptView({ ...identify, aid: 'show-position' }, 'fr', () => 0);
		expect(view.aid).toBe('F');
	});

	it('uses English labels', () => {
		const view = buildPromptView(identify, 'en', () => 0);
		expect(view.primary).toBe('fret 8');
		expect(view.secondary).toBe('A string');
	});
});

describe('buildAnswerChoices', () => {
	it('returns twelve chromatic choices', () => {
		const choices = buildAnswerChoices();
		expect(choices).toHaveLength(12);
		expect(choices[0]).toEqual({ pitch: 'C', label: 'C' });
		expect(choices[1]).toEqual({ pitch: 'C#', label: 'C# / Db' });
		expect(choices[6]).toEqual({ pitch: 'F#', label: 'F# / Gb' });
	});
});
