import { describe, expect, it } from 'vitest';
import {
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	type ExerciseDefinition
} from '$lib/domain/exercise';
import type { RhythmItem } from '$lib/domain/mechanics';
import { METER_4_4, type Meter } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { compileCycle } from './compileCycle';

function item(figureId: string, level: number): PlannedItem<RhythmItem> {
	return {
		exerciseId: 'x',
		mechanic: 'rhythm-figure',
		exerciseLevel: level,
		item: { figureId, level },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	};
}

/** Eighths over four bars: what both levels of the silent bars play. */
const EIGHTHS_4 = Array.from({ length: 32 }, (_, i) => (i === 0 ? '0' : fraction(i, 8))).join(' ');
const LINE_1 = '0 1/4 1/2 3/4 1 5/4 3/2 2 5/2 11/4 3 13/4 7/2 15/4';

function fraction(n: number, d: number): string {
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
	const g = gcd(n, d);
	return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`;
}

/**
 * What the former rhythm controller (before plan H6) compiled for the first cycle of a run of
 * each rhythm exercise, at its first level and its highest (frozen): its figure, length, muted
 * bars, window, and the place and bar of each expectation.
 */
const FROZEN: {
	exercise: ExerciseDefinition;
	level: number;
	figure: string;
	length: string;
	mutedBars: number[];
	window: { ms: number };
	at: string;
	bars: string;
}[] = [
	{
		exercise: RHYTHM_SILENT_BARS,
		level: 0,
		figure: 'eighths',
		length: '4',
		mutedBars: [0],
		window: { ms: 80 },
		at: EIGHTHS_4,
		bars: '00000000111111112222222233333333'
	},
	{
		exercise: RHYTHM_SILENT_BARS,
		level: 5,
		figure: 'eighths',
		length: '4',
		mutedBars: [0, 1, 2],
		window: { ms: 30 },
		at: EIGHTHS_4,
		bars: '00000000111111112222222233333333'
	},
	{
		exercise: RHYTHM_TWO_FOUR,
		level: 0,
		figure: 'line-1',
		length: '4',
		mutedBars: [],
		window: { ms: 80 },
		at: LINE_1,
		bars: '00001112223333'
	},
	{
		exercise: RHYTHM_TWO_FOUR,
		level: 2,
		figure: 'line-1',
		length: '4',
		mutedBars: [],
		window: { ms: 80 },
		at: LINE_1,
		bars: '00001112223333'
	},
	{
		exercise: RHYTHM_OFFBEATS,
		level: 0,
		figure: 'offbeats-1',
		length: '1',
		mutedBars: [],
		window: { ms: 80 },
		at: '0 1/8 3/8 5/8 7/8',
		bars: '00000'
	},
	{
		exercise: RHYTHM_OFFBEATS,
		level: 3,
		figure: 'offbeats-2',
		length: '2',
		mutedBars: [],
		window: { ms: 80 },
		at: '0 1/8 3/8 5/8 7/8 9/8 11/8 13/8 15/8',
		bars: '000001111'
	}
];

describe('compileCycle', () => {
	it.each(FROZEN.map((row) => [row.exercise.id, row.level, row] as const))(
		'compiles the first cycle of %s at level %i as the former rhythm controller did',
		(_, level, row) => {
			const plan = compileCycle(row.exercise, item(row.figure, level), METER_4_4);
			expect({
				length: plan.length.toString(),
				handover: plan.handover?.toString(),
				prompt: plan.prompt,
				mutedBars: plan.mutedBars,
				policy: plan.policy,
				at: plan.expectations.map((e) => e.at?.toString()).join(' '),
				bars: plan.expectations.map((e) => e.bar).join('')
			}).toEqual({
				length: row.length,
				handover: row.length,
				prompt: null,
				mutedBars: row.mutedBars,
				policy: {
					unit: 'cycle',
					pairing: { mode: 'alignment' },
					verdict: 'cycle',
					correction: false
				},
				at: row.at,
				bars: row.bars
			});
			for (const e of plan.expectations) {
				expect(e).toMatchObject({
					span: 'point',
					role: 'target',
					sensor: 'attack',
					content: null,
					window: row.window
				});
			}
		}
	);

	it('starts a later cycle where it falls in the loops of the figure and the accompaniment', () => {
		// The silent bars' second cycle of a run starts on bar 7 of the accompaniment: muted again.
		const second = compileCycle(RHYTHM_SILENT_BARS, item('eighths', 0), METER_4_4, 7);
		expect(second.mutedBars).toEqual([0]);
		// Started on bar 0 instead, the silence is its last bar.
		expect(compileCycle(RHYTHM_SILENT_BARS, item('eighths', 0), METER_4_4, 0).mutedBars).toEqual([
			3
		]);
	});

	it('refuses a figure the exercise does not write, or a meter it is not in', () => {
		expect(() => compileCycle(RHYTHM_OFFBEATS, item('nope', 0), METER_4_4)).toThrow(
			'rhythm-offbeats has no figure nope'
		);
		const threeFour: Meter = { count: 3, unit: METER_4_4.unit, grouping: [1, 1, 1] };
		expect(() => compileCycle(RHYTHM_OFFBEATS, item('offbeats-1', 0), threeFour)).toThrow(
			'not in the meter played'
		);
	});
});
