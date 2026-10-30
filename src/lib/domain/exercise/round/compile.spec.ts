import { describe, expect, it } from 'vitest';
import { gridById, gridChanges } from '$lib/domain/grid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { clickAccompaniment } from '../../time/accompaniment';
import type { Figure } from '../../time/figure';
import { Fraction } from '../../time/fraction';
import { METER_4_4, type Meter } from '../../time/meter';
import { parseLilyPond } from '../../time/notation/lilypond';
import type { ExerciseDefinition } from '../types';
import { DEFAULT_RESPONSE_WINDOWS } from '../windows';
import type { PlannedItem } from '../../types';
import { compileRound, roundParamsOf } from './compile';
import { freeTime, gridChange, onTheBeat, pointAt } from './testing/plans';
import type { FigureExpectationTemplate, RoundTemplate } from './types';

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
			content: { from: 'note-of-item' },
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
			content: { from: 'voicing-root' },
			window: { ms: { param: 'windows.perfectMs' } }
		},
		{
			at: { beats: { param: 'windows.anchorChordFromBeats' } },
			until: { bars: 1 },
			sensor: 'chord',
			content: { from: 'voicing-anywhere' },
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
			window: { ms: { param: 'recallThresholdMs' } }
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
	mechanic: string,
	round: RoundTemplate,
	params: Record<string, unknown> = {}
): ExerciseDefinition {
	return {
		id: `test-${mechanic}`,
		version: 1,
		mechanic,
		round,
		params: { pacing: { respirationBars: 1 }, recallThresholdMs: 1500, ...params }
	};
}

function planned<I>(mechanic: string, item: I, leadBeats: number | null = 4): PlannedItem<I> {
	return {
		exerciseId: `test-${mechanic}`,
		mechanic,
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
			definition('locate', LOCATE_ROUND),
			planned('locate', item, 4),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.of(-1),
			expectations: [pointAt('note', { kind: 'note', value: item })],
			length: Fraction.of(1),
			listenUntil: Fraction.of(1, 2),
			mutedBars: [],
			policy: onTheBeat(false)
		});
	});

	it('compiles an identify template to the free plan', () => {
		const item = { string: 3, fret: 5 };
		const plan = compileRound(
			definition('identify', IDENTIFY_ROUND),
			planned('identify', item, null),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.ZERO,
			expectations: [
				{
					...pointAt('tap', { kind: 'name', value: item }, null),
					window: { ms: 1500 }
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
			definition('triad-anchor', ANCHOR_ROUND),
			planned('triad-anchor', item, 2),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		// The template writes no listenBeforeEnd: absent means « listen to the end ».
		expect(plan).toEqual({
			prompt: Fraction.of(-1, 2),
			expectations: [
				pointAt('note', { kind: 'note', value: { string: 2, pitch: 'D' } }),
				{
					...pointAt(
						'chord',
						{ kind: 'chord-voicing', value: { voicingKey: KEY, position: null } },
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
					content: { from: 'voicing-at-position' },
					window: { ms: { param: 'windows.perfectMs' } }
				}
			]
		};
		const plan = compileRound(
			definition('triad-zone', zone),
			planned('triad-zone', item, 4),
			meter,
			{ previewBeats: PREVIEW, fromRunStart: null }
		);
		expect(plan).toEqual({
			prompt: Fraction.of(-1),
			expectations: [
				pointAt('chord', { kind: 'chord-voicing', value: { voicingKey: KEY, position: 7 } })
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
			definition('chord-grid', GRID_ROUND),
			planned('chord-grid', item, null),
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
		const written = definition('locate', LOCATE_ROUND, { windows: { perfectMs: 55 } });
		const plan = compileRound(written, planned('locate', item, 2), meter, {
			previewBeats: PREVIEW,
			fromRunStart: null
		});
		expect(plan.prompt).toEqual(Fraction.of(-2, 4));
		expect(plan.expectations[0].window).toEqual({ ms: 55 });
		expect(roundParamsOf(written, planned('locate', item, 8), { previewBeats: 3 })).toMatchObject({
			leadBeats: 8,
			previewBeats: 3,
			recallThresholdMs: 1500,
			windows: { perfectMs: 55, lateMs: DEFAULT_RESPONSE_WINDOWS.lateMs },
			pacing: { respirationBars: 1 }
		});
	});

	it('reads a window an exercise level overrides', () => {
		const item = { string: 3, pitch: 'F' };
		const leveled: ExerciseDefinition = {
			...definition('locate', LOCATE_ROUND, { windows: { perfectMs: 55 } }),
			levels: [{ params: {} }, { params: { 'windows.perfectMs': 40 } }]
		};
		const at = (exerciseLevel: number) =>
			compileRound(leveled, { ...planned('locate', item, 2), exerciseLevel }, meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			}).expectations[0].window;
		expect(at(0)).toEqual({ ms: 55 });
		expect(at(1)).toEqual({ ms: 40 });
	});

	it('reads a window an item level overrides', () => {
		const item = { string: 3, pitch: 'F' };
		const laddered = definition('locate', LOCATE_ROUND, {
			ladder: [
				{ params: { leadBeats: 4, aided: false } },
				{ params: { leadBeats: 2, aided: false, 'windows.perfectMs': 120 } }
			]
		});
		const at = (level: number | undefined) =>
			compileRound(laddered, { ...planned('locate', item, 2), level }, meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			}).expectations[0].window;
		expect(at(1)).toEqual({ ms: 120 });
		expect(at(0)).toEqual({ ms: DEFAULT_RESPONSE_WINDOWS.perfectMs });
		expect(at(undefined)).toEqual({ ms: DEFAULT_RESPONSE_WINDOWS.perfectMs });
	});

	it('places a target and ends the count where the template says', () => {
		const item = { string: 3, pitch: 'F' };
		const placed = definition('locate', {
			...LOCATE_ROUND,
			barOffset: '1/4',
			countEndsOn: 'target'
		});
		const plan = compileRound(placed, planned('locate', item, 4), meter, {
			previewBeats: PREVIEW,
			fromRunStart: null
		});
		expect(plan.barOffset).toEqual(Fraction.of(1, 4));
		expect(plan.countEndsOn).toBe('target');
		const plain = compileRound(
			definition('locate', LOCATE_ROUND),
			planned('locate', item, 4),
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
			compileRound(definition('locate', absent), planned('locate', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(
			/test-locate: round\.prompt\.lead reads param "windows\.nowhere", absent for locate item /
		);
		// A null value is as absent: identify without a recall threshold.
		const noThreshold = definition('identify', IDENTIFY_ROUND, { recallThresholdMs: undefined });
		expect(() =>
			compileRound(noThreshold, planned('identify', { string: 3, fret: 5 }, null), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(
			/test-identify: round\.expectations\[0\]\.window\.ms reads param "recallThresholdMs"/
		);
	});

	it('names the exercise and the field when a fraction is malformed', () => {
		const item = { string: 3, pitch: 'F' };
		const compiling = (round: RoundTemplate) => () =>
			compileRound(definition('locate', round), planned('locate', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			});
		expect(compiling({ ...LOCATE_ROUND, barOffset: 'a quarter' })).toThrow(
			/test-locate: round\.barOffset not a fraction: "a quarter"/
		);
		const gap: RoundTemplate = {
			...LOCATE_ROUND,
			expectations: [{ ...LOCATE_ROUND.expectations[0], window: { ofGap: '1,5' } }]
		};
		expect(compiling(gap)).toThrow(
			/test-locate: round\.expectations\[0\]\.window\.ofGap not a fraction: "1,5"/
		);
	});

	it('names the exercise when the compiled plan is invalid', () => {
		const item = { string: 3, pitch: 'F' };
		const outside: RoundTemplate = {
			...LOCATE_ROUND,
			expectations: [{ ...LOCATE_ROUND.expectations[0], at: { bars: 5 } }]
		};
		expect(() =>
			compileRound(definition('locate', outside), planned('locate', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(/test-locate: .*outside the plan length/);
	});

	it('refuses an exercise without a round, and a derivation that reads another mechanic', () => {
		const item = { string: 3, pitch: 'F' };
		const bare: ExerciseDefinition = { id: 'bare', version: 1, mechanic: 'locate', params: {} };
		expect(() =>
			compileRound(bare, planned('locate', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(/bare: .*no round/);
		expect(() =>
			compileRound(definition('identify', LOCATE_ROUND), planned('identify', item, 4), meter, {
				previewBeats: PREVIEW,
				fromRunStart: null
			})
		).toThrow(/test-identify: round\.expectations\[0\]\.content derives "note-of-item".*identify/);
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
	mechanic: string,
	round: RoundTemplate,
	figures: Record<string, string>,
	params: Record<string, unknown> = {}
): ExerciseDefinition {
	return {
		...definition(mechanic, round, params),
		figures: Object.entries(figures).map(([id, text]) => ({ id, figure: parseLilyPond(text) }))
	};
}

const C_FIRST_INVERSION = { voicing: 'C|maj|3:3,2:5,1:1', occurrence: 0 };

/** Compiles `round` over `item`, from `fromRunStart` bars into its run. */
function compileFigure(
	exercise: ExerciseDefinition,
	item: unknown,
	fromRunStart: number | null = null,
	meter: Meter = METER_4_4
) {
	return compileRound(exercise, planned(exercise.mechanic, item, null), meter, {
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
			figureExercise('rhythm-figure', figureRound(), { main: 'c8 c c c c c c c' }),
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
		const twoBars = figureExercise('rhythm-figure', figureRound({}, { length: { bars: 2 } }), {
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
			'rhythm-figure',
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

	it('spreads the derived notes by the pattern', () => {
		const exercise = figureExercise(
			'voicing-figure',
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
			'voicing-figure',
			figureRound({ sensor: 'note', content: { from: 'voicing-notes' } }),
			{ main: 'c8 c c c c c r4' }
		);
		expect(midis(compileFigure(exercise, C_FIRST_INVERSION))).toEqual([64, 67, 72, 64, 67, 72]);
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
				{ ...planned('locate', { string: 3, pitch: 'F' }, null), exerciseLevel },
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

		const byItem = figureExercise('rhythm-figure', figureRound({ figure: { item: 'figure' } }), {
			quarters: 'c4 c c c',
			eighths: 'c8 c c c c c c c'
		});
		expect(compileFigure(byItem, { figureId: 'eighths' }).expectations).toHaveLength(8);
		expect(compileFigure(byItem, { figureId: 'quarters' }).expectations).toHaveLength(4);
	});

	it('gives a null prompt when the template writes none', () => {
		const plan = compileFigure(figureExercise('rhythm-figure', figureRound(), { main: 'c1' }), {
			figureId: 'main'
		});
		expect(plan.prompt).toBeNull();
		const prompted = compileFigure(
			figureExercise('rhythm-figure', figureRound({}, { prompt: { lead: 2 } }), { main: 'c1' }),
			{ figureId: 'main' }
		);
		expect(prompted.prompt).toEqual(Fraction.of(-1, 2));
	});

	it("takes the muted bars from the accompaniment's off bars", () => {
		const exercise = figureExercise(
			'rhythm-figure',
			figureRound({}, { length: { bars: 4 }, accompaniment: { param: 'accompaniment' } }),
			{ main: 'c1' },
			{ accompaniment: THREE_ONE }
		);
		expect(compileFigure(exercise, { figureId: 'main' }, 2).mutedBars).toEqual([1]);
		// Written muted bars win over the accompaniment's.
		const written = figureExercise(
			'rhythm-figure',
			figureRound({}, { length: { bars: 4 }, accompaniment: THREE_ONE, mutedBars: [2] }),
			{ main: 'c1' }
		);
		expect(compileFigure(written, { figureId: 'main' }).mutedBars).toEqual([2]);
		// No accompaniment: no muted bar, the round from its start.
		expect(
			compileFigure(figureExercise('rhythm-figure', figureRound(), { main: 'c1' }), {
				figureId: 'main'
			}).mutedBars
		).toEqual([]);
	});

	it('fails naming the exercise and the field', () => {
		const voicing = (entry: Partial<FigureExpectationTemplate>, text = 'c8 c c c r2') =>
			figureExercise('voicing-figure', figureRound({ sensor: 'note', ...entry }), { main: text });
		expect(() =>
			compileFigure(
				voicing({ content: { from: 'voicing-notes', pattern: [1, 4] } }),
				C_FIRST_INVERSION
			)
		).toThrow(/test-voicing-figure: round\.expectations\[0\]\.content\.pattern .*4.*3 notes/);
		expect(() => compileFigure(voicing({ figure: { id: 'nowhere' } }), C_FIRST_INVERSION)).toThrow(
			/test-voicing-figure: round\.expectations\[0\]\.figure .*"nowhere"/
		);
		const threeBars = figureExercise('rhythm-figure', figureRound({}, { length: { bars: 3 } }), {
			main: 'c1 | c1'
		});
		expect(() => compileFigure(threeBars, { figureId: 'main' })).toThrow(
			/test-rhythm-figure: round\.expectations\[0\]\.figure .*whole number/
		);
		// Review Focus: an occurrence the neck does not hold fails at compilation, naming the item.
		expect(() =>
			compileFigure(voicing({ content: { from: 'voicing-notes' } }), {
				...C_FIRST_INVERSION,
				occurrence: 1
			})
		).toThrow(
			/test-voicing-figure: round\.expectations\[0\]\.content derives "voicing-notes" for voicing-figure item C\|maj\|3:3,2:5,1:1@1: .*[Oo]ccurrence 1/
		);
		// A list on a point, a single content on a figure.
		const point: RoundTemplate = {
			...figureRound(),
			expectations: [
				{ at: { beats: 0 }, sensor: 'note', content: { from: 'voicing-notes' }, window: { ms: 80 } }
			]
		};
		expect(() =>
			compileFigure(figureExercise('voicing-figure', point, {}), C_FIRST_INVERSION)
		).toThrow(/round\.expectations\[0\]\.content .*list/);
		expect(() =>
			compileFigure(
				figureExercise('locate', figureRound({ content: { from: 'note-of-item' } }), {
					main: 'c1'
				}),
				{ string: 3, pitch: 'F' }
			)
		).toThrow(/round\.expectations\[0\]\.content .*"note-of-item".*not a list/);
		// The figure in another meter than the one played.
		const threeFour: Meter = { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] };
		expect(() =>
			compileFigure(
				figureExercise('rhythm-figure', figureRound(), { main: 'c1' }),
				{ figureId: 'main' },
				null,
				threeFour
			)
		).toThrow(/round\.expectations\[0\]\.figure .*meter/);
		// A figure an item names, of a mechanic whose items name none.
		expect(() =>
			compileFigure(
				figureExercise('locate', figureRound({ figure: { item: 'figure' } }), { main: 'c1' }),
				{ string: 3, pitch: 'F' }
			)
		).toThrow(/round\.expectations\[0\]\.figure .*"figure".*not locate/);
		// A figure without pitch read by { from: 'figure' }.
		const bare: ExerciseDefinition = {
			...figureExercise('locate', figureRound({ content: { from: 'figure' } }), {}),
			figures: [{ id: 'main', figure: pitchless() }]
		};
		expect(() => compileFigure(bare, { string: 3, pitch: 'F' })).toThrow(
			/^test-locate: round\.expectations\[0\]\.content reads the pitches/
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
