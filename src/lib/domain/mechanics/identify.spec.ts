import { describe, expect, it } from 'vitest';
import { identifyTiming } from '$lib/domain/timing';
import { cardKeyOf, identifyRules, mechanicRules } from './index';

describe('identifyRules', () => {
	it('judges the name of the note at a fret', () => {
		expect(identifyRules.judge({ string: 6, fret: 3 }, 'G')).toEqual({
			correct: true,
			answer: { pitch: 'G' },
			confusion: null
		});
	});

	it('names the confusion of a wrong name', () => {
		expect(identifyRules.judge({ string: 6, fret: 3 }, 'G#')).toEqual({
			correct: false,
			answer: { pitch: 'G#' },
			confusion: { kind: 'semitone', delta: 1 }
		});
	});

	it('answers at its own pace', () => {
		expect(identifyRules.timing.id).toBe('free');
		expect(identifyRules.timing).toBe(identifyTiming);
		expect(identifyRules.learner).toBe('memory');
	});

	it('keys its cards by mechanic and item', () => {
		expect(cardKeyOf(identifyRules, { string: 6, fret: 3 })).toBe('identify:6:3');
		expect(identifyRules.parseItem('6:3')).toEqual({ string: 6, fret: 3 });
		expect(() => identifyRules.parseItem('6:12')).toThrow();
		expect(mechanicRules('identify')).toBe(identifyRules);
	});
});
