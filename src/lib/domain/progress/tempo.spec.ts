import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import {
	TEMPO_LOWER_AT,
	TEMPO_MAX_BPM,
	TEMPO_MIN_BPM,
	TEMPO_MIN_PROMPTS,
	TEMPO_RAISE_AT,
	TEMPO_STEP_BPM,
	clampTempo,
	nextSessionTempo
} from './tempo';

function attempt(overrides: Partial<Attempt> = {}): Attempt {
	return {
		sessionId: 's',
		cardKey: 'locate:6:G',
		target: { direction: 'locate', string: 6, pitch: 'G' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: 0,
		answer: null,
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 0,
		reactionMs: 1000,
		confusion: null,
		...overrides
	};
}

const miss = { correct: false, verdict: 'wrong' } as const;

function session(hits: number, misses: number): Attempt[] {
	return [
		...Array.from({ length: hits }, () => attempt()),
		...Array.from({ length: misses }, () => attempt(miss))
	];
}

describe('tempo constants', () => {
	it('moves 5 bpm between 80 and 160, above 90 % or under 70 %', () => {
		expect([TEMPO_MIN_BPM, TEMPO_MAX_BPM, TEMPO_STEP_BPM]).toEqual([80, 160, 5]);
		expect([TEMPO_RAISE_AT, TEMPO_LOWER_AT, TEMPO_MIN_PROMPTS]).toEqual([0.9, 0.7, 10]);
	});
});

describe('nextSessionTempo', () => {
	it('speeds up after a session above 90 %', () => {
		expect(nextSessionTempo(80, session(19, 1))).toBe(85);
		expect(nextSessionTempo(80, session(9, 1))).toBe(80);
	});

	it('slows down after a session under 70 %', () => {
		expect(nextSessionTempo(100, session(6, 4))).toBe(95);
		expect(nextSessionTempo(100, session(7, 3))).toBe(100);
	});

	it('stays within 80 and 160 bpm', () => {
		expect(nextSessionTempo(80, session(5, 5))).toBe(80);
		expect(nextSessionTempo(158, session(20, 0))).toBe(160);
		expect(nextSessionTempo(160, session(20, 0))).toBe(160);
	});

	it('never moves a tempo set outside the range the wrong way', () => {
		expect(nextSessionTempo(60, session(5, 5))).toBe(60);
		expect(nextSessionTempo(60, session(20, 0))).toBe(80);
	});

	it('needs ten mode 1 prompts, probes and mode 2 left out, off beat counted as a miss', () => {
		const probes = Array.from({ length: 10 }, () => attempt({ phase: 'probe' }));
		const identify = Array.from({ length: 10 }, () =>
			attempt({ target: { direction: 'identify', string: 6, fret: 3 }, leadBeats: null })
		);
		expect(nextSessionTempo(80, [...session(9, 0), ...probes, ...identify])).toBe(80);
		const offbeat = Array.from({ length: 4 }, () => attempt({ verdict: 'offbeat' }));
		expect(nextSessionTempo(100, [...session(6, 0), ...offbeat])).toBe(95);
	});
});

describe('clampTempo', () => {
	it('rounds and keeps the tempo between 80 and 160', () => {
		expect(clampTempo(79.6)).toBe(80);
		expect(clampTempo(60)).toBe(80);
		expect(clampTempo(200)).toBe(160);
	});
});
