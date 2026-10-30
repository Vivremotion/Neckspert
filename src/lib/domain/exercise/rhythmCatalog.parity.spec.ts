import { describe, expect, it } from 'vitest';
import type { RhythmItem } from '$lib/domain/mechanics';
import { levelRange, METER_4_4, type LevelParams, type RoundPlan } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { resolvedParamsOf } from './levels';
import { compileRound } from './round';
import { eligibleFigures, RHYTHM_EXERCISES } from './rhythmCatalog';

/*
 * The plans the three rhythm exercises compile, frozen when the cycle compiler they replaced was
 * deleted (plan S, task 5): they matched it for every level, figure and start bar. A change here
 * is a change of what the rhythm asks of the player.
 */

function item(exerciseId: string, figureId: string, level: number): PlannedItem<RhythmItem> {
	return {
		exerciseId,
		mechanic: 'rhythm-figure',
		exerciseLevel: level,
		item: { figureId, level },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	};
}

/** A plan as readable text: fractions as `n/d`, one `at:bar` per expectation, the rest once. */
function describePlan(plan: RoundPlan) {
	const shapes = new Set(
		plan.expectations.map((e) =>
			JSON.stringify({
				span: e.span,
				role: e.role,
				sensor: e.sensor,
				content: e.content,
				window: e.window
			})
		)
	);
	return {
		prompt: plan.prompt?.toString() ?? null,
		length: plan.length.toString(),
		handover: plan.handover?.toString() ?? null,
		mutedBars: plan.mutedBars,
		policy: plan.policy,
		every: [...shapes],
		expectations: plan.expectations.map((e) => `${e.at?.toString() ?? 'free'}:${e.bar}`).join(' ')
	};
}

describe('the plans of the rhythm exercises', () => {
	for (const exercise of RHYTHM_EXERCISES) {
		const { lowest, highest } = levelRange(exercise.levels ?? []);
		for (let level = lowest; level <= highest; level++) {
			it(`${exercise.id} at level ${level} compiles as it always has`, () => {
				const plans: Record<string, unknown> = {};
				const params = resolvedParamsOf(exercise, { exerciseLevel: level, itemLevel: null });
				const figures = eligibleFigures(exercise, params as unknown as LevelParams);
				expect(figures.length).toBeGreaterThan(0);
				for (const { id } of figures) {
					for (const fromRunStart of [0, 1, 2, 3]) {
						plans[`${id} from bar ${fromRunStart}`] = describePlan(
							compileRound(exercise, item(exercise.id, id, level), METER_4_4, {
								previewBeats: 0,
								fromRunStart
							})
						);
					}
				}
				expect(plans).toMatchSnapshot();
			});
		}
	}
});
