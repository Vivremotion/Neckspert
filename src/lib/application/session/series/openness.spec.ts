import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import { describe, expect, it } from 'vitest';
import {
	presentationProblem,
	previewProblem,
	screenProblem,
	type PromptStageModel
} from '$lib/application/presentation';
import { ITEM_FIELDS } from '$lib/application/presentation/itemFields';
import { validateExercise, type ExerciseDefinition } from '$lib/domain/exercise';
import {
	Fraction,
	METER_4_4,
	ROUND_MODES,
	type Figure,
	type FigureElement
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import {
	BENCH_SENSORS,
	exerciseSeries,
	listItems,
	METER_3_4,
	mulberry32,
	playExercise,
	randomExercise,
	registerRandomSkills
} from '$lib/testing/randomExercise';

/**
 * The promise of the exercise language: an exercise that combines registered pieces plays on the
 * series without a line of code of its own, even one nobody wrote in the catalog.
 */

/** Written here only: the root of a chord on beat 2 of a 3/4 bar, then the chord at its position over two beats. */
const ROOT_THEN_CHORD: ExerciseDefinition = {
	id: 'root-then-chord',
	practices: 'chord-zone',
	view: 'lane',
	meter: METER_3_4,
	tempo: 72,
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
			{
				at: { beats: 0 },
				sensor: 'note',
				content: { family: 'note-places', of: 'root' },
				window: { ms: 100 }
			},
			{
				at: { beats: 1 },
				until: { beats: 3 },
				sensor: 'chord',
				content: { family: 'chord-shapes', where: [{ at: { item: 'fret' } }] },
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

/** One 4/4 bar of four quarter notes, C D E F on the B string (frets 1, 3, 5, 6). */
const C_D_E_F: Figure = {
	schema: 2,
	meter: METER_4_4,
	bars: 1,
	voices: [
		{
			id: 'main',
			elements: [60, 62, 64, 65].map((pitch): FigureElement => ({
				kind: 'note',
				duration: Fraction.of(1, 4),
				content: null,
				pitch,
				string: 2
			}))
		}
	]
};

/**
 * Written here only: a figure with written pitches, each note judged on its pitch by the
 * alignment, played after the prompt of a placed note (the bench's item, whatever it is).
 */
const PITCHED_FIGURE: ExerciseDefinition = {
	id: 'pitched-figure',
	practices: 'identify-note',
	view: 'lane',
	tempo: 80,
	presentation: { primary: { fr: 'joue après {fret}', en: 'play after {fret}' } },
	figures: [{ id: 'c-d-e-f', figure: C_D_E_F }],
	round: {
		prompt: { lead: { param: 'leadBeats' } },
		expectations: [
			{
				figure: { id: 'c-d-e-f' },
				at: { bars: 0 },
				sensor: 'note',
				content: { from: 'figure' },
				window: { ms: 80 }
			}
		],
		length: { bars: 1 },
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: { mode: 'alignment' }
		}
	},
	params: {
		ladder: [{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 } }]
	},
	items: ['1:3', '2:3', '3:3', '4:3', '5:3', '6:3']
};

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

// The skills without memory the draw practises beside the memory skills.
registerRandomSkills();

/** The definition a seed draws, its id naming the seed. */
const drawn = (seed: number) => randomExercise(mulberry32(seed), `random-${seed}`);

/** The presenters of the application, as the bench plays them. */
const BENCH_REGISTRIES = { presenters: SET_PRESENTERS, views: VIEW_PRESENTERS };

/** Why the engine or the screen cannot run `definition`, null when they can. */
function refusal(definition: ExerciseDefinition): string | null {
	return (
		validateExercise(definition, { sensors: BENCH_SENSORS }) ??
		presentationProblem(definition) ??
		screenProblem(definition, BENCH_REGISTRIES) ??
		previewProblem(definition, BENCH_REGISTRIES)
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
		expect(attempts.map((a) => [a.skill, a.success])).toEqual([
			['chord-zone', true],
			['chord-zone', true],
			['chord-zone', true]
		]);
		for (const attempt of attempts) {
			// The root on the target, the chord from the next beat over two beats, as written.
			expect(attempt.plan).toMatchObject({
				barOffset: '1/4',
				expectations: [
					{ at: '0', span: 'point', sensor: 'note', content: { kind: 'member' } },
					{ at: '1/4', span: { until: '3/4' }, sensor: 'chord', content: { kind: 'member' } }
				]
			});
		}
		for (const round of rounds) {
			expect(round.stage?.view).toBe('lane');
			const model = round.stage?.model as PromptStageModel;
			const fields = ITEM_FIELDS['voicing-on-strings'].fields(
				round.item.item,
				'fr',
				() => 0,
				ROOT_THEN_CHORD
			);
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

	it('plays a figure written with pitches, each note judged on its pitch by the alignment', async () => {
		expect(refusal(PITCHED_FIGURE)).toBeNull();
		const items: PlannedItem[] = listItems(PITCHED_FIGURE, mulberry32(11));
		for (const [answer, passed] of [
			['right', true],
			['none', false]
		] as const) {
			const bench = exerciseSeries(PITCHED_FIGURE, items);
			const rounds = await playExercise(bench, answer);
			const attempts = await bench.stored();
			expect(rounds, answer).toHaveLength(items.length);
			expect(
				attempts.map((attempt) => attempt.success),
				answer
			).toEqual(items.map(() => passed));
			for (const attempt of attempts) {
				// One expectation per note, each with the pitch the figure writes.
				expect(
					(attempt.plan as { expectations: { content: unknown }[] }).expectations.map(
						({ content }) => content
					)
				).toEqual([60, 62, 64, 65].map((midi) => ({ kind: 'pitch', value: { midi, string: 2 } })));
			}
		}
	});

	it('runs every exercise the validator accepts, drawn at random', async () => {
		const failures: string[] = [];
		let accepted = 0;
		let cycles = 0;
		for (const seed of SEEDS) {
			const definition = drawn(seed);
			if (refusal(definition) !== null) continue;
			accepted++;
			if (definition.round!.policy.unit === 'cycle') cycles++;
			for (const answer of ['right', 'wrong', 'none'] as const) {
				const items = listItems(definition, mulberry32(seed + 10_000));
				try {
					const bench = exerciseSeries(definition, items);
					const rounds = await playExercise(bench, answer);
					const attempts = await bench.stored();
					const successes = attempts.map((attempt) => attempt.success);
					// A right answer passes every round the engine can hear in time; a round whose
					// window opens only once listening has ended is a miss whatever is played. A
					// wrong answer fails every round, but one that asks for no content: any attack
					// answers it.
					const expected = rounds.map(
						(round) =>
							round.answerable &&
							(answer === 'right' ||
								(answer === 'wrong' && round.plan.expectations.every((e) => !e.content)))
					);
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
		// Rounds judged by cycle are played, not only refused.
		expect(cycles).toBeGreaterThan(0);
	});

	it('draws every value the round template allows', () => {
		const rounds = SEEDS.map((seed) => drawn(seed).round!);
		const drawnValues = (read: (round: (typeof rounds)[number]) => unknown[]) =>
			new Set(rounds.flatMap(read));
		expect(drawnValues((r) => [r.policy.pairing.mode])).toEqual(
			new Set(Object.keys(ROUND_MODES.pairings))
		);
		expect(drawnValues((r) => [r.policy.verdict])).toEqual(
			new Set(Object.keys(ROUND_MODES.verdicts))
		);
		expect(drawnValues((r) => [r.policy.unit])).toEqual(new Set(['response', 'cycle']));
		expect(
			drawnValues((r) => r.expectations.map((e) => ('role' in e && e.role) || 'target'))
		).toEqual(new Set(['target', 'judged-rest']));
		expect(drawnValues((r) => r.expectations.map((e) => e.content === null))).toEqual(
			new Set([true, false])
		);
		expect(rounds.some((r) => (r.mutedBars ?? []).length > 0)).toBe(true);
		// The alignment is played, not only refused.
		const aligned = SEEDS.map(drawn).filter(
			(d) => d.round!.policy.pairing.mode === 'alignment' && refusal(d) === null
		);
		expect(aligned.length).toBeGreaterThan(0);
		// Figure entries are drawn by every reference, and played, not only refused.
		const refs = rounds.flatMap((r) =>
			r.expectations.flatMap((e) => ('figure' in e ? Object.keys(e.figure) : []))
		);
		expect(new Set(refs)).toEqual(new Set(['id', 'param', 'item']));
		const figured = SEEDS.map(drawn).filter(
			(d) => d.round!.expectations.some((e) => 'figure' in e) && refusal(d) === null
		);
		expect(figured.length).toBeGreaterThan(0);
		// Figure entries asking for pitches are played, by the alignment among others.
		const pitched = figured.filter((d) =>
			d.round!.expectations.some((e) => 'figure' in e && e.content !== null)
		);
		// Seeds that qualify: a drop shows in the message (`PITCHED_FIGURE` pins the case itself).
		const pitchedAligned = pitched.filter((d) => d.round!.policy.pairing.mode === 'alignment');
		expect(
			pitchedAligned.length,
			`${pitchedAligned.length} of ${SEEDS.length} seeds draw an accepted figure with pitches judged by the alignment`
		).toBeGreaterThan(0);
		// Members of both families are asked, and played, not only refused.
		const families = new Set(
			SEEDS.map(drawn)
				.filter((d) => refusal(d) === null)
				.flatMap((d) =>
					d.round!.expectations.flatMap((e) =>
						!('figure' in e) && e.content && 'family' in e.content ? [e.content.family] : []
					)
				)
		);
		expect(families).toEqual(new Set(['note-places', 'chord-shapes']));
		// Zones are drawn with their first fret written, read in a param and read on the item, and
		// played, not only refused.
		const zoneEnds = SEEDS.map(drawn)
			.filter((d) => refusal(d) === null)
			.flatMap((d) =>
				d.round!.expectations.flatMap((e) =>
					!('figure' in e) && e.content && 'family' in e.content
						? (e.content.where ?? []).flatMap((filter) =>
								'in' in filter && Array.isArray(filter.in.frets)
									? [
											typeof filter.in.frets[0] === 'number'
												? 'written'
												: Object.keys(filter.in.frets[0])[0]
										]
									: []
							)
						: []
				)
			);
		expect(new Set(zoneEnds)).toEqual(new Set(['written', 'param', 'item']));
	});

	it('draws an exercise that writes a presentation and no view on the lane', async () => {
		const unnamed: ExerciseDefinition = { ...ROOT_THEN_CHORD, view: undefined };
		expect(refusal(unnamed)).toBeNull();
		const bench = exerciseSeries(unnamed, listItems(unnamed, mulberry32(7)));
		const rounds = await playExercise(bench, 'right');
		expect(rounds.map((round) => round.stage?.view)).toEqual(['lane', 'lane', 'lane']);
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
				/^(round|params|presentation|meter|tempo|flow|view|figures|items|writes a round|practices)/
			);
		}
	});
});
