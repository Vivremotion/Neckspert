import { describe, expect, it } from 'vitest';
import {
	EXERCISES,
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	exerciseById
} from './catalog';
import { gridById, gridChanges } from '$lib/domain/grid';
import { GESTURE_EXERCISES } from '$lib/domain/gesture';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { Fraction, METER_4_4 } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { ladderOf } from './ladder';
import { pacingOf } from './pacing';
import { compileRound } from './round';
import { freeTime, gridChange, onTheBeat, pointAt } from './round/testing/plans';
import type { ExerciseDefinition } from './types';

describe('exercise catalog', () => {
	it('describes the two neck exercises', () => {
		expect(LOCATE_NECK).toEqual({
			id: 'locate-neck',
			version: 1,
			mechanic: 'locate',
			view: 'lane',
			tempo: 80,
			round: LOCATE_NECK.round,
			presentation: LOCATE_NECK.presentation,
			params: { recallThresholdMs: 1500, ladder: ladderOf(LOCATE_NECK) }
		});
		expect(IDENTIFY_NECK).toEqual({
			id: 'identify-neck',
			version: 1,
			mechanic: 'identify',
			view: 'answer-keys',
			round: IDENTIFY_NECK.round,
			presentation: IDENTIFY_NECK.presentation,
			params: { recallThresholdMs: 3000, ladder: ladderOf(IDENTIFY_NECK) }
		});
	});

	it('finds an exercise by id and throws on an unknown one', () => {
		expect(exerciseById('identify-neck')).toBe(IDENTIFY_NECK);
		expect(() => exerciseById('nope')).toThrow(/nope/);
	});

	it('describes the two triads exercises of the memory track, each with its rhythm, on the lane', () => {
		const params = {
			stringSets: [
				[3, 2, 1],
				[4, 3, 2]
			],
			qualities: ['maj', 'min'],
			pacing: { respirationBars: 1 },
			recallThresholdMs: 1500,
			ladder: [
				{ params: { leadBeats: 8, aided: true }, pass: { successes: 1 }, drop: { failures: 1 } },
				{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 }, drop: { failures: 1 } },
				{
					params: { leadBeats: 2, aided: false },
					pass: { successes: 2 },
					drop: { failures: 1 },
					success: 'direct-recall'
				}
			]
		};
		expect(TRIADS_ANCHOR).toEqual({
			id: 'triads-anchor',
			version: 1,
			mechanic: 'triad-anchor',
			view: 'lane',
			tempo: 80,
			round: TRIADS_ANCHOR.round,
			presentation: TRIADS_ANCHOR.presentation,
			params
		});
		expect(TRIADS_ZONE).toEqual({
			id: 'triads-zone',
			version: 1,
			mechanic: 'triad-zone',
			view: 'lane',
			tempo: 80,
			round: TRIADS_ZONE.round,
			presentation: TRIADS_ZONE.presentation,
			params
		});
		expect(exerciseById('triads-zone')).toBe(TRIADS_ZONE);
		expect(pacingOf(TRIADS_ANCHOR)).toEqual(params.pacing);
		expect(TRIADS_ANCHOR.params).not.toBe(TRIADS_ZONE.params);
	});

	it('writes every exercise as plain data', () => {
		// Fractions are written as text (`1/4`, `0`) and read back as fractions; no other text in
		// the catalog looks like one.
		const fractionsBack = (_key: string, value: unknown) =>
			typeof value === 'string' && /^-?\d+(\/\d+)?$/.test(value) ? Fraction.parse(value) : value;
		expect(JSON.parse(JSON.stringify(EXERCISES), fractionsBack)).toEqual(EXERCISES);
		// A round template holds no fraction object: it goes through JSON as it is.
		const rounds = EXERCISES.filter((exercise) => exercise.round);
		expect(rounds).toHaveLength(8);
		for (const { round } of rounds) expect(JSON.parse(JSON.stringify(round))).toEqual(round);
	});

	it('compiles every response exercise of the catalog to the plan written here in full', () => {
		const meter = METER_4_4;
		const previewBeats = 2;
		const planned = (
			definition: ExerciseDefinition,
			item: unknown,
			leadBeats: number | null
		): PlannedItem => ({
			exerciseId: definition.id,
			mechanic: definition.mechanic,
			exerciseLevel: 0,
			item,
			phase: 'learning',
			temperature: 'hot',
			aid: 'none',
			leadBeats
		});
		const compiled = (definition: ExerciseDefinition, item: unknown, leadBeats: number | null) =>
			compileRound(definition, planned(definition, item, leadBeats), meter, {
				previewBeats,
				fromRunStart: null
			});
		const key = 'D|maj|3:5,2:1,1:3';

		// Locate, at each level of its ladder: the prompt `lead` beats ahead, one bar of breath,
		// listening stopped at the next prompt's preview.
		const note = { string: 3, pitch: 'F' };
		expect(ladderOf(LOCATE_NECK).map((level) => level.params.leadBeats)).toEqual([8, 4, 2]);
		for (const lead of [8, 4, 2]) {
			expect(compiled(LOCATE_NECK, note, lead)).toEqual({
				prompt: Fraction.of(-lead, 4),
				expectations: [pointAt('note', { kind: 'note', value: note })],
				length: Fraction.of(1),
				listenUntil: Fraction.of(1, 2),
				mutedBars: [],
				policy: onTheBeat(false)
			});
		}

		// Identify: in free time, one plan for every level, within the recall threshold.
		const name = { string: 3, fret: 5 };
		expect(compiled(IDENTIFY_NECK, name, null)).toEqual({
			prompt: Fraction.ZERO,
			expectations: [
				{ ...pointAt('tap', { kind: 'name', value: name }, null), window: { ms: 3000 } }
			],
			length: Fraction.of(1),
			mutedBars: [],
			policy: freeTime
		});

		// The anchor: the root on the beat, the chord from beat 2 to the end of the bar.
		for (const lead of [8, 2]) {
			expect(compiled(TRIADS_ANCHOR, { voicingKey: key }, lead)).toEqual({
				prompt: Fraction.of(-lead, 4),
				expectations: [
					pointAt('note', { kind: 'note', value: { string: 2, pitch: 'D' } }),
					{
						...pointAt(
							'chord',
							{ kind: 'chord-voicing', value: { voicingKey: key, position: null } },
							Fraction.of(1, 4)
						),
						span: { until: Fraction.of(1) }
					}
				],
				length: Fraction.of(2),
				mutedBars: [],
				policy: onTheBeat(true)
			});
		}

		// The zone: a beat plan heard by the chord sensor.
		const voicing = { voicingKey: key, position: 7 };
		expect(compiled(TRIADS_ZONE, voicing, 4)).toEqual({
			prompt: Fraction.of(-1),
			expectations: [pointAt('chord', { kind: 'chord-voicing', value: voicing })],
			length: Fraction.of(1),
			mutedBars: [],
			policy: onTheBeat(false)
		});

		// The gesture: a change of a grid, whichever exercise plays it.
		const changes = gridChanges(gridById('iohefy-a'));
		const change: ChordGridItem = {
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
		for (const exercise of GESTURE_EXERCISES) {
			expect(compiled(exercise, change, null)).toEqual({
				prompt: Fraction.of(-1, 4),
				expectations: [pointAt('chord', { kind: 'chord-grid', value: change })],
				length: Fraction.of(1),
				handover: Fraction.of(1),
				mutedBars: [],
				countEndsOn: 'target',
				policy: gridChange
			});
		}
	});

	it('plays locate and the triads at 80 bpm, fixed', () => {
		for (const exercise of [LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE]) {
			expect(exercise.tempo).toBe(80);
		}
	});
});
