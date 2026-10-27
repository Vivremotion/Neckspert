import { describe, expect, it } from 'vitest';
import { gridById, gridChanges } from '$lib/domain/grid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { Fraction } from '../../time/fraction';
import { METER_4_4 } from '../../time/meter';
import type { RoundPlan } from '../../time/plan';
import type { ExerciseDefinition } from '../types';
import { DEFAULT_RESPONSE_WINDOWS } from '../windows';
import { anchorPlan, beatPlan, freePlan, gridChangePlan } from '../roundPlans';
import type { PlannedItem } from '../../types';
import { compileRound, roundParamsOf } from './compile';
import type { RoundTemplate } from './types';

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
		item,
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		leadBeats
	};
}

const withoutListenUntil = (plan: RoundPlan): RoundPlan => {
	const { listenUntil: _, ...rest } = plan;
	return rest;
};

describe('compileRound', () => {
	it('compiles a locate template to the beat plan', () => {
		const item = { string: 3, pitch: 'F' };
		const plan = compileRound(
			definition('locate', LOCATE_ROUND),
			planned('locate', item, 4),
			meter,
			{ previewBeats: PREVIEW }
		);
		expect(plan).toEqual(
			beatPlan({
				content: { kind: 'note', value: item },
				leadBeats: 4,
				meter,
				respirationBars: 1,
				windows: DEFAULT_RESPONSE_WINDOWS,
				previewBeats: PREVIEW
			})
		);
	});

	it('compiles an identify template to the free plan', () => {
		const item = { string: 3, fret: 5 };
		const plan = compileRound(
			definition('identify', IDENTIFY_ROUND),
			planned('identify', item, null),
			meter,
			{ previewBeats: PREVIEW }
		);
		expect(plan).toEqual(
			freePlan({ content: { kind: 'name', value: item }, recallThresholdMs: 1500 })
		);
	});

	it('compiles an anchor template to the anchor plan: root on the beat, chord from beat 2 to the bar end', () => {
		const item = { voicingKey: KEY };
		const plan = compileRound(
			definition('triad-anchor', ANCHOR_ROUND),
			planned('triad-anchor', item, 2),
			meter,
			{ previewBeats: PREVIEW }
		);
		const expected = anchorPlan({
			root: { kind: 'note', value: { string: 2, pitch: 'D' } },
			chord: { kind: 'chord-voicing', value: { voicingKey: KEY, position: null } },
			leadBeats: 2,
			meter,
			respirationBars: 1,
			windows: DEFAULT_RESPONSE_WINDOWS,
			previewBeats: PREVIEW
		});
		// The template writes no listenBeforeEnd: absent means « listen to the end ».
		expect(plan).toEqual(withoutListenUntil(expected));
		expect(plan.expectations[1].at).toEqual(Fraction.of(1, 4));
		expect(plan.expectations[1].span).toEqual({ until: Fraction.of(1) });
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
			{ previewBeats: PREVIEW }
		);
		const expected = beatPlan({
			content: { kind: 'chord-voicing', value: { voicingKey: KEY, position: 7 } },
			leadBeats: 4,
			meter,
			respirationBars: 1,
			windows: DEFAULT_RESPONSE_WINDOWS,
			previewBeats: PREVIEW
		});
		expect(plan).toEqual(
			withoutListenUntil({
				...expected,
				expectations: expected.expectations.map((e) => ({ ...e, sensor: 'chord' }))
			})
		);
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
			{ previewBeats: PREVIEW }
		);
		expect(plan).toEqual(
			gridChangePlan({
				content: { kind: 'chord-grid', value: item },
				lengthBeats: 4,
				meter,
				windows: DEFAULT_RESPONSE_WINDOWS
			})
		);
	});

	it('reads a number a level gives (the lead) and one a definition writes (a window)', () => {
		const item = { string: 3, pitch: 'F' };
		const written = definition('locate', LOCATE_ROUND, { windows: { perfectMs: 55 } });
		const plan = compileRound(written, planned('locate', item, 2), meter, {
			previewBeats: PREVIEW
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

	it('places a target and ends the count where the template says', () => {
		const item = { string: 3, pitch: 'F' };
		const placed = definition('locate', {
			...LOCATE_ROUND,
			barOffset: '1/4',
			countEndsOn: 'target'
		});
		const plan = compileRound(placed, planned('locate', item, 4), meter, {
			previewBeats: PREVIEW
		});
		expect(plan.barOffset).toEqual(Fraction.of(1, 4));
		expect(plan.countEndsOn).toBe('target');
		const plain = compileRound(
			definition('locate', LOCATE_ROUND),
			planned('locate', item, 4),
			meter,
			{ previewBeats: PREVIEW }
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
				previewBeats: PREVIEW
			})
		).toThrow(
			/test-locate: round\.prompt\.lead reads param "windows\.nowhere", absent for locate item /
		);
		// A null value is as absent: identify without a recall threshold.
		const noThreshold = definition('identify', IDENTIFY_ROUND, { recallThresholdMs: undefined });
		expect(() =>
			compileRound(noThreshold, planned('identify', { string: 3, fret: 5 }, null), meter, {
				previewBeats: PREVIEW
			})
		).toThrow(
			/test-identify: round\.expectations\[0\]\.window\.ms reads param "recallThresholdMs"/
		);
	});

	it('names the exercise and the field when a fraction is malformed', () => {
		const item = { string: 3, pitch: 'F' };
		const compiling = (round: RoundTemplate) => () =>
			compileRound(definition('locate', round), planned('locate', item, 4), meter, {
				previewBeats: PREVIEW
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
				previewBeats: PREVIEW
			})
		).toThrow(/test-locate: .*outside the plan length/);
	});

	it('refuses an exercise without a round, and a derivation that reads another mechanic', () => {
		const item = { string: 3, pitch: 'F' };
		const bare: ExerciseDefinition = { id: 'bare', version: 1, mechanic: 'locate', params: {} };
		expect(() =>
			compileRound(bare, planned('locate', item, 4), meter, { previewBeats: PREVIEW })
		).toThrow(/bare: .*no round/);
		expect(() =>
			compileRound(definition('identify', LOCATE_ROUND), planned('identify', item, 4), meter, {
				previewBeats: PREVIEW
			})
		).toThrow(/test-identify: round\.expectations\[0\]\.content derives "note-of-item".*identify/);
	});
});
