import { describe, expect, it } from 'vitest';
import { TEMPO_MIN_PROMPTS, TEMPO_STEP_BPM } from '$lib/domain/exercise';
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

const won = (scope: string | undefined) =>
	Array.from({ length: TEMPO_MIN_PROMPTS }, () => attempt(scope, true));

describe('nextProgressions', () => {
	it('moves each scope on its own attempts only', () => {
		const executions: Execution[] = [
			{ exerciseId: 'grid', scope: 'a', tempoBpm: 100 },
			{ exerciseId: 'grid', scope: 'b', tempoBpm: 90 }
		];
		expect(nextProgressions(executions, won('a'), 7)).toEqual([
			{
				exerciseId: 'grid',
				scope: 'a',
				mechanic: 'fake-grid',
				tempoBpm: 100 + TEMPO_STEP_BPM,
				updatedAt: 7
			}
		]);
	});

	it('leaves out executions without a tempo or without enough attempts', () => {
		const executions: Execution[] = [
			{ exerciseId: 'grid', tempoBpm: null },
			{ exerciseId: 'other', tempoBpm: 100 }
		];
		expect(nextProgressions(executions, won(undefined), 7)).toEqual([]);
	});
});
