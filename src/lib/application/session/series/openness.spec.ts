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
import { aloneSourceOf, registerExercise } from '$lib/domain/exercise/registry';
import { registerRoutine, type RoutineDefinition } from '$lib/domain/routine';
import { TRIAD_ORDER } from '$lib/testing/catalog';
import {
	BENCH_GRIDS,
	BENCH_PASSAGE_SKILLS,
	acquiredTriads,
	BENCH_SENSORS,
	benchRefusal,
	benchRoutineRefusal,
	exerciseSeries,
	listItems,
	METER_3_4,
	mulberry32,
	playExercise,
	playService,
	randomExercise,
	randomPassagesExercise,
	randomRoutine,
	registerRandomSkills,
	serviceBench,
	SET_OF_PASSAGE_FAMILY,
	VERDICT_EXCUSES,
	type VerdictExcuse,
	type ServiceBench,
	type ServicePlay
} from '$lib/testing/randomExercise';
import type { PlaySessionController } from '$lib/application/session/contract';
import {
	CHORD_ANCHOR_SKILL_ID,
	CHORD_ZONE_SKILL_ID,
	LOCATE_NECK_ID,
	RHYTHM_SILENT_BARS_ID
} from '$lib/testing/catalogIds';
import { skillById } from '$lib/domain/skill/registry';
import { createPassageSource } from '$lib/domain/session/passageSource';
import { SESSION_MS } from '$lib/domain/session/policy';

/**
 * The promise of the exercise language: an exercise that combines registered pieces plays on the
 * series without a line of code of its own, even one nobody wrote in the catalog.
 */

/** Written here only: the root of a chord on beat 2 of a 3/4 bar, then the chord at its position over two beats. */
const ROOT_THEN_CHORD: ExerciseDefinition = {
	id: 'root-then-chord',
	practices: CHORD_ZONE_SKILL_ID,
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

/**
 * Written here only: a grid read change after change on G-B-E, a passage of the blues' changes,
 * a bar of silence before each passage that follows another.
 */
const READ_A_GRID: ExerciseDefinition = {
	id: 'read-a-grid',
	practices: BENCH_PASSAGE_SKILLS.change[0],
	view: 'grid-scroll',
	tempo: 100,
	presentation: { primary: '{symbol}', secondary: '{title}', aided: { picture: 'admitted' } },
	round: {
		prompt: { lead: 1 },
		expectations: [
			{
				at: { beats: 0 },
				sensor: 'chord',
				content: { family: 'chord-shapes' },
				window: { ms: { param: 'windows.perfectMs' } }
			}
		],
		length: { beats: { item: 'change-beats' } },
		handover: 'end',
		countEndsOn: 'target',
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: {
					beforeMs: { param: 'windows.gridEarlyMs' },
					maxBeats: { param: 'windows.gridEarlyMaxBeats' }
				},
				lateMs: { param: 'windows.lateMs' },
				lateCapture: 'to-end'
			}
		}
	},
	params: { strings: [3, 2, 1] },
	passages: { of: { grid: [BENCH_GRIDS[1]] }, members: { family: 'grid-changes' }, restBars: 1 }
};

/** The same, blocking as its anti-blocking says: an aid level under its level, three misses each. */
const READ_A_GRID_BLOCKING: ExerciseDefinition = {
	...READ_A_GRID,
	id: 'read-a-grid-blocking',
	practices: BENCH_PASSAGE_SKILLS.change[1],
	levels: [
		{ aid: true, params: { tempo: 100 } },
		{ params: { tempo: 100 }, pass: { successes: 10 }, drop: { failures: 3 } }
	],
	flow: { antiBlocking: true }
};

/**
 * Written here only: the shapes of D and of Am on G-B-E climbed by position, three of them and
 * back, a bar each, the passage played again until it passes.
 */
const CLIMB_SHAPES: ExerciseDefinition = {
	id: 'climb-shapes',
	practices: BENCH_PASSAGE_SKILLS['placed-voicing'][0],
	view: 'link-lane',
	tempo: 90,
	presentation: { primary: '{chord}', detail: '{strings}', target: '{chord}' },
	round: { ...READ_A_GRID.round!, length: { bars: 1 } },
	params: {},
	passages: {
		of: { chord: ['D', 'Am'], strings: [[3, 2, 1]] },
		members: { family: 'chord-shapes', order: ['position'], take: 3, andBack: true },
		again: 'until-passed'
	}
};

/** `ROOT_THEN_CHORD` as a memory exercise: its items listed, the shape asked at random. */
const ROOT_THEN_CHORD_LISTED: ExerciseDefinition = {
	...ROOT_THEN_CHORD,
	id: 'root-then-chord-listed',
	params: { ...ROOT_THEN_CHORD.params, learning: { asks: { family: 'chord-shapes' } } },
	items: TRIAD_ORDER.slice(0, 4)
};

/** Written here only: a routine of two memory exercises, in two meters. */
const TWO_MEMORY_EXERCISES: RoutineDefinition = {
	id: 'two-memory-exercises',
	title: { fr: 'Deux exercices de mémoire', en: 'Two memory exercises' },
	exercises: [ROOT_THEN_CHORD_LISTED.id, PITCHED_FIGURE.id]
};

/** Written here only: a routine of two passages exercises, on two sets. */
const TWO_PASSAGES_EXERCISES: RoutineDefinition = {
	id: 'two-passages-exercises',
	title: { fr: 'Deux exercices de passages', en: 'Two passages exercises' },
	exercises: [READ_A_GRID.id, CLIMB_SHAPES.id],
	opens: { acquired: { skill: CHORD_ANCHOR_SKILL_ID, atLeast: 1 } }
};

const PASSAGE_SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);
/** How long a drawn session is played right: past its first passages, cut before its end. */
const RIGHT_PLAY_S = 60;
/** How long a drawn session is played with nothing: past its length, so it ends by itself. */
const NONE_PLAY_S = (SESSION_MS * 1.4) / 1000;
// Floors and ceilings at about 80 % and 125 % of what the seeds give today (the counts are in
// `task-5-report.md`): a slide of the generator, or of what the bench checks, shows.
const FLOORS = {
	passagesAccepted: 157,
	passagesPlayed: 137,
	passagesRefused: 83,
	passagesBlocking: 66,
	memoryAccepted: 39,
	memoryRefused: 120,
	memoryRoutinesPlayed: 16,
	passagesRoutinesPlayed: 16,
	routineLeaves: 20,
	rightRoundsChecked: 2700,
	noneRoundsChecked: 9100
} as const;
const NO_PLAYABLE_INDEX_CEILING = 31;
/** Played right for `RIGHT_PLAY_S`, every session is still playing but those with nothing to serve. */
const RIGHT_CUT_CEILING = 205;
const RIGHT_EXCUSED_CEILING: Record<VerdictExcuse, number> = {
	'no-attempt': 38,
	'cut-by-stop': 20,
	'not-answered': 5,
	'admits-none': 265
};
/** Played with nothing, a round is answered only in free time: nothing to excuse. */
const NONE_EXCUSED_CEILING: Record<VerdictExcuse, number> = {
	'no-attempt': 5,
	'cut-by-stop': 5,
	'not-answered': 5,
	'admits-none': 5
};
/** A refusal names a field of the definition, or what it writes. */
const REFUSAL_FIELD =
	/^(round|params|presentation|meter|tempo|flow|view|figures|items|passages|practices|levels|writes a round|an exercise|this file)\b/;
/** The shapes the generator draws to be refused, how to tell one, and the reason that fits it. */
const REFUSABLE_SHAPES: [string, (d: ExerciseDefinition) => boolean, RegExp][] = [
	[
		'a skill on the other set',
		(d) => skillById(d.practices).items !== SET_OF_PASSAGE_FAMILY[d.passages!.members.family],
		/^passages\.members names family "[a-z-]+", whose members are no items of /
	],
	[
		'a scope of no key',
		(d) => d.passages!.scope === 'nowhere',
		/^passages\.scope names "nowhere", which passages\.of does not write$/
	],
	[
		'a window read from a passage param',
		(d) => d.passages!.each?.windowMs !== undefined,
		/reads param "windowMs", which the exercise does not give as a number/
	],
	[
		'a lead read from no ladder',
		(d) => JSON.stringify(d.round!.prompt?.lead) === '{"param":"leadBeats"}',
		/^round\.prompt\.lead reads param "leadBeats", but the exercise writes no ladder/
	],
	['no presentation', (d) => d.presentation === undefined, /^writes a round but no presentation/]
];

/**
 * Whether a drawn exercise blocks as its anti-blocking says, played with nothing: it asks it, and
 * every round asks a timed content (a bare attack in free time passes on anything).
 */
function blocks(definition: ExerciseDefinition): boolean {
	return (
		definition.flow?.antiBlocking === true &&
		definition.round!.expectations.every((e) => e.at !== null && e.content !== null)
	);
}

/** Whether it writes an aid level, which its anti-blocking brings before it changes air. */
const hasAidLevel = (definition: ExerciseDefinition) =>
	(definition.levels ?? []).some((level) => level.aid);
const ROUTINE_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
/** A session that plays opens a round within this many audio seconds of the last, or ends. */
const HANG_S = 40;

/** Registers `definition` as a file's exercise would be, once the application accepts it. */
function accepted(definition: ExerciseDefinition): boolean {
	if (benchRefusal(definition) !== null) return false;
	registerExercise(definition, 'bench');
	return true;
}

/** Registers `routine` as a file's routine would be, once the application accepts it. */
function acceptedRoutine(routine: RoutineDefinition): boolean {
	if (benchRoutineRefusal(routine) !== null) return false;
	registerRoutine(routine, 'bench');
	return true;
}

/** What went wrong in a session the service bench played, by its label; none when nothing did. */
function playProblems(play: ServicePlay, label: string): string[] {
	const problems: string[] = [];
	if (play.unsettled.length > 0) {
		problems.push(`${label}: ${play.unsettled.length} rounds opened and never stored`);
	}
	if (play.planless > 0) problems.push(`${label}: ${play.planless} attempts without their plan`);
	if (play.wrongVerdicts.length > 0) {
		const when = play.wrongVerdicts.map((r) => r.opensAt.toFixed(2)).join(', ');
		problems.push(`${label}: rounds opened at ${when} s judged against what was played`);
	}
	if (play.longestGapS > HANG_S) {
		problems.push(
			`${label}: no round opened for ${play.longestGapS.toFixed(1)} s (${play.status})`
		);
	}
	return problems;
}

/** The successes of a session's attempts, in the order they were prompted. */
const successes = (play: ServicePlay) =>
	[...play.attempts].sort((a, b) => a.promptedAt - b.promptedAt).map((a) => a.success);

describe('every valid passages exercise and routine plays', () => {
	for (const definition of [READ_A_GRID, READ_A_GRID_BLOCKING, CLIMB_SHAPES]) {
		registerExercise(definition, 'bench');
	}
	registerExercise(ROOT_THEN_CHORD_LISTED, 'bench');
	registerExercise(PITCHED_FIGURE, 'bench');
	registerRoutine(TWO_MEMORY_EXERCISES, 'bench');
	registerRoutine(TWO_PASSAGES_EXERCISES, 'bench');

	it('plays a passages exercise written only in this test alone, every change right, then none', async () => {
		expect(benchRefusal(READ_A_GRID)).toBeNull();
		for (const answer of ['right', 'none'] as const) {
			const bench = await serviceBench({ acquired: true });
			const play = await playService(
				bench,
				() => bench.services.startExercise(READ_A_GRID.id),
				[READ_A_GRID],
				answer
			);
			expect(playProblems(play, answer)).toEqual([]);
			// The blues on F has nine changes once equal symbols in a row are merged: a passage and
			// more within the bench's time, and the session goes on (no anti-blocking).
			expect(play.attempts.length, answer).toBeGreaterThan(9);
			expect(play.status, answer).not.toBe('finished');
			expect(new Set(successes(play)), answer).toEqual(new Set([answer === 'right']));
			expect(play.attempts.every((a) => a.exerciseId === READ_A_GRID.id && a.plan)).toBe(true);
		}
	});

	it('ends a passages exercise alone that blocks, as its anti-blocking says', async () => {
		expect(benchRefusal(READ_A_GRID_BLOCKING)).toBeNull();
		const bench = await serviceBench({ acquired: true });
		const play = await playService(
			bench,
			() => bench.services.startExercise(READ_A_GRID_BLOCKING.id),
			[READ_A_GRID_BLOCKING],
			'none'
		);
		expect(playProblems(play, 'none')).toEqual([]);
		// Three misses at level 1 bring the aid level at the next passage, the passage under way
		// (the nine changes of the blues) played to its end; three misses there, and it changes
		// air: nothing is left to play.
		expect(play.status).toBe('finished');
		expect(play.attempts).toHaveLength(12);
		expect(successes(play).every((success) => !success)).toBe(true);
	});

	it('plays a routine of two memory exercises written only in this test, in two meters', async () => {
		expect(benchRefusal(ROOT_THEN_CHORD_LISTED)).toBeNull();
		expect(benchRefusal(PITCHED_FIGURE)).toBeNull();
		expect(benchRoutineRefusal(TWO_MEMORY_EXERCISES)).toBeNull();
		for (const answer of ['right', 'none'] as const) {
			const bench = await serviceBench();
			const play = await playService(
				bench,
				() => bench.services.startRoutine(TWO_MEMORY_EXERCISES.id),
				[ROOT_THEN_CHORD_LISTED, PITCHED_FIGURE],
				answer,
				// The whole session: the second exercise introduces once the first's are under way.
				{ maxS: 330 }
			);
			expect(playProblems(play, answer)).toEqual([]);
			expect(play.attempts.length, answer).toBeGreaterThan(3);
			// The second exercise introduces once the first's items are under way, never after misses.
			expect(new Set(play.attempts.map((a) => a.exerciseId)), answer).toEqual(
				new Set(
					answer === 'right'
						? [ROOT_THEN_CHORD_LISTED.id, PITCHED_FIGURE.id]
						: [ROOT_THEN_CHORD_LISTED.id]
				)
			);
			expect(new Set(successes(play)), answer).toEqual(new Set([answer === 'right']));
		}
	});

	it('plays a routine of two passages exercises written only in this test, each in turn', async () => {
		expect(benchRefusal(CLIMB_SHAPES)).toBeNull();
		expect(benchRoutineRefusal(TWO_PASSAGES_EXERCISES)).toBeNull();
		for (const answer of ['right', 'none'] as const) {
			const bench = await serviceBench({ acquired: true });
			const play = await playService(
				bench,
				() => bench.services.startRoutine(TWO_PASSAGES_EXERCISES.id),
				[READ_A_GRID, CLIMB_SHAPES],
				answer,
				{ maxS: 150 }
			);
			expect(playProblems(play, answer)).toEqual([]);
			expect(new Set(play.attempts.map((a) => a.exerciseId)), answer).toEqual(
				new Set([READ_A_GRID.id, CLIMB_SHAPES.id])
			);
			expect(new Set(successes(play)), answer).toEqual(new Set([answer === 'right']));
		}
	});

	it('refuses, naming the field, every routine it cannot play', () => {
		const twin: ExerciseDefinition = { ...READ_A_GRID, id: 'read-a-grid-twin' };
		registerExercise(twin, 'bench');
		const routine = (id: string, exercises: string[]): RoutineDefinition => ({
			id,
			title: { fr: id, en: id },
			exercises
		});
		expect(benchRoutineRefusal(routine('mixed', [LOCATE_NECK_ID, READ_A_GRID.id]))).toBe(
			'exercises[1] practises a skill without memory, exercises[0] one with memory: a routine does not mix them'
		);
		expect(benchRoutineRefusal(routine('twice', [READ_A_GRID.id, twin.id]))).toBe(
			`exercises[1] practises the skill "${READ_A_GRID.practices}", as exercises[0] does`
		);
		expect(benchRoutineRefusal(routine('unknown', [READ_A_GRID.id, 'nowhere-exercise']))).toBe(
			'exercises[1]: no file defines the exercise "nowhere-exercise"'
		);
		expect(benchRoutineRefusal(routine('no-passages', [RHYTHM_SILENT_BARS_ID]))).toBe(
			`exercises[0]: "${RHYTHM_SILENT_BARS_ID}" practises a skill without memory and writes no passages`
		);
	});

	it('plays every passages exercise and routine the validators accept, drawn at random', async () => {
		const failures: string[] = [];
		const counts = {
			passagesDrawn: PASSAGE_SEEDS.length,
			passagesRefused: 0,
			passagesAccepted: 0,
			passagesPlayed: 0,
			/** Accepted, played no round: the source serves none of its passages. */
			passagesNoPlayableIndex: 0,
			/** Played alone with nothing, asking its anti-blocking: and changed air. */
			passagesBlocking: 0,
			passagesBlockingEnded: 0,
			memoryAccepted: 0,
			memoryRefused: 0,
			memoryRoutinesAccepted: 0,
			memoryRoutinesPlayed: 0,
			passagesRoutinesAccepted: 0,
			passagesRoutinesPlayed: 0,
			/** Exercises that changed air and left a routine's series, played with nothing. */
			routineLeaves: 0,
			/** Rounds whose verdict the bench checked, answered right and with nothing. */
			rightRoundsChecked: 0,
			noneRoundsChecked: 0,
			/** Rounds not checked, by why, answered right and with nothing. */
			rightExcused: Object.fromEntries(VERDICT_EXCUSES.map((e) => [e, 0])),
			noneExcused: Object.fromEntries(VERDICT_EXCUSES.map((e) => [e, 0])),
			/** Sessions still playing when the bench stopped them (`maxS`). */
			rightCut: 0,
			noneCut: 0
		};
		const refused: { definition: ExerciseDefinition; reason: string }[] = [];

		/** Plays `start` once as `answer` says; its problems go to `failures`, its excuses counted. */
		const playOnce = async (
			label: string,
			start: (bench: ServiceBench) => Promise<PlaySessionController>,
			exercises: ExerciseDefinition[],
			acquired: boolean,
			answer: 'right' | 'none'
		): Promise<ServicePlay | null> => {
			try {
				const bench = await serviceBench({ acquired });
				const play = await playService(bench, () => start(bench), exercises, answer, {
					maxS: answer === 'right' ? RIGHT_PLAY_S : NONE_PLAY_S
				});
				failures.push(...playProblems(play, `${label} (${answer})`));
				counts[`${answer}RoundsChecked`] += play.checked;
				for (const excuse of VERDICT_EXCUSES) {
					counts[`${answer}Excused`][excuse] += play.excused[excuse];
				}
				if (play.status !== 'finished') counts[`${answer}Cut`]++;
				// Played with nothing past the session's length, every session ends by itself.
				if (answer === 'none' && play.status !== 'finished') {
					failures.push(`${label} (none): still playing (${play.status}) at ${NONE_PLAY_S} s`);
				}
				return play;
			} catch (error) {
				failures.push(`${label} (${answer}): ${(error as Error).stack ?? error}`);
				return null;
			}
		};

		const passagesPool: ExerciseDefinition[] = [];
		for (const seed of PASSAGE_SEEDS) {
			const definition = randomPassagesExercise(
				mulberry32(seed + 50_000),
				`random-passages-${seed}`
			);
			const reason = benchRefusal(definition);
			if (reason !== null) {
				counts.passagesRefused++;
				refused.push({ definition, reason });
				continue;
			}
			registerExercise(definition, 'bench');
			counts.passagesAccepted++;
			passagesPool.push(definition);
			const label = `passages seed ${seed}`;
			const start = (bench: ServiceBench) => bench.services.startExercise(definition.id);
			const right = await playOnce(label, start, [definition], true, 'right');
			const none = await playOnce(label, start, [definition], true, 'none');
			if (!right || !none) continue;
			if (right.rounds.length > 0 || none.rounds.length > 0) {
				counts.passagesPlayed++;
			} else {
				// Why it played nothing: it ended at once, and its source serves no passage.
				const source = createPassageSource({
					exercises: [definition],
					cards: acquiredTriads(),
					attempts: [],
					sessionId: 'why',
					durationMs: SESSION_MS
				});
				const served = source.next({ now: 0, elapsedMs: 0, fatigued: false });
				if (right.status === 'finished' && none.status === 'finished' && served === null) {
					counts.passagesNoPlayableIndex++;
				} else {
					failures.push(`${label}: played no round, though its source serves one`);
				}
			}
			if (blocks(definition) && none.rounds.length > 0) {
				// Anti-blocking: misses in a row bring its aid level, announced, when it writes one;
				// misses again at the lowest and it changes air, which ends a session of one exercise.
				counts.passagesBlocking++;
				if (
					(!hasAidLevel(definition) || none.announced.has('aid-level')) &&
					none.end === 'change-of-air'
				) {
					counts.passagesBlockingEnded++;
				} else {
					failures.push(
						`${label} (none): blocks, but ${[...none.announced].join(', ') || 'nothing announced'}, ended ${none.end}`
					);
				}
			}
		}

		// The memory exercises drawn, as a file's: those refused counted with their reasons.
		const memoryPool: ExerciseDefinition[] = [];
		const memoryRefused: { definition: ExerciseDefinition; reason: string }[] = [];
		for (const definition of SEEDS.map(drawn)) {
			if (aloneSourceOf(definition) !== 'memory') continue;
			const reason = benchRefusal(definition);
			if (reason !== null) {
				counts.memoryRefused++;
				memoryRefused.push({ definition, reason });
				continue;
			}
			registerExercise(definition, 'bench');
			counts.memoryAccepted++;
			memoryPool.push(definition);
		}
		for (const [kind, pool] of [
			['memory', memoryPool],
			['passages', passagesPool]
		] as const) {
			for (const seed of ROUTINE_SEEDS) {
				const routine = randomRoutine(
					mulberry32(seed + 90_000),
					`random-routine-${kind}-${seed}`,
					pool
				);
				if (routine === null || !acceptedRoutine(routine)) continue;
				counts[`${kind}RoutinesAccepted`]++;
				const exercises = pool.filter((exercise) => routine.exercises.includes(exercise.id));
				const label = `${kind} routine seed ${seed}`;
				const start = (bench: ServiceBench) => bench.services.startRoutine(routine.id);
				const plays = [
					await playOnce(label, start, exercises, kind === 'passages', 'right'),
					await playOnce(label, start, exercises, kind === 'passages', 'none')
				];
				if (plays.some((play) => play && play.rounds.length > 0)) {
					counts[`${kind}RoutinesPlayed`]++;
				}
				// Only an exercise that asks its anti-blocking may change air and leave the routine's
				// series, and the screen names each that leaves.
				const none = plays[1];
				if (none) {
					const stayed = none.left.filter(
						(left) =>
							!exercises.some((e) => e.id === left.exerciseId && e.flow?.antiBlocking === true)
					);
					counts.routineLeaves += none.left.length;
					if (stayed.length > 0) failures.push(`${label} (none): left ${JSON.stringify(stayed)}`);
					if (none.leaving < none.left.length) {
						failures.push(`${label} (none): ${none.left.length} left, ${none.leaving} told`);
					}
				}
			}
		}

		const told = JSON.stringify(counts);
		console.info(`open bench: ${told}`);
		expect(failures, told).toEqual([]);
		// The draw gives each kind, accepted, played and refused, near what it gives today, and
		// right answers are checked on many rounds.
		for (const [name, floor] of Object.entries(FLOORS)) {
			expect(counts[name as keyof typeof FLOORS], `${name} ${told}`).toBeGreaterThanOrEqual(floor);
		}
		expect(counts.passagesNoPlayableIndex, told).toBeLessThanOrEqual(NO_PLAYABLE_INDEX_CEILING);
		// Few rounds are excused from the verdict check, each excuse counted.
		for (const excuse of VERDICT_EXCUSES) {
			expect(counts.rightExcused[excuse], `${excuse} ${told}`).toBeLessThanOrEqual(
				RIGHT_EXCUSED_CEILING[excuse]
			);
			expect(counts.noneExcused[excuse], `${excuse} ${told}`).toBeLessThanOrEqual(
				NONE_EXCUSED_CEILING[excuse]
			);
		}
		// Played right, a session lasts its length: every one still playing at the stop is cut
		// there (one that ends sooner: no playable index). Played with nothing, none is cut.
		expect(counts.rightCut, told).toBeLessThanOrEqual(RIGHT_CUT_CEILING);
		expect(counts.noneCut, told).toBe(0);

		// Every draw it refuses, of passages or of memory, is refused in words that name a field of
		// the file, never as a crash.
		for (const { definition, reason } of [...refused, ...memoryRefused]) {
			expect(reason, definition.id).toMatch(REFUSAL_FIELD);
			expect(reason, definition.id).not.toMatch(
				/Cannot read|is not a function|undefined|TypeError/
			);
		}
		// Each refusable shape the generator draws on purpose is refused for its own reason.
		for (const [shape, drawnWith, because] of REFUSABLE_SHAPES) {
			const withShape = refused.filter(({ definition }) => drawnWith(definition));
			expect(
				withShape.some(({ reason }) => because.test(reason)),
				`${shape}: ${withShape.map((r) => r.reason).join(' | ')}`
			).toBe(true);
		}
	}, 600_000);

	it('draws every value the passages and routines allow, and the validators accept each', () => {
		const passages = PASSAGE_SEEDS.map((seed) =>
			randomPassagesExercise(mulberry32(seed + 50_000), `random-passages-${seed}`)
		);
		const kept = passages.filter(accepted);
		/** The values `read` takes over the definitions drawn, and over those accepted. */
		const values = (read: (definition: ExerciseDefinition) => unknown) => ({
			drawn: new Set(passages.map(read)),
			accepted: new Set(kept.map(read))
		});
		const both = <T>(...expected: T[]) => ({
			drawn: new Set(expected),
			accepted: new Set(expected)
		});
		expect(values((d) => d.passages!.members.family)).toEqual(both('grid-changes', 'chord-shapes'));
		expect(values((d) => d.passages!.opens !== undefined)).toEqual(both(true, false));
		expect(values((d) => d.passages!.again ?? null)).toEqual(both('until-passed', null));
		expect(values((d) => d.passages!.each !== undefined)).toEqual(both(true, false));
		expect(values((d) => d.levels !== undefined)).toEqual(both(true, false));
		expect(values((d) => d.flow?.antiBlocking ?? false)).toEqual(both(true, false));
		expect(values((d) => d.round!.policy.pairing.mode)).toEqual(both('first-answer', 'alignment'));
		expect(values((d) => d.view).accepted).toEqual(new Set(['grid-scroll', 'link-lane', 'lane']));
		// Every filter a passage param reads is accepted somewhere.
		const filters = (d: ExerciseDefinition) =>
			d.round!.expectations.flatMap((e) =>
				!('figure' in e) && e.content && 'where' in e.content
					? (e.content.where ?? []).map((f) => Object.keys(f)[0])
					: []
			);
		expect(new Set(kept.flatMap(filters))).toEqual(new Set(['position', 'in', 'other']));
		// Routines are drawn with and without an opening, and accepted both ways.
		const routinesOpen = new Set(
			ROUTINE_SEEDS.map((seed) =>
				randomRoutine(mulberry32(seed + 90_000), `coverage-${seed}`, kept)
			)
				.filter((routine): routine is RoutineDefinition => routine !== null)
				.filter((routine) => benchRoutineRefusal(routine) === null)
				.map((routine) => routine.opens !== undefined)
		);
		expect(routinesOpen).toEqual(new Set([true, false]));
	});
});
