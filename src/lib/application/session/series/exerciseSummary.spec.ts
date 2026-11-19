import { describe, expect, it } from 'vitest';
import type { LevelState } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import type { FigureAttemptData } from '../series/recordResponse';
import { aidedBeyondItsLevel, summarizeExercise } from './exerciseSummary';
import { RHYTHM_OFFBEATS } from '$lib/testing/catalog';

function cycle(
	level: number,
	success: boolean,
	aids: Attempt['aids'] = ['cursor']
): Attempt<FigureAttemptData> {
	return {
		sessionId: 's1',
		exerciseId: RHYTHM_OFFBEATS.id,
		skill: 'inner-pulse',
		aids,
		success,
		data: { level }
	} as unknown as Attempt<FigureAttemptData>;
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

describe('summarizeExercise and aidedBeyondItsLevel', () => {
	it('tells the level held at the end', () => {
		const attempts = [cycle(0, true), cycle(0, false), cycle(1, true)];
		expect(summarizeExercise({ exercise: RHYTHM_OFFBEATS, attempts, state: state(2) })).toEqual({
			level: { shown: 3, of: OF, aid: false }
		});
	});

	it('counts as aided a round that had an aid its level does not give', () => {
		// The cursor of a level that gives one and the aid level are the level itself.
		const aided = aidedBeyondItsLevel((id) =>
			id === RHYTHM_OFFBEATS.id ? RHYTHM_OFFBEATS : undefined
		);
		expect(
			[
				cycle(0, true, ['listen']),
				cycle(0, true, ['cursor', 'listen']),
				cycle(0, true, ['cursor']),
				cycle(0, true, ['aid-level']),
				cycle(0, true, [])
			].map(aided)
		).toEqual([true, true, false, false, false]);
		// An exercise no file defines: its levels are unknown, the cursor counts as an aid.
		const gone = { ...cycle(0, true, ['cursor']), exerciseId: 'gone' } as Attempt;
		expect(aided(gone)).toBe(true);
		expect(aided({ ...gone, aids: ['aid-level'] })).toBe(false);
	});

	it('reads the level the session itself ended on before the stored one, which a later session moves', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true)],
			levelReached: 1,
			state: state(3)
		});
		expect(summary.level).toEqual({ shown: 2, of: OF, aid: false });
	});

	it('says when the level held is an aid level', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(-1, true)],
			levelReached: -1,
			state: state(-1)
		});
		expect(summary.level).toEqual({ shown: 0, of: OF, aid: true });
	});

	it('falls back on the level of the last cycle when no level is stored', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true), cycle(1, true)],
			state: undefined
		});
		expect(summary.level).toEqual({ shown: 2, of: OF, aid: false });
	});

	it('shows the first level for a session with no cycle and nothing stored', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [],
			state: undefined
		});
		expect(summary).toEqual({ level: { shown: 1, of: OF, aid: false } });
	});

	it('reads the level of its own last cycle, never another exercise’s', () => {
		const other = { ...cycle(3, true), exerciseId: 'rhythm-two-four' };
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(1, true), other],
			state: undefined
		});
		expect(summary.level).toEqual({ shown: 2, of: OF, aid: false });
	});

	it('engraves the last cycle from the figure its item names, over the bars its plan kept', () => {
		const [, two] = RHYTHM_OFFBEATS.figures ?? [];
		const last = {
			...cycle(2, true),
			tempoBpm: 90,
			verdict: { relation: 'cycle', version: 1, value: { passed: true } },
			plan: { length: '2', tempo: { at: '0', bpm: 90, unit: '1/4' } },
			data: {
				item: { figureId: two.id, level: 2 },
				level: 2,
				report: { expectations: [], extra: 0 }
			}
		} as unknown as Attempt<FigureAttemptData>;
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [last],
			state: state(2)
		});
		expect(summary.lastCycle?.played).toEqual({ figure: two.figure, cycleBars: 2, tempoBpm: 90 });
		const unreadable = { ...last, plan: null } as unknown as Attempt<FigureAttemptData>;
		expect(
			summarizeExercise({ exercise: RHYTHM_OFFBEATS, attempts: [unreadable], state: state(2) })
				.lastCycle
		).not.toHaveProperty('played');
	});
});
