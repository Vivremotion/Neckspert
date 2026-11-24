import { describe, expect, it } from 'vitest';
import type { LevelState } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import type { FigureAttemptData } from '../series/recordResponse';
import { summarizeExercise } from './exerciseSummary';
import { RHYTHM_OFFBEATS } from '$lib/testing/catalog';

function cycle(level: number, success: boolean): Attempt<FigureAttemptData> {
	return {
		sessionId: 's1',
		exerciseId: RHYTHM_OFFBEATS.id,
		skill: 'inner-pulse',
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

// The offbeats exercise has five levels (the rhythm stage says « sur 5 » for it).
const OF = 5;

describe('summarizeExercise', () => {
	it('tells the level held at the end', () => {
		const attempts = [cycle(0, true), cycle(0, false), cycle(1, true)];
		expect(summarizeExercise({ exercise: RHYTHM_OFFBEATS, attempts, state: state(2) })).toEqual({
			level: { shown: 3, of: OF }
		});
	});

	it('reads the level the session itself ended on before the stored one, which a later session moves', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true)],
			levelReached: 1,
			state: state(3)
		});
		expect(summary.level).toEqual({ shown: 2, of: OF });
	});

	it('brings a level outside the levels back into them: below the first, above the top', () => {
		const at = (level: number) =>
			summarizeExercise({
				exercise: RHYTHM_OFFBEATS,
				attempts: [cycle(level, true)],
				levelReached: level,
				state: state(level)
			}).level;
		expect(at(-1)).toEqual({ shown: 1, of: OF });
		expect(at(99)).toEqual({ shown: OF, of: OF });
	});

	it('falls back on the level of the last cycle when no level is stored', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(0, true), cycle(1, true)],
			state: undefined
		});
		expect(summary.level).toEqual({ shown: 2, of: OF });
	});

	it('shows the first level for a session with no cycle and nothing stored', () => {
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [],
			state: undefined
		});
		expect(summary).toEqual({ level: { shown: 1, of: OF } });
	});

	it('reads the level of its own last cycle, never another exercise’s', () => {
		const other = { ...cycle(3, true), exerciseId: 'rhythm-two-four' };
		const summary = summarizeExercise({
			exercise: RHYTHM_OFFBEATS,
			attempts: [cycle(1, true), other],
			state: undefined
		});
		expect(summary.level).toEqual({ shown: 2, of: OF });
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
