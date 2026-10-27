import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import { LOCATE_NECK as LOCATE_AT_80 } from './catalog';
import {
	DEFAULT_TEMPO,
	DEFAULT_TEMPO_BPM,
	clampTempo,
	nextTempo,
	startTempo,
	exerciseTempoOf
} from './tempo';

// Locate plays a fixed tempo; these cases are about an exercise that gives none.
const { tempo: _fixed, ...LOCATE_NECK } = LOCATE_AT_80;

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

	it('takes a written tempo over startTempoBpm', () => {
		const both = { ...LOCATE_NECK, startTempoBpm: 120 };
		expect(startTempo({ ...both, tempo: { fixed: 90 } }, [])).toBe(90);
		const range = { ...DEFAULT_TEMPO, start: 100 };
		expect(startTempo({ ...both, tempo: range }, [])).toBe(100);
		expect(exerciseTempoOf({ ...both, tempo: range })).toEqual(range);
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
		expect(nextTempo(LOCATE_NECK, 80, session(19, 1))).toBe(85);
		expect(nextTempo(LOCATE_NECK, 80, session(9, 1))).toBe(80);
	});

	it('slows down after a session under 70 %', () => {
		expect(nextTempo(LOCATE_NECK, 100, session(6, 4))).toBe(95);
		expect(nextTempo(LOCATE_NECK, 100, session(7, 3))).toBe(100);
	});

	it('stays within 80 and 160 bpm', () => {
		expect(nextTempo(LOCATE_NECK, 80, session(5, 5))).toBe(80);
		expect(nextTempo(LOCATE_NECK, 158, session(20, 0))).toBe(160);
		expect(nextTempo(LOCATE_NECK, 160, session(20, 0))).toBe(160);
	});

	it('never moves a tempo set outside the range the wrong way', () => {
		expect(nextTempo(LOCATE_NECK, 60, session(5, 5))).toBe(60);
		expect(nextTempo(LOCATE_NECK, 60, session(20, 0))).toBe(80);
	});

	it('needs ten prompts, probes left out, off beat counted as a miss', () => {
		const probes = Array.from({ length: 10 }, () => ({ ...hit, phase: 'probe' as const }));
		expect(nextTempo(LOCATE_NECK, 80, [...session(9, 0), ...probes])).toBe(80);
		// Off the beat is stored as no success.
		const offbeat = Array.from({ length: 4 }, () => ({ ...hit, success: false }));
		expect(nextTempo(LOCATE_NECK, 100, [...session(6, 0), ...offbeat])).toBe(95);
	});
});

describe('tempo range', () => {
	it("keeps today's range and steps when an exercise gives none", () => {
		expect(DEFAULT_TEMPO).toEqual({
			start: 80,
			min: 80,
			max: 160,
			step: 5,
			raiseAt: 0.9,
			lowerAt: 0.7,
			minPrompts: 10
		});
		expect(exerciseTempoOf(LOCATE_NECK)).toEqual(DEFAULT_TEMPO);
		expect(exerciseTempoOf({ ...LOCATE_NECK, startTempoBpm: 120 })).toEqual({
			...DEFAULT_TEMPO,
			start: 120
		});
		expect(clampTempo(LOCATE_NECK, 60)).toBe(80);
		expect(clampTempo(LOCATE_NECK, 200)).toBe(160);
		expect(nextTempo(LOCATE_NECK, 80, session(19, 1))).toBe(85);
	});

	it("moves within the exercise's own range and step, decimals kept", () => {
		const own = {
			...LOCATE_NECK,
			tempo: {
				start: 92.5,
				min: 90,
				max: 100,
				step: 2.5,
				raiseAt: 0.8,
				lowerAt: 0.5,
				minPrompts: 4
			}
		};
		expect(startTempo(own, [])).toBe(92.5);
		expect(nextTempo(own, 92.5, session(4, 0))).toBe(95);
		expect(nextTempo(own, 92.5, session(1, 3))).toBe(90);
		expect(nextTempo(own, 98.5, session(4, 0))).toBe(100);
		expect(nextTempo(own, 92.5, session(3, 0))).toBe(92.5);
		expect(clampTempo(own, 79.6)).toBe(90);
		expect(clampTempo(own, 95.3)).toBe(95.3);
	});

	it('plays a fixed tempo whatever was stored, and never moves it', () => {
		const fixed = { ...LOCATE_NECK, tempo: { fixed: 80 } };
		expect(startTempo(fixed, [p('locate-neck', 'locate', 120, 1)])).toBe(80);
		expect(startTempo(fixed, [p('other', 'locate', 120, 1)])).toBe(80);
		expect(nextTempo(fixed, 80, session(20, 0))).toBe(80);
		expect(nextTempo(fixed, 80, session(0, 20))).toBe(80);
		expect(clampTempo(fixed, 200)).toBe(80);
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
