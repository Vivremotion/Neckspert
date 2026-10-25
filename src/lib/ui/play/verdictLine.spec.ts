import { describe, expect, it } from 'vitest';
import { captionOf, formatOffset, HITS } from './verdictLine';

const WORDS = {
	playedAs: (label: string) => `${label} joué`,
	nothingHeard: 'rien entendu',
	verdict: {
		perfect: 'Parfait',
		early: 'En avance',
		late: 'En retard',
		offbeat: 'Hors temps',
		corrected: 'Corrigé',
		wrong: 'Mauvaise note'
	}
};

describe('formatOffset', () => {
	it('signs an offset with a true minus, and a zero without a sign', () => {
		expect(formatOffset(42)).toBe('+42 ms');
		expect(formatOffset(-8.2)).toBe('−8 ms');
		expect(formatOffset(0)).toBe('0 ms');
	});
});

describe('captionOf', () => {
	const at = (verdict: Parameters<typeof captionOf>[0]) => captionOf(verdict, WORDS);

	it('says a hit by its verdict, then its offset when timed', () => {
		expect(at({ verdict: 'late', offsetMs: 42, answerLabel: 'F' })).toBe('en retard · +42 ms');
		expect(at({ verdict: 'perfect', offsetMs: null, answerLabel: 'F' })).toBe('parfait');
	});

	it('says what was played after a wrong note, or that nothing was heard', () => {
		expect(at({ verdict: 'wrong', offsetMs: 30, answerLabel: 'F#' })).toBe('F# joué · +30 ms');
		expect(at({ verdict: 'wrong', offsetMs: null, answerLabel: null })).toBe('rien entendu');
	});
});

describe('HITS', () => {
	it('holds the verdicts of a success only', () => {
		expect([...HITS].sort()).toEqual(['early', 'late', 'offbeat', 'perfect']);
	});
});
