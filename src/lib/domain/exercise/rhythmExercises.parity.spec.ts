import { describe, expect, it } from 'vitest';
import type { FigureItem } from '$lib/domain/sets';
import { METER_4_4, type RoundPlan } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { compileRound, figureItemsAt } from './round';
import { RHYTHM_EXERCISES } from '$lib/testing/catalog';

/*
 * The plans the three rhythm exercises compile, frozen when the cycle compiler they replaced was
 * deleted (plan S, task 5): they matched it for every level, figure and start bar. A change here
 * is a change of what the rhythm asks of the player. Since their aid levels became their level 1
 * (issue #19, D12), each level is read by its place in the list: the plans are the same as
 * before, each at its former index + 1.
 */

/** The index of the level the first round of a run is frozen at: the former level 1. */
const FIRST_ROUND_LEVEL = 1;

function item(exerciseId: string, figureId: string, level: number): PlannedItem<FigureItem> {
	return {
		exerciseId,
		skill: RHYTHM_EXERCISES.find((exercise) => exercise.id === exerciseId)!.practices,
		exerciseLevel: level,
		item: { figureId, level },
		phase: 'free',
		temperature: 'hot',
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
		listenUntil: plan.listenUntil?.toString() ?? null,
		barOffset: plan.barOffset?.toString() ?? null,
		countEndsOn: plan.countEndsOn ?? null,
		policy: plan.policy,
		every: [...shapes],
		expectations: plan.expectations.map((e) => `${e.at?.toString() ?? 'free'}:${e.bar}`).join(' ')
	};
}

describe('the plans of the rhythm exercises', () => {
	for (const exercise of RHYTHM_EXERCISES) {
		const count = exercise.levels?.length ?? 0;
		for (let level = 0; level < count; level++) {
			it(`${exercise.id} at level ${level} compiles as it always has`, () => {
				const plans: Record<string, unknown> = {};
				const figures = figureItemsAt(exercise, level, METER_4_4) ?? [];
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
		it(`${exercise.id} compiles the first round of a run, its place not known yet`, () => {
			const [{ id }] = figureItemsAt(exercise, FIRST_ROUND_LEVEL, METER_4_4) ?? [];
			expect(
				describePlan(
					compileRound(exercise, item(exercise.id, id, FIRST_ROUND_LEVEL), METER_4_4, {
						previewBeats: 0,
						fromRunStart: null
					})
				)
			).toMatchSnapshot();
		});
	}
});
