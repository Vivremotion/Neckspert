import { describe, expect, it } from 'vitest';
import { beatTiming } from '$lib/domain/timing';
import { cardKeyOf, locateRules, mechanicRules, MECHANIC_RULES } from './index';

describe('locateRules', () => {
	it('judges a played note right on any acceptable octave', () => {
		expect(locateRules.judge({ string: 2, pitch: 'F' }, { midi: 65 })).toEqual({
			correct: true,
			answer: { midi: 65 },
			confusion: null
		});
		expect(locateRules.judge({ string: 2, pitch: 'F' }, { midi: 77 }).correct).toBe(true);
	});

	it('names the confusion of a wrong note', () => {
		expect(locateRules.judge({ string: 2, pitch: 'F' }, { midi: 66 })).toEqual({
			correct: false,
			answer: { midi: 66 },
			confusion: { kind: 'semitone', delta: 1 }
		});
		expect(locateRules.judge({ string: 2, pitch: 'F' }, { midi: 59 }).confusion).toEqual({
			kind: 'string-name'
		});
	});

	it('plays on the beat and learns by memory', () => {
		expect(locateRules.timing).toBe(beatTiming);
		expect(locateRules.learner).toBe('memory');
	});

	it('keys its cards by mechanic and item', () => {
		expect(cardKeyOf(locateRules, { string: 6, pitch: 'F' })).toBe('locate:6:F');
		expect(locateRules.parseItem('6:F')).toEqual({ string: 6, pitch: 'F' });
		expect(() => locateRules.parseItem('7:F')).toThrow();
	});
});

describe('mechanicRules', () => {
	it('finds the rules of a known mechanic', () => {
		expect(mechanicRules('locate')).toBe(locateRules);
		expect(MECHANIC_RULES.map((rules) => rules.id)).toEqual(['locate', 'identify']);
	});

	it('throws on an unknown mechanic', () => {
		expect(() => mechanicRules('chords')).toThrow();
	});
});
