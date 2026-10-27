import { describe, expect, it } from 'vitest';
import {
	presentationProblem,
	previewProblem,
	screenProblem,
	type PromptStageModel
} from '$lib/application/presentation';
import { ITEM_FIELDS } from '$lib/application/presentation/itemFields';
import { validateExercise, type ExerciseDefinition } from '$lib/domain/exercise';
import type { PlannedItem } from '$lib/domain/types';
import {
	BENCH_PRESENTERS,
	BENCH_SENSORS,
	exerciseSeries,
	listItems,
	METER_3_4,
	mulberry32,
	playExercise,
	randomExercise
} from '$lib/testing/randomExercise';

/**
 * The promise of the exercise language: an exercise that combines registered pieces plays on the
 * series without a line of code of its own, even one nobody wrote in the catalog.
 */

/** Written here only: the root of a chord on beat 2 of a 3/4 bar, then the chord at its position over two beats. */
const ROOT_THEN_CHORD: ExerciseDefinition = {
	id: 'root-then-chord',
	version: 1,
	mechanic: 'triad-zone',
	view: 'lane',
	meter: METER_3_4,
	tempo: { fixed: 72 },
	presentation: {
		primary: { fr: 'racine de {chord}', en: 'root of {chord}' },
		secondary: '{around}',
		detail: '{strings}',
		target: '{root}',
		band: { fr: '{chord} en entier', en: 'all of {chord}' }
	},
	round: {
		prompt: { lead: { param: 'leadBeats' } },
		expectations: [
			{ at: { beats: 0 }, sensor: 'note', content: { from: 'voicing-root' }, window: { ms: 100 } },
			{
				at: { beats: 1 },
				until: { beats: 3 },
				sensor: 'chord',
				content: { from: 'voicing-at-position' },
				window: { ms: 100 }
			}
		],
		length: { bars: 1, breath: true },
		barOffset: '1/4',
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { afterPromptMs: 100 },
				lateMs: 150,
				lateCapture: null
			}
		}
	},
	params: {
		ladder: [{ params: { leadBeats: 3, aided: false }, pass: { successes: 1 } }]
	}
};

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

/** The definition a seed draws, its id naming the seed. */
const drawn = (seed: number) => randomExercise(mulberry32(seed), `random-${seed}`);

/** Why the engine or the screen cannot run `definition`, null when they can. */
function refusal(definition: ExerciseDefinition): string | null {
	return (
		validateExercise(definition, { sensors: BENCH_SENSORS }) ??
		presentationProblem(definition) ??
		screenProblem(definition, BENCH_PRESENTERS) ??
		previewProblem(definition, BENCH_PRESENTERS)
	);
}

describe('every valid exercise plays', () => {
	it('plays an exercise written only in this test: the root of a chord on beat 2 of a 3/4 bar, then the chord at its position over two beats', async () => {
		expect(refusal(ROOT_THEN_CHORD)).toBeNull();
		const items: PlannedItem[] = listItems(ROOT_THEN_CHORD, mulberry32(7));
		const bench = exerciseSeries(ROOT_THEN_CHORD, items);
		const rounds = await playExercise(bench, 'right');
		const attempts = await bench.stored();

		expect(rounds).toHaveLength(3);
		expect(attempts.map((a) => [a.mechanic, a.success])).toEqual([
			['triad-zone', true],
			['triad-zone', true],
			['triad-zone', true]
		]);
		for (const attempt of attempts) {
			// The root on the target, the chord from the next beat over two beats, as written.
			expect(attempt.plan).toMatchObject({
				barOffset: '1/4',
				expectations: [
					{ at: '0', span: 'point', sensor: 'note', content: { kind: 'note' } },
					{ at: '1/4', span: { until: '3/4' }, sensor: 'chord', content: { kind: 'chord-voicing' } }
				]
			});
		}
		for (const round of rounds) {
			expect(round.stage?.view).toBe('lane');
			const model = round.stage?.model as PromptStageModel;
			const fields = ITEM_FIELDS['triad-zone'].fields(round.item.item, 'fr', () => 0);
			expect(model.prompt).toMatchObject({
				primary: `racine de ${fields.chord}`,
				secondary: fields.around,
				detail: fields.strings,
				target: fields.root,
				band: `${fields.chord} en entier`
			});
			// The target on beat 2 of its bar, the chord's band over beats 3 and 1.
			const anchor = model.anchorBeat as number;
			expect(anchor % 3).toBe(1);
			expect(model.bands).toEqual([{ fromBeat: anchor + 1, untilBeat: anchor + 3 }]);
		}
	});

	it('runs every exercise the validator accepts, drawn at random', async () => {
		const failures: string[] = [];
		let accepted = 0;
		for (const seed of SEEDS) {
			const definition = drawn(seed);
			if (refusal(definition) !== null) continue;
			accepted++;
			for (const answer of ['right', 'none'] as const) {
				const items = listItems(definition, mulberry32(seed + 10_000));
				try {
					const bench = exerciseSeries(definition, items);
					const rounds = await playExercise(bench, answer);
					const attempts = await bench.stored();
					const successes = attempts.map((attempt) => attempt.success);
					// A right answer passes every round the engine can hear in time; a round whose
					// window opens only once listening has ended is a miss whatever is played.
					const expected = rounds.map((round) => answer === 'right' && round.answerable);
					if (
						rounds.length !== items.length ||
						JSON.stringify(successes) !== JSON.stringify(expected)
					) {
						failures.push(
							`seed ${seed} (${answer}): ${rounds.length} rounds, successes ${JSON.stringify(successes)}`
						);
					}
				} catch (error) {
					failures.push(`seed ${seed} (${answer}): ${(error as Error).stack ?? error}`);
				}
			}
		}
		expect(failures).toEqual([]);
		// The draw never empties without a sound.
		expect(accepted).toBeGreaterThanOrEqual(50);
	});

	it('names the exercise and the field of every definition it refuses', () => {
		const refusals = SEEDS.flatMap((seed) => {
			const problem = refusal(drawn(seed));
			return problem === null ? [] : [{ seed, problem }];
		});
		expect(refusals.length).toBeGreaterThan(0);
		for (const { seed, problem } of refusals) {
			expect(problem.startsWith(`random-${seed}: `), problem).toBe(true);
			// A field follows the name: a path of the definition.
			expect(problem.slice(`random-${seed}: `.length), problem).toMatch(
				/^(round|params|presentation|meter|tempo|flow|writes a round)/
			);
		}
	});
});
