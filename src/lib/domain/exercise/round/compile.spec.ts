import { IDENTIFY_NECK } from '$lib/testing/catalog';
import { practisingWithoutRecall, SKILL_OF_SET, registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { CLIMB_PASSAGES } from '$lib/testing/changesPassages';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import { FORM_MAJ7 } from '$lib/testing/arpeggioExercise';
import type { ChordGridItem } from '$lib/domain/sets';
import { GUITAR_DERIVATIONS } from '$lib/domain/families/guitar/derivations';
import { clickAccompaniment } from '../../time/accompaniment';
import type { Figure } from '../../time/figure';
import { Fraction } from '../../time/fraction';
import { METER_4_4, type Meter } from '../../time/meter';
import { parseLilyPond } from '../../time/notation/lilypond';
import type { ExerciseDefinition } from '../types';
import { DEFAULT_RESPONSE_WINDOWS } from '../windows';
import type { PlannedItem } from '../../types';
import { admittedMembers, type MemberContent } from '../../judges';
import { compileRound, roundParamsOf, type ResolutionCache } from './compile';
import { freeTime, gridChange, onTheBeat, pointAt } from './testing/plans';
import type { FigureExpectationTemplate, RoundTemplate } from './types';

registerTestSkills();

const meter = METER_4_4;
const PREVIEW = 2;
const KEY = 'D|maj|3:5,2:1,1:3';

const firstAnswerOnTheBeat = (correction: boolean): RoundTemplate['policy'] => ({
	unit: 'response',
	verdict: 'response',
	correction,
	pairing: {
		mode: 'first-answer',
		opens: { afterPromptMs: { param: 'windows.minResponseMs' } },
		lateMs: { param: 'windows.lateMs' },
		lateCapture: { ms: { param: 'windows.lateCaptureMs' } }
	}
});

const LOCATE_ROUND: RoundTemplate = {
	prompt: { lead: { param: 'leadBeats' } },
	expectations: [
		{
			at: { beats: 0 },
			sensor: 'note',
			content: { family: 'note-places' },
			window: { ms: { param: 'windows.perfectMs' } }
		}
	],
	length: { breath: true },
	listenBeforeEnd: { beats: { param: 'previewBeats' } },
	policy: firstAnswerOnTheBeat(false)
};

const ANCHOR_ROUND: RoundTemplate = {
	prompt: { lead: { param: 'leadBeats' } },
	expectations: [
		{
			at: { beats: 0 },
			sensor: 'note',
			content: { family: 'note-places', of: 'root' },
			window: { ms: { param: 'windows.perfectMs' } }
		},
		{
			at: { beats: { param: 'windows.anchorChordFromBeats' } },
			until: { bars: 1 },
			sensor: 'chord',
			content: { family: 'chord-shapes' },
			window: { ms: { param: 'windows.perfectMs' } }
		}
	],
	length: { bars: 1, breath: true },
	policy: firstAnswerOnTheBeat(true)
};

const GRID_ROUND: RoundTemplate = {
	prompt: { lead: 1 },
	expectations: [
		{
			at: { beats: 0 },
			sensor: 'chord',
			content: { from: 'grid-change' },
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
};

const IDENTIFY_ROUND: RoundTemplate = {
	prompt: { lead: 0 },
	expectations: [
		{
			at: null,
			sensor: 'tap',
			content: { from: 'name-of-item' },
			window: { ms: { param: 'directRecall.withinMs' } }
		}
	],
	length: { bars: 1 },
	policy: {
		unit: 'response',
		verdict: 'response',
		correction: false,
		pairing: { mode: 'first-answer', opens: { afterPromptMs: 0 }, lateMs: 0, lateCapture: null }
	}
};

function definition(
	set: string,
	round: RoundTemplate,
	params: Record<string, unknown> = {}
): ExerciseDefinition {
	return {
		id: `test-${set}`,
		practices: SKILL_OF_SET[set] ?? set,
		round,
		params: { pacing: { respirationBars: 1 }, ...params }
	};
}

function planned<I>(set: string, item: I, leadBeats: number | null = 4): PlannedItem<I> {
	return {
		exerciseId: `test-${set}`,
		skill: SKILL_OF_SET[set] ?? set,
		exerciseLevel: 0,
		item,
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		leadBeats
	};
}

describe('compileRound', () => {
	it('compiles a locate template to the beat plan', () => {
		const item = { string: 3, pitch: 'F' };
		const plan = compileRound(
			definition('note-on-string', LOCATE_ROUND),
			planned('note-on-string', item, 4),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.of(-1),
			expectations: [
				pointAt('note', {
					kind: 'member',
					value: { family: 'note-places', index: item, selection: { family: 'note-places' } }
				})
			],
			length: Fraction.of(1),
			listenUntil: Fraction.of(1, 2),
			mutedBars: [],
			policy: onTheBeat(false)
		});
	});

	it('compiles an identify template to the free plan', () => {
		const item = { string: 3, fret: 5 };
		const plan = compileRound(
			definition('placed-note', IDENTIFY_ROUND),
			planned('placed-note', item, null),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.ZERO,
			expectations: [
				{
					...pointAt('tap', { kind: 'name', value: item }, null),
					// The direct recall of the skill identify practises.
					window: { ms: 3000 }
				}
			],
			length: Fraction.of(1),
			mutedBars: [],
			policy: freeTime
		});
	});

	it('compiles an anchor template to the anchor plan: root on the beat, chord from beat 2 to the bar end', () => {
		const item = { voicingKey: KEY };
		const plan = compileRound(
			definition('voicing-on-strings', ANCHOR_ROUND),
			planned('voicing-on-strings', item, 2),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		// The template writes no listenBeforeEnd: absent means « listen to the end ».
		expect(plan).toEqual({
			prompt: Fraction.of(-1, 2),
			expectations: [
				pointAt('note', {
					kind: 'member',
					value: {
						family: 'note-places',
						index: { pitch: 'D', string: 2 },
						selection: { family: 'note-places' }
					}
				}),
				{
					...pointAt(
						'chord',
						{
							kind: 'member',
							value: {
								family: 'chord-shapes',
								index: GUITAR_DERIVATIONS.voicing.index(item),
								selection: { family: 'chord-shapes' }
							}
						},
						Fraction.of(1, 4)
					),
					span: { until: Fraction.of(1) }
				}
			],
			length: Fraction.of(2),
			mutedBars: [],
			policy: onTheBeat(true)
		});
	});

	it('compiles a zone template to a beat plan heard by the chord sensor', () => {
		const item = { voicingKey: KEY, position: 7 };
		const { listenBeforeEnd: _, ...withoutListen } = LOCATE_ROUND;
		const zone: RoundTemplate = {
			...withoutListen,
			expectations: [
				{
					at: { beats: 0 },
					sensor: 'chord',
					content: { family: 'chord-shapes', where: [{ at: { item: 'fret' } }] },
					window: { ms: { param: 'windows.perfectMs' } }
				}
			]
		};
		const plan = compileRound(
			definition('voicing-on-strings', zone),
			planned('voicing-on-strings', item, 4),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.of(-1),
			expectations: [
				// The item names no fret: the shape at its position.
				pointAt('chord', {
					kind: 'member',
					value: {
						family: 'chord-shapes',
						index: GUITAR_DERIVATIONS.voicing.index(item),
						selection: { family: 'chord-shapes', where: [{ at: 7 }] }
					}
				})
			],
			length: Fraction.of(1),
			mutedBars: [],
			policy: onTheBeat(false)
		});
	});

	it('compiles a grid template to the grid change plan, its length measured on the item', () => {
		const changes = gridChanges(gridById('iohefy-a'));
		const item: ChordGridItem = {
			rule: 'jam',
			element: 'jam:iohefy-a',
			passageId: 's:0',
			index: 1,
			changes,
			symbol: changes[1].symbol,
			chord: 'D|min',
			sets: [[3, 2, 1]],
			previous: null
		};
		expect(changes[1].length).toBe(4);
		const plan = compileRound(
			definition('change', GRID_ROUND),
			planned('change', item, null),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.of(-1, 4),
			expectations: [pointAt('chord', { kind: 'chord-grid', value: item })],
			length: Fraction.of(1),
			handover: Fraction.of(1),
			mutedBars: [],
			countEndsOn: 'target',
			policy: gridChange
		});
	});

	it('reads a number a level gives (the lead) and one a definition writes (a window)', () => {
		const item = { string: 3, pitch: 'F' };
		const written = definition('note-on-string', LOCATE_ROUND, { windows: { perfectMs: 55 } });
		const plan = compileRound(written, planned('note-on-string', item, 2), meter, {
			previewBeats: PREVIEW,
			fromRunStart: null
		});
		expect(plan.prompt).toEqual(Fraction.of(-2, 4));
		expect(plan.expectations[0].window).toEqual({ ms: 55 });
		expect(
			roundParamsOf(written, planned('note-on-string', item, 8), { previewBeats: 3 })
		).toMatchObject({
			leadBeats: 8,
			previewBeats: 3,
			directRecall: { withinMs: 1500 },
			windows: { perfectMs: 55, lateMs: DEFAULT_RESPONSE_WINDOWS.lateMs },
			pacing: { respirationBars: 1 }
		});
	});

	it('gives the naming round the time of its skill’s direct recall', () => {
		const plan = compileRound(
			IDENTIFY_NECK,
			planned('placed-note', { string: 3, fret: 5 }, null),
			meter,
			{
				previewBeats: PREVIEW,
				fromRunStart: null
			}
		);
		expect(plan.expectations[0].window).toEqual({ ms: 3000 });
		expect(
			roundParamsOf(IDENTIFY_NECK, planned('placed-note', { string: 3, fret: 5 }, null), {
				previewBeats: 0
			})
		).not.toHaveProperty('recallThresholdMs');
	});

	it('reads a window an exercise level overrides', () => {
		const item = { string: 3, pitch: 'F' };
		const leveled: ExerciseDefinition = {
			...definition('note-on-string', LOCATE_ROUND, { windows: { perfectMs: 55 } }),
			levels: [{ params: {} }, { params: { 'windows.perfectMs': 40 } }]
		};
		const at = (exerciseLevel: number) =>
			compileRound(leveled, { ...planned('note-on-string', item, 2), exerciseLevel }, meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			}).expectations[0].window;
		expect(at(0)).toEqual({ ms: 55 });
		expect(at(1)).toEqual({ ms: 40 });
	});

	it('reads a window an item level overrides', () => {
		const item = { string: 3, pitch: 'F' };
		const laddered = definition('note-on-string', LOCATE_ROUND, {
			ladder: [
				{ params: { leadBeats: 4, aided: false } },
				{ params: { leadBeats: 2, aided: false, 'windows.perfectMs': 120 } }
			]
		});
		const at = (level: number | undefined) =>
			compileRound(laddered, { ...planned('note-on-string', item, 2), level }, meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			}).expectations[0].window;
		expect(at(1)).toEqual({ ms: 120 });
		expect(at(0)).toEqual({ ms: DEFAULT_RESPONSE_WINDOWS.perfectMs });
		expect(at(undefined)).toEqual({ ms: DEFAULT_RESPONSE_WINDOWS.perfectMs });
	});

	it('places a target and ends the count where the template says', () => {
		const item = { string: 3, pitch: 'F' };
		const placed = definition('note-on-string', {
			...LOCATE_ROUND,
			barOffset: '1/4',
			countEndsOn: 'target'
		});
		const plan = compileRound(placed, planned('note-on-string', item, 4), meter, {
			previewBeats: PREVIEW,
			fromRunStart: null
		});
		expect(plan.barOffset).toEqual(Fraction.of(1, 4));
		expect(plan.countEndsOn).toBe('target');
		const plain = compileRound(
			definition('note-on-string', LOCATE_ROUND),
			planned('note-on-string', item, 4),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plain.barOffset).toBeUndefined();
		expect(plain.countEndsOn).toBeUndefined();
	});

	it('names the exercise, the field and the param when a param is absent', () => {
		const item = { string: 3, pitch: 'F' };
		const absent: RoundTemplate = {
			...LOCATE_ROUND,
			prompt: { lead: { param: 'windows.nowhere' } }
		};
		expect(() =>
			compileRound(
				definition('note-on-string', absent),
				planned('note-on-string', item, 4),
				meter,
				{
					previewBeats: PREVIEW,
					fromRunStart: null
				}
			)
		).toThrow(
			/test-note-on-string: round\.prompt\.lead reads param "windows\.nowhere", absent for note-on-string item /
		);
		// Identify practising a skill that writes no direct recall.
		const noThreshold = practisingWithoutRecall(definition('placed-note', IDENTIFY_ROUND));
		expect(() =>
			compileRound(noThreshold, planned('placed-note', { string: 3, fret: 5 }, null), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(
			/test-placed-note: round\.expectations\[0\]\.window\.ms reads param "directRecall\.withinMs"/
		);
	});

	it('names the exercise and the field when a fraction is malformed', () => {
		const item = { string: 3, pitch: 'F' };
		const compiling = (round: RoundTemplate) => () =>
			compileRound(definition('note-on-string', round), planned('note-on-string', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			});
		expect(compiling({ ...LOCATE_ROUND, barOffset: 'a quarter' })).toThrow(
			/test-note-on-string: round\.barOffset not a fraction: "a quarter"/
		);
		const gap: RoundTemplate = {
			...LOCATE_ROUND,
			expectations: [{ ...LOCATE_ROUND.expectations[0], window: { ofGap: '1,5' } }]
		};
		expect(compiling(gap)).toThrow(
			/test-note-on-string: round\.expectations\[0\]\.window\.ofGap not a fraction: "1,5"/
		);
	});

	it('names the exercise when the compiled plan is invalid', () => {
		const item = { string: 3, pitch: 'F' };
		const outside: RoundTemplate = {
			...LOCATE_ROUND,
			expectations: [{ ...LOCATE_ROUND.expectations[0], at: { bars: 5 } }]
		};
		expect(() =>
			compileRound(
				definition('note-on-string', outside),
				planned('note-on-string', item, 4),
				meter,
				{
					previewBeats: PREVIEW,
					fromRunStart: null
				}
			)
		).toThrow(/test-note-on-string: .*outside the plan length/);
	});

	it('refuses an exercise without a round, and a derivation that reads another set', () => {
		const item = { string: 3, pitch: 'F' };
		const bare: ExerciseDefinition = { id: 'bare', practices: 'locate-note-string', params: {} };
		expect(() =>
			compileRound(bare, planned('note-on-string', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(/bare: .*no round/);
		expect(() =>
			compileRound(
				definition('note-on-string', IDENTIFY_ROUND),
				planned('note-on-string', item, 4),
				meter,
				{
					previewBeats: PREVIEW,
					fromRunStart: null
				}
			)
		).toThrow(
			/test-note-on-string: round\.expectations\[0\]\.content derives "name-of-item".*note-on-string/
		);
	});
});

const CYCLE_POLICY: RoundTemplate['policy'] = {
	unit: 'cycle',
	verdict: 'cycle',
	correction: false,
	pairing: { mode: 'alignment' }
};

/** A round that is one figure entry filling it, of `bars` bars; no prompt. */
function figureRound(
	entry: Partial<FigureExpectationTemplate> = {},
	more: Partial<RoundTemplate> = {}
): RoundTemplate {
	return {
		expectations: [
			{
				figure: { id: 'main' },
				at: { bars: 0 },
				sensor: 'attack',
				content: null,
				window: { ms: 80 },
				...entry
			}
		],
		length: { bars: 1 },
		handover: 'end',
		policy: CYCLE_POLICY,
		...more
	};
}

function figureExercise(
	set: string,
	round: RoundTemplate,
	figures: Record<string, string>,
	params: Record<string, unknown> = {}
): ExerciseDefinition {
	return {
		...definition(set, round, params),
		figures: Object.entries(figures).map(([id, text]) => ({ id, figure: parseLilyPond(text) }))
	};
}

const C_FIRST_INVERSION = { voicing: 'C|maj|3:3,2:5,1:1', frets: [9, 8, 8] };

/** Compiles `round` over `item`, from `fromRunStart` bars into its run. */
function compileFigure(
	exercise: ExerciseDefinition,
	item: unknown,
	fromRunStart: number | null = null,
	meter: Meter = METER_4_4
) {
	return compileRound(exercise, planned(exercise.practices, item, null), meter, {
		previewBeats: PREVIEW,
		fromRunStart
	});
}

const midis = (plan: { expectations: { content: unknown }[] }) =>
	plan.expectations.map((e) => (e.content as { value: { midi: number } }).value.midi);

const THREE_ONE = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on', 'on', 'on', 'off']
});

describe('compileRound, a figure entry', () => {
	it('unfolds a figure into one expectation per attack', () => {
		const plan = compileFigure(
			figureExercise('figure', figureRound(), { main: 'c8 c c c c c c c' }),
			{ figureId: 'main' }
		);
		expect(plan.expectations.map((e) => e.at!.toString())).toEqual([
			'0',
			'1/8',
			'1/4',
			'3/8',
			'1/2',
			'5/8',
			'3/4',
			'7/8'
		]);
		expect(
			plan.expectations.every(
				(e) =>
					e.content === null &&
					e.bar === 0 &&
					e.sensor === 'attack' &&
					e.span === 'point' &&
					e.role === 'target'
			)
		).toBe(true);
		expect(plan.expectations[0].window).toEqual({ ms: 80 });
		expect(plan.length).toEqual(Fraction.of(1));
		expect(plan.handover).toEqual(Fraction.of(1));
		expect(plan.policy).toEqual(CYCLE_POLICY);
	});

	it('loops the figure over the round and rotates it from startBar', () => {
		const twoBars = figureExercise('figure', figureRound({}, { length: { bars: 2 } }), {
			main: 'c1 | c2 c2'
		});
		// Bar 2 (two half notes), then bar 1 (one whole note) again; a start past the figure wraps.
		for (const from of [1, 3]) {
			const plan = compileFigure(twoBars, { figureId: 'main' }, from);
			expect(plan.expectations.map((e) => e.at!.toString())).toEqual(['0', '1/2', '1']);
			expect(plan.expectations.map((e) => e.bar)).toEqual([0, 0, 1]);
		}
		const looped = compileFigure(twoBars, { figureId: 'main' }, 0);
		expect(looped.expectations.map((e) => e.at!.toString())).toEqual(['0', '1', '3/2']);

		// The accompaniment turns with the figure: a round starts on its first muted bar by default.
		const fourBars = figureExercise(
			'figure',
			figureRound({}, { length: { bars: 4 }, accompaniment: THREE_ONE }),
			{ main: 'c8 c r c r c r c' }
		);
		expect(compileFigure(fourBars, { figureId: 'main' }).mutedBars).toEqual([0]);
		expect(compileFigure(fourBars, { figureId: 'main' }, 0).mutedBars).toEqual([3]);
		expect(compileFigure(fourBars, { figureId: 'main' }, 1).mutedBars).toEqual([2]);
		const plan = compileFigure(fourBars, { figureId: 'main' });
		expect(plan.expectations).toHaveLength(20);
		expect(plan.expectations[5].at).toEqual(Fraction.of(1));
		expect(plan.expectations[19].at).toEqual(Fraction.of(31, 8));
	});

	it('compiles a figure entry over a round shorter than a bar', () => {
		const exercise = figureExercise(
			'placed-voicing',
			figureRound(
				{ sensor: 'note', content: { from: 'voicing-notes', pattern: [1, 2, 3, 2] } },
				{ length: { beats: { item: 'beats' } } }
			),
			{ main: 'c4 c c c' }
		);
		const plan = compileFigure(exercise, { ...C_FIRST_INVERSION, beats: 2 });
		expect(plan.length).toEqual(Fraction.of(1, 2));
		expect(plan.expectations.map((e) => e.at!.toString())).toEqual(['0', '1/4']);
		expect(midis(plan)).toEqual([64, 67]);
		expect(plan.handover).toEqual(Fraction.of(1, 2));
	});

	it('cuts the last loop of a figure at the round end', () => {
		// A two-bar figure over three bars: its first bar comes again, its second does not.
		const threeBars = figureExercise('figure', figureRound({}, { length: { bars: 3 } }), {
			main: 'c1 | c2 c2'
		});
		const plan = compileFigure(threeBars, { figureId: 'main' }, 0);
		expect(plan.expectations.map((e) => e.at!.toString())).toEqual(['0', '1', '3/2', '2']);
		expect(plan.expectations.map((e) => e.bar)).toEqual([0, 1, 1, 2]);
	});

	it('spreads the derived notes by the pattern', () => {
		const exercise = figureExercise(
			'placed-voicing',
			figureRound({ sensor: 'note', content: { from: 'voicing-notes', pattern: [1, 2, 3, 2] } }),
			{ main: 'c8 c c c r2' }
		);
		const plan = compileFigure(exercise, C_FIRST_INVERSION);
		expect(midis(plan)).toEqual([64, 67, 72, 67]);
		expect(plan.expectations.map((e) => e.content)).toEqual([
			{ kind: 'pitch', value: { midi: 64, string: 3 } },
			{ kind: 'pitch', value: { midi: 67, string: 2 } },
			{ kind: 'pitch', value: { midi: 72, string: 1 } },
			{ kind: 'pitch', value: { midi: 67, string: 2 } }
		]);
	});

	it('plays the derived list in order without a pattern', () => {
		const exercise = figureExercise(
			'placed-voicing',
			figureRound({ sensor: 'note', content: { from: 'voicing-notes' } }),
			{ main: 'c8 c c c c c r4' }
		);
		expect(midis(compileFigure(exercise, C_FIRST_INVERSION))).toEqual([64, 67, 72, 64, 67, 72]);
	});

	describe('a shape', () => {
		const exerciseOf = (content: FigureExpectationTemplate['content'], text = 'c4 c c c') => ({
			...figureExercise(
				'placed-shape',
				figureRound({ sensor: 'note', content }, { length: { beats: { item: 'beats' } } }),
				{ main: text }
			),
			shapes: [FORM_MAJ7]
		});

		it('is moved to the first note of the item, its notes in order, strings kept', () => {
			const plan = compileFigure(exerciseOf({ from: 'shape-notes' }), {
				shape: 'maj7',
				first: 'd',
				beats: 4
			});
			expect(plan.expectations.map((e) => e.content)).toEqual([
				{ kind: 'pitch', value: { midi: 50, string: 5, name: 'D' } },
				{ kind: 'pitch', value: { midi: 54, string: 4, name: 'F#' } },
				{ kind: 'pitch', value: { midi: 57, string: 4, name: 'A' } },
				{ kind: 'pitch', value: { midi: 61, string: 3, name: 'C#' } }
			]);
		});

		it('plays its first notes over a short change, each change from its first note', () => {
			const exercise = exerciseOf({ from: 'shape-notes' });
			const short = compileFigure(exercise, { shape: 'maj7', first: 'd', beats: 2 });
			expect(midis(short)).toEqual([50, 54]);
			const next = compileFigure(exercise, { shape: 'maj7', first: 'f', beats: 2 });
			expect(midis(next)).toEqual([53, 57]);
		});

		it('loops over a change longer than the shape', () => {
			const plan = compileFigure(exerciseOf({ from: 'shape-notes' }, 'c8 c c c c c c c'), {
				shape: 'maj7',
				first: 'd',
				beats: 4
			});
			expect(midis(plan)).toEqual([50, 54, 57, 61, 50, 54, 57, 61]);
		});

		it('takes a pattern over its notes', () => {
			const plan = compileFigure(exerciseOf({ from: 'shape-notes', pattern: [1, 3, 2, 4] }), {
				shape: 'maj7',
				first: 'd',
				beats: 4
			});
			expect(midis(plan)).toEqual([50, 57, 54, 61]);
		});

		it('fails naming the exercise, the field and the item', () => {
			const exercise = exerciseOf({ from: 'shape-notes' });
			expect(() => compileFigure(exercise, { shape: 'nowhere', first: 'd', beats: 4 })).toThrow(
				/test-placed-shape: round\.expectations\[0\]\.content derives "shape-notes" for placed-shape item nowhere@d: .*shape "nowhere"/
			);
		});
	});

	it("reads written pitches with { from: 'figure' }", () => {
		const exercise = figureExercise(
			'locate',
			figureRound({ sensor: 'note', content: { from: 'figure' } }),
			{ main: "e'4\\1 g'\\1 c''\\2 e'" }
		);
		const plan = compileFigure(exercise, { string: 3, pitch: 'F' });
		expect(plan.expectations.map((e) => e.content)).toEqual([
			{ kind: 'pitch', value: { midi: 64, string: 1 } },
			{ kind: 'pitch', value: { midi: 67, string: 1 } },
			{ kind: 'pitch', value: { midi: 72, string: 2 } },
			{ kind: 'pitch', value: { midi: 64 } }
		]);
	});

	it('reads the figure a level names, the one an item names, and a window written in the params', () => {
		const leveled: ExerciseDefinition = {
			...figureExercise(
				'locate',
				figureRound({ figure: { param: 'figure' }, window: { param: 'window' } }),
				{
					quarters: 'c4 c c c',
					eighths: 'c8 c c c c c c c'
				},
				{ figure: 'quarters', window: { ofGap: '1/4' } }
			),
			levels: [{ params: {} }, { params: { figure: 'eighths', window: { ms: 40 } } }]
		};
		const at = (exerciseLevel: number) =>
			compileRound(
				leveled,
				{ ...planned('note-on-string', { string: 3, pitch: 'F' }, null), exerciseLevel },
				METER_4_4,
				{
					previewBeats: PREVIEW,
					fromRunStart: null
				}
			);
		expect(at(0).expectations).toHaveLength(4);
		expect(at(0).expectations[0].window).toEqual({ ofGap: Fraction.of(1, 4) });
		expect(at(1).expectations).toHaveLength(8);
		expect(at(1).expectations[0].window).toEqual({ ms: 40 });

		const byItem = figureExercise('figure', figureRound({ figure: { item: 'figure' } }), {
			quarters: 'c4 c c c',
			eighths: 'c8 c c c c c c c'
		});
		expect(compileFigure(byItem, { figureId: 'eighths' }).expectations).toHaveLength(8);
		expect(compileFigure(byItem, { figureId: 'quarters' }).expectations).toHaveLength(4);
	});

	it('gives a null prompt when the template writes none', () => {
		const plan = compileFigure(figureExercise('figure', figureRound(), { main: 'c1' }), {
			figureId: 'main'
		});
		expect(plan.prompt).toBeNull();
		const prompted = compileFigure(
			figureExercise('figure', figureRound({}, { prompt: { lead: 2 } }), { main: 'c1' }),
			{ figureId: 'main' }
		);
		expect(prompted.prompt).toEqual(Fraction.of(-1, 2));
	});

	it("takes the muted bars from the accompaniment's off bars", () => {
		const exercise = figureExercise(
			'figure',
			figureRound({}, { length: { bars: 4 }, accompaniment: { param: 'accompaniment' } }),
			{ main: 'c1' },
			{ accompaniment: THREE_ONE }
		);
		expect(compileFigure(exercise, { figureId: 'main' }, 2).mutedBars).toEqual([1]);
		// Written muted bars win over the accompaniment's.
		const written = figureExercise(
			'figure',
			figureRound({}, { length: { bars: 4 }, accompaniment: THREE_ONE, mutedBars: [2] }),
			{ main: 'c1' }
		);
		expect(compileFigure(written, { figureId: 'main' }).mutedBars).toEqual([2]);
		// No accompaniment: no muted bar, the round from its start.
		expect(
			compileFigure(figureExercise('figure', figureRound(), { main: 'c1' }), {
				figureId: 'main'
			}).mutedBars
		).toEqual([]);
	});

	it('fails naming the exercise and the field', () => {
		const voicing = (entry: Partial<FigureExpectationTemplate>, text = 'c8 c c c r2') =>
			figureExercise('placed-voicing', figureRound({ sensor: 'note', ...entry }), { main: text });
		expect(() =>
			compileFigure(
				voicing({ content: { from: 'voicing-notes', pattern: [1, 4] } }),
				C_FIRST_INVERSION
			)
		).toThrow(/test-placed-voicing: round\.expectations\[0\]\.content\.pattern .*4.*3 notes/);
		expect(() => compileFigure(voicing({ figure: { id: 'nowhere' } }), C_FIRST_INVERSION)).toThrow(
			/test-placed-voicing: round\.expectations\[0\]\.figure .*"nowhere"/
		);
		// Review Focus: a place the neck does not hold fails at compilation, naming the item.
		expect(() =>
			compileFigure(voicing({ content: { from: 'voicing-notes' } }), {
				...C_FIRST_INVERSION,
				frets: [21, 20, 20]
			})
		).toThrow(
			/test-placed-voicing: round\.expectations\[0\]\.content derives "voicing-notes" for placed-voicing item C\|maj\|3:3,2:5,1:1@21-20-20: .*no place at frets 21-20-20/
		);
		// A list on a point, a single content on a figure.
		const point: RoundTemplate = {
			...figureRound(),
			expectations: [
				{ at: { beats: 0 }, sensor: 'note', content: { from: 'voicing-notes' }, window: { ms: 80 } }
			]
		};
		expect(() =>
			compileFigure(figureExercise('placed-voicing', point, {}), C_FIRST_INVERSION)
		).toThrow(/round\.expectations\[0\]\.content .*list/);
		expect(() =>
			compileFigure(
				figureExercise('placed-note', figureRound({ content: { from: 'name-of-item' } }), {
					main: 'c1'
				}),
				{ string: 3, fret: 5 }
			)
		).toThrow(/round\.expectations\[0\]\.content .*"name-of-item".*not a list/);
		// The figure in another meter than the one played.
		const threeFour: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
		expect(() =>
			compileFigure(
				figureExercise('figure', figureRound(), { main: 'c1' }),
				{ figureId: 'main' },
				null,
				threeFour
			)
		).toThrow(/round\.expectations\[0\]\.figure .*meter/);
		// A figure an item names, of a set whose items name none.
		expect(() =>
			compileFigure(
				figureExercise('note-on-string', figureRound({ figure: { item: 'figure' } }), {
					main: 'c1'
				}),
				{ string: 3, pitch: 'F' }
			)
		).toThrow(/round\.expectations\[0\]\.figure .*"figure".*not note-on-string/);
		// A figure without pitch read by { from: 'figure' }.
		const bare: ExerciseDefinition = {
			...figureExercise('note-on-string', figureRound({ content: { from: 'figure' } }), {}),
			figures: [{ id: 'main', figure: pitchless() }]
		};
		expect(() => compileFigure(bare, { string: 3, pitch: 'F' })).toThrow(
			/^test-note-on-string: round\.expectations\[0\]\.content reads the pitches/
		);
	});
});

/** A schema 1 figure: its notes carry no pitch. */
function pitchless(): Figure {
	const figure = parseLilyPond('c1');
	return {
		...figure,
		voices: figure.voices.map((voice) => ({
			...voice,
			elements: voice.elements.map((element) =>
				element.kind === 'note'
					? { kind: 'note', duration: element.duration, content: null }
					: element
			)
		}))
	};
}

describe('compileRound, a content written as a selection', () => {
	const F_ON_B = { string: 2, pitch: 'F' };
	/** LOCATE_ROUND whose one expectation asks `content`, heard by `sensor`. */
	const asking = (content: unknown, sensor = 'note'): RoundTemplate => ({
		...LOCATE_ROUND,
		expectations: [
			{ ...LOCATE_ROUND.expectations[0], sensor, content } as RoundTemplate['expectations'][0]
		]
	});
	const contentOf = (
		set: string,
		round: RoundTemplate,
		item: unknown,
		params: Record<string, unknown> = {}
	) =>
		compileRound(definition(set, round, params), planned(set, item, 4), meter, {
			previewBeats: PREVIEW,
			fromRunStart: null
		}).expectations[0].content;

	it('gives a member content, its index from the set’s default derivation', () => {
		expect(contentOf('note-on-string', asking({ family: 'note-places' }), F_ON_B)).toEqual({
			kind: 'member',
			value: {
				family: 'note-places',
				index: { pitch: 'F', string: 2 },
				selection: { family: 'note-places' }
			}
		});
	});

	it('takes the index from the derivation `of` names', () => {
		// D major with its root on the B string.
		const content = contentOf('voicing-on-strings', asking({ family: 'note-places', of: 'root' }), {
			voicingKey: KEY
		});
		expect(content).toEqual({
			kind: 'member',
			value: {
				family: 'note-places',
				index: { pitch: 'D', string: 2 },
				selection: { family: 'note-places' }
			}
		});
	});

	it('resolves the filters, the order and the take: written, read in the params, read on the item', () => {
		const round = asking(
			{
				family: 'note-places',
				where: [
					{ in: { strings: { item: 'string' }, frets: { param: 'zone' } } },
					{ at: { param: 'fret' } },
					{ other: 'previous' }
				],
				order: ['position'],
				take: { param: 'take' }
			},
			'note'
		);
		const content = contentOf('note-on-string', round, F_ON_B, { zone: [3, 7], fret: 6, take: 1 });
		expect(content).toEqual({
			kind: 'member',
			value: {
				family: 'note-places',
				index: { pitch: 'F', string: 2 },
				selection: {
					family: 'note-places',
					where: [{ in: { strings: [2], frets: [3, 7] } }, { at: 6 }, { other: 'previous' }],
					order: ['position'],
					take: 1
				}
			}
		});
	});

	it('drops a filter whose value the item does not carry', () => {
		const round = asking(
			{ family: 'chord-shapes', where: [{ at: { item: 'fret' } }, { other: 'previous' }] },
			'chord'
		);
		const selection = (item: unknown) =>
			(contentOf('voicing-on-strings', round, item)?.value as { selection: unknown }).selection;
		expect(selection({ voicingKey: KEY, fret: 7 })).toEqual({
			family: 'chord-shapes',
			where: [{ at: 7 }, { other: 'previous' }]
		});
		expect(selection({ voicingKey: KEY })).toEqual({
			family: 'chord-shapes',
			where: [{ other: 'previous' }]
		});
	});

	it('fails naming the exercise and the field', () => {
		expect(() => contentOf('note-on-string', asking({ family: 'nope' }), F_ON_B)).toThrow(
			/test-note-on-string: round\.expectations\[0\]\.content names family "nope"/
		);
		expect(() =>
			contentOf('note-on-string', asking({ family: 'note-places', take: { param: 'n' } }), F_ON_B)
		).toThrow(/test-note-on-string: round\.expectations\[0\]\.content\.take reads param "n"/);
	});

	it('compiles a zone that comes out reversed: it admits nothing (the load refuses one written so)', () => {
		const content = contentOf(
			'note-on-string',
			asking({ family: 'note-places', where: [{ in: { frets: [7, 3] } }] }),
			F_ON_B
		);
		expect((content?.value as { selection: unknown }).selection).toEqual({
			family: 'note-places',
			where: [{ in: { frets: [7, 3] } }]
		});
		expect(admittedMembers(content?.value as MemberContent)).toEqual([]);
	});
});

describe('a round of a passage', () => {
	const CHANGE_1 = { grid: 'iohefy-a', index: 1 };

	function inPassage(
		each: Record<string, unknown>,
		previous: string | null,
		strings: readonly number[] = [4, 3, 2]
	): PlannedItem {
		return {
			exerciseId: CLIMB_PASSAGES.id,
			skill: CLIMB_PASSAGES.practices,
			exerciseLevel: 0,
			item: CHANGE_1,
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null,
			passage: {
				id: 's:0',
				index: `grid=iohefy-a;strings=${strings.join()}`,
				of: { grid: 'iohefy-a', strings },
				rank: 1,
				length: 9,
				each,
				previous
			}
		};
	}

	// A change's length is measured on the old change item until the presenter serves the new one.
	const climb: ExerciseDefinition = {
		...CLIMB_PASSAGES,
		round: { ...CLIMB_PASSAGES.round!, length: { beats: 4 } }
	};

	const contentOf = (item: PlannedItem, cache?: ResolutionCache) =>
		compileRound(climb, item, meter, { previewBeats: 0, fromRunStart: null, cache }).expectations[0]
			.content!.value as MemberContent;

	it('reads the passage params last, over the resolved params', () => {
		const params = roundParamsOf(CLIMB_PASSAGES, inPassage({ direction: 'down' }, null), {
			previewBeats: 0
		});
		expect(params.direction).toBe('down');
	});

	it('derives the index from the passage’s values, and keeps the previous member by its identity', () => {
		const previous = chordShapes.members({ chord: triadOf('Dm'), strings: [4, 3, 2] })[0].id;
		expect(contentOf(inPassage({ direction: 'down' }, previous))).toEqual({
			family: 'chord-shapes',
			index: { chord: triadOf('G'), strings: [4, 3, 2] },
			selection: {
				family: 'chord-shapes',
				where: [{ position: { beyond: 'previous', toward: 'down', turns: true } }]
			},
			previous
		});
	});

	it('never caches what belongs to the item: the passage params, its values and its previous member', () => {
		const cache: ResolutionCache = new Map();
		const previous = chordShapes.members({ chord: triadOf('Dm'), strings: [3, 2, 1] })[0].id;
		const up = contentOf(inPassage({ direction: 'up' }, null, [3, 2, 1]), cache);
		const down = contentOf(inPassage({ direction: 'down' }, previous), cache);
		expect(up.selection.where).toEqual([
			{ position: { beyond: 'previous', toward: 'up', turns: true } }
		]);
		expect(up.previous).toBeNull();
		expect(up.index).toEqual({ chord: triadOf('G'), strings: [3, 2, 1] });
		expect(down.selection.where).toEqual([
			{ position: { beyond: 'previous', toward: 'down', turns: true } }
		]);
		expect(down.previous).toBe(previous);
		expect(down.index).toEqual({ chord: triadOf('G'), strings: [4, 3, 2] });
	});
});
