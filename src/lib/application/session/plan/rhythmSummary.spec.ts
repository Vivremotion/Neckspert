import { describe, expect, it } from 'vitest';
import { RHYTHM_OFFBEATS } from '$lib/domain/exercise';
import type { LevelState } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import type { RhythmAttemptData } from './recordCycle';
import { summarizeRhythm } from './rhythmSummary';

function cycle(
	level: number,
	success: boolean,
	aids: Attempt['aids'] = ['cursor']
): Attempt<RhythmAttemptData> {
	return {
		sessionId: 's1',
		exerciseId: RHYTHM_OFFBEATS.id,
		mechanic: 'rhythm-figure',
		aids,
		success,
		data: { level }
	} as unknown as Attempt<RhythmAttemptData>;
}

function state(level: number): LevelState {
	return {
		exerciseId: RHYTHM_OFFBEATS.id,
		scope: '',
		item: '',
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
}

// The offbeats exercise has four regular levels (the rhythm stage says « sur 4 » for it).
const OF = 4;

describe('summarizeRhythm', () => {
	it('counts the cycles, those that succeeded, and the level held at the end', () => {
		const attempts = [cycle(0, true), cycle(0, false), cycle(1, true)];
		expect(summarizeRhythm({ exercise: RHYTHM_OFFBEATS, attempts, state: state(2) })).toEqual({
			exerciseId: RHYTHM_OFFBEATS.id,
			levelReached: { shown: 3, of: OF },
			cycles: 3,
			successes: 2,
			aided: 0
		});
	});

	it('counts as aided the successes that had an aid the level does not give', () => {
		// The cursor of a level that gives one and the aid level are the level itself.
		const attempts = [
			cycle(0, true, ['listen']),
			cycle(0, true, ['cursor', 'listen']),
			cycle(0, true, ['cursor']),
			cycle(0, false, ['listen'])
		];
		const summary = summarizeRhythm({ exercise: RHYTHM_OFFBEATS, attempts, state: state(0) });
		expect(summary.aided).toBe(2);
		expect(summary.successes).toBe(3);
		expect(summary.cycles).toBe(4);
	});

	it('reads the level the session itself ended on before the stored one, which a later session moves', () => {
		const summary = summarizeRhythm({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true)],
			levelReached: 1,
			state: state(3)
		});
		expect(summary.levelReached).toEqual({ shown: 2, of: OF });
	});

	it('falls back on the level of the last cycle when no level is stored', () => {
		const summary = summarizeRhythm({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true), cycle(1, true)],
			state: undefined
		});
		expect(summary.levelReached).toEqual({ shown: 2, of: OF });
	});

	it('shows the first level for a session with no cycle and nothing stored', () => {
		const summary = summarizeRhythm({ exercise: RHYTHM_OFFBEATS, attempts: [], state: undefined });
		expect(summary).toMatchObject({ levelReached: { shown: 1, of: OF }, cycles: 0, successes: 0 });
	});

	it('leaves out the attempts of another exercise', () => {
		const other = { ...cycle(0, true), exerciseId: 'rhythm-two-four' };
		const summary = summarizeRhythm({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true), other],
			state: state(0)
		});
		expect(summary.cycles).toBe(1);
	});
});
