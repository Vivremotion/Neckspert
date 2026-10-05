import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import { LOCATE_NECK } from './catalog';
import {
	DEFAULT_TEMPO_BPM,
	TEMPO_MAX_BPM,
	TEMPO_MIN_BPM,
	clampTempo,
	nextTempo,
	startTempo
} from './tempo';

const p = (exerciseId: string, mechanic: string, tempoBpm: number, updatedAt: number) => ({
	exerciseId,
	mechanic,
	tempoBpm,
	updatedAt
});

describe('startTempo', () => {
	it('prefers the exercise own progression', () => {
		expect(startTempo(LOCATE_NECK, [p('locate-neck', 'locate', 100, 1)])).toBe(100);
		expect(
			startTempo({ ...LOCATE_NECK, startTempoBpm: 120 }, [p('locate-neck', 'locate', 100, 1)])
		).toBe(100);
	});

	it('then its own start tempo', () => {
		expect(startTempo({ ...LOCATE_NECK, startTempoBpm: 120 }, [])).toBe(120);
	});

	it('then the latest progression of the same mechanic', () => {
		expect(
			startTempo({ ...LOCATE_NECK, id: 'locate-g' }, [
				p('locate-neck', 'locate', 90, 1),
				p('locate-b', 'locate', 110, 2),
				p('identify-neck', 'identify', 150, 3)
			])
		).toBe(110);
	});

	it('then the default', () => {
		expect(DEFAULT_TEMPO_BPM).toBe(80);
		expect(startTempo(LOCATE_NECK, [])).toBe(DEFAULT_TEMPO_BPM);
	});

	it('always stays within range', () => {
		expect(startTempo(LOCATE_NECK, [p('locate-neck', 'locate', 60, 1)])).toBe(80);
		expect(startTempo({ ...LOCATE_NECK, startTempoBpm: 300 }, [])).toBe(160);
	});
});

type Outcome = Pick<Attempt, 'phase' | 'correct' | 'verdict'>;

const hit: Outcome = { phase: 'review', correct: true, verdict: 'perfect' };
const miss: Outcome = { phase: 'review', correct: false, verdict: 'wrong' };

function session(hits: number, misses: number): Outcome[] {
	return [
		...Array.from({ length: hits }, () => hit),
		...Array.from({ length: misses }, () => miss)
	];
}

describe('nextTempo', () => {
	it('speeds up after a session above 90 %', () => {
		expect(nextTempo(80, session(19, 1))).toBe(85);
		expect(nextTempo(80, session(9, 1))).toBe(80);
	});

	it('slows down after a session under 70 %', () => {
		expect(nextTempo(100, session(6, 4))).toBe(95);
		expect(nextTempo(100, session(7, 3))).toBe(100);
	});

	it('stays within 80 and 160 bpm', () => {
		expect(nextTempo(80, session(5, 5))).toBe(80);
		expect(nextTempo(158, session(20, 0))).toBe(160);
		expect(nextTempo(160, session(20, 0))).toBe(160);
	});

	it('never moves a tempo set outside the range the wrong way', () => {
		expect(nextTempo(60, session(5, 5))).toBe(60);
		expect(nextTempo(60, session(20, 0))).toBe(80);
	});

	it('needs ten prompts, probes left out, off beat counted as a miss', () => {
		const probes = Array.from({ length: 10 }, () => ({ ...hit, phase: 'probe' as const }));
		expect(nextTempo(80, [...session(9, 0), ...probes])).toBe(80);
		const offbeat = Array.from({ length: 4 }, () => ({ ...hit, verdict: 'offbeat' as const }));
		expect(nextTempo(100, [...session(6, 0), ...offbeat])).toBe(95);
	});
});

describe('tempo range', () => {
	it('clamps and rounds', () => {
		expect([TEMPO_MIN_BPM, TEMPO_MAX_BPM]).toEqual([80, 160]);
		expect(clampTempo(79.6)).toBe(80);
	});
});
