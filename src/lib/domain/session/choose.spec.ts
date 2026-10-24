import { describe, expect, it } from 'vitest';
import { createListSource } from '$lib/domain/progress/selector';
import type { ExerciseId } from '$lib/domain/exercise/types';
import { choose } from './choose';

describe('choose', () => {
	it('chooses the one candidate of a session, and none from none', () => {
		const candidate = { exerciseId: 'locate-neck' as ExerciseId, source: createListSource([]) };
		expect(choose([candidate])).toBe(candidate);
		expect(choose([])).toBeNull();
	});
});
