import { DEFAULT_RESPONSE_WINDOWS } from '$lib/domain/exercise/windows';
import { describe, expect, it } from 'vitest';
import { gridChangePlan } from '$lib/domain/exercise/roundPlans';
import { gridById, gridChanges } from '$lib/domain/grid';
import { CHORD_GRID_CONTENT } from '$lib/domain/judges';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { METER_4_4 } from '$lib/domain/time/meter';
import { validateRoundPlan } from '$lib/domain/time/plan';
import { GESTURE_LINK } from './exercises';
import { gesturePlan } from './plans';

const IOHEFY = gridChanges(gridById('iohefy-a'));

const item: ChordGridItem = {
	rule: 'jam',
	element: 'jam:iohefy-a',
	passageId: 's:0',
	index: 1,
	changes: IOHEFY,
	symbol: IOHEFY[1].symbol,
	chord: 'D|min',
	sets: [[3, 2, 1]],
	previous: null
};

describe('gesturePlan', () => {
	it('plans a grid change as the grid relation timed it', () => {
		expect(IOHEFY[1].length).toBe(4);
		const plan = gesturePlan(item, METER_4_4, GESTURE_LINK);
		expect(plan).toEqual(
			gridChangePlan({
				content: { kind: CHORD_GRID_CONTENT, value: item },
				lengthBeats: 4,
				meter: METER_4_4,
				windows: DEFAULT_RESPONSE_WINDOWS
			})
		);
		expect(plan.prompt?.toString()).toBe('-1/4');
		expect(plan.handover?.toString()).toBe('1');
		expect(plan.expectations).toHaveLength(1);
		expect(plan.expectations[0]).toMatchObject({
			sensor: 'chord',
			content: { kind: 'chord-grid', value: item }
		});
		expect(validateRoundPlan(plan)).toBeNull();
	});

	it('takes the windows its exercise writes', () => {
		const definition = { ...GESTURE_LINK, params: { windows: { perfectMs: 90 } } };
		const plan = gesturePlan(item, METER_4_4, definition);
		expect(plan.expectations[0].window).toEqual({ ms: 90 });
	});
});
