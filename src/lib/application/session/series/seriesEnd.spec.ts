import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPO } from '$lib/domain/exercise';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { Attempt, Execution } from '$lib/domain/types';
import { nextProgressions } from './seriesEnd';

function attempt(scope: string | undefined, success: boolean): Attempt {
	return {
		exerciseId: 'grid',
		mechanic: 'fake-grid',
		phase: 'free',
		success,
		...(scope !== undefined && { tempoScope: scope })
	} as Attempt;
}

const definitionOf = (id: string): ExerciseDefinition => ({
	id,
	version: 1,
	mechanic: 'fake-grid',
	params: {},
	...(id === 'fixed' && { tempo: { fixed: 80 } })
});

const won = (scope: string | undefined) =>
	Array.from({ length: DEFAULT_TEMPO.minPrompts }, () => attempt(scope, true));

describe('nextProgressions', () => {
	it('moves each scope on its own attempts only', () => {
		const executions: Execution[] = [
			{ exerciseId: 'grid', scope: 'a', tempoBpm: 100 },
			{ exerciseId: 'grid', scope: 'b', tempoBpm: 90 }
		];
		expect(nextProgressions(executions, won('a'), 7, definitionOf)).toEqual([
			{
				exerciseId: 'grid',
				scope: 'a',
				mechanic: 'fake-grid',
				tempoBpm: 100 + DEFAULT_TEMPO.step,
				updatedAt: 7
			}
		]);
	});

	it('leaves out executions without a tempo or without enough attempts', () => {
		const executions: Execution[] = [
			{ exerciseId: 'grid', tempoBpm: null },
			{ exerciseId: 'other', tempoBpm: 100 }
		];
		expect(nextProgressions(executions, won(undefined), 7, definitionOf)).toEqual([]);
	});

	it('writes no progression for an exercise at a fixed tempo', () => {
		const attempts = won(undefined).map((a) => ({ ...a, exerciseId: 'fixed' }) as Attempt);
		const executions: Execution[] = [{ exerciseId: 'fixed', tempoBpm: 80 }];
		expect(nextProgressions(executions, attempts, 7, definitionOf)).toEqual([]);
	});
});
