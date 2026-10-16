import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import { LOCATE_NECK } from './catalog';
import {
	DEFAULT_TEMPO_BPM,
	TEMPO_LOWER_AT,
	TEMPO_MAX_BPM,
	TEMPO_MIN_BPM,
	TEMPO_MIN_PROMPTS,
	TEMPO_RAISE_AT,
	TEMPO_STEP_BPM,
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

type Outcome = Pick<Attempt, 'phase' | 'success'>;

const hit: Outcome = { phase: 'review', success: true };
const miss: Outcome = { phase: 'review', success: false };

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
		// Off the beat is stored as no success.
		const offbeat = Array.from({ length: 4 }, () => ({ ...hit, success: false }));
		expect(nextTempo(100, [...session(6, 0), ...offbeat])).toBe(95);
	});
});

describe('tempo range', () => {
	it('clamps and rounds', () => {
		expect([TEMPO_MIN_BPM, TEMPO_MAX_BPM]).toEqual([80, 160]);
		expect(clampTempo(79.6)).toBe(80);
		expect(clampTempo(60)).toBe(80);
		expect(clampTempo(200)).toBe(160);
	});

	it('moves 5 bpm, above 90 % or under 70 %, after ten prompts', () => {
		expect(TEMPO_STEP_BPM).toBe(5);
		expect([TEMPO_RAISE_AT, TEMPO_LOWER_AT, TEMPO_MIN_PROMPTS]).toEqual([0.9, 0.7, 10]);
	});
});

describe('startTempo within a scope', () => {
	const CLIMB = { ...LOCATE_NECK, id: 'gesture-climb', mechanic: 'chord-grid', startTempoBpm: 80 };
	const scoped = (scope: string, tempoBpm: number) => ({
		...p('gesture-climb', 'chord-grid', tempoBpm, 1),
		scope
	});

	it('takes the progression of its own exercise and scope', () => {
		const progressions = [scoped('iohefy-a', 95), scoped('blues-f', 110)];
		expect(startTempo(CLIMB, progressions, 'iohefy-a')).toBe(95);
		expect(startTempo(CLIMB, progressions, 'blues-f')).toBe(110);
	});

	it('starts a new scope at the exercise own start tempo, never at another scope tempo', () => {
		expect(startTempo(CLIMB, [scoped('iohefy-a', 95)], 'blues-f')).toBe(80);
	});

	it('keeps a tempo without scope apart from the scoped ones', () => {
		expect(startTempo(CLIMB, [scoped('iohefy-a', 95)])).toBe(80);
		expect(startTempo(LOCATE_NECK, [p('locate-neck', 'locate', 100, 1)], 'x')).toBe(80);
	});
});
