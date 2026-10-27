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
import { GESTURE_EXERCISES, gesturePlan } from '$lib/domain/gesture';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { NAME_CONTENT, NOTE_CONTENT, CHORD_VOICING_CONTENT } from '$lib/domain/judges';
import { Fraction, METER_4_4 } from '$lib/domain/time';
import type { RoundPlan } from '$lib/domain/time/plan';
import type { PlannedItem } from '$lib/domain/types';
import { ladderOf } from './ladder';
import { pacingOf } from './pacing';
import { recallThresholdOf } from './recall';
import { compileRound } from './round';
import { anchorPlan, beatPlan, freePlan } from './roundPlans';
import { windowsOf } from './windows';
import type { ExerciseDefinition } from './types';

describe('exercise catalog', () => {
	it('describes the two neck exercises', () => {
		expect(LOCATE_NECK).toEqual({
			id: 'locate-neck',
			version: 1,
			mechanic: 'locate',
			view: 'note-lane',
			tempo: { fixed: 80 },
			round: LOCATE_NECK.round,
			params: { recallThresholdMs: 1500, ladder: ladderOf(LOCATE_NECK) }
		});
		expect(IDENTIFY_NECK).toEqual({
			id: 'identify-neck',
			version: 1,
			mechanic: 'identify',
			view: 'answer-keys',
			round: IDENTIFY_NECK.round,
			params: { recallThresholdMs: 3000, ladder: ladderOf(IDENTIFY_NECK) }
		});
	});

	it('finds an exercise by id and throws on an unknown one', () => {
		expect(exerciseById('identify-neck')).toBe(IDENTIFY_NECK);
		expect(() => exerciseById('nope')).toThrow(/nope/);
	});

	it('describes the two triads exercises of the memory track, each with its rhythm', () => {
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
			tempo: { fixed: 80 },
			round: TRIADS_ANCHOR.round,
			params
		});
		expect(TRIADS_ZONE).toEqual({
			id: 'triads-zone',
			version: 1,
			mechanic: 'triad-zone',
			tempo: { fixed: 80 },
			round: TRIADS_ZONE.round,
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

	it('compiles every response exercise of the catalog to the plan its builder gives', () => {
		const meter = METER_4_4;
		const previewBeats = 2;
		const planned = (
			definition: ExerciseDefinition,
			item: unknown,
			leadBeats: number | null
		): PlannedItem => ({
			exerciseId: definition.id,
			mechanic: definition.mechanic,
			item,
			phase: 'learning',
			temperature: 'hot',
			aid: 'none',
			leadBeats
		});
		const compiled = (definition: ExerciseDefinition, item: unknown, leadBeats: number | null) =>
			compileRound(definition, planned(definition, item, leadBeats), meter, { previewBeats });
		const withoutListenUntil = (plan: RoundPlan): RoundPlan => {
			const { listenUntil: _, ...rest } = plan;
			return rest;
		};
		const key = 'D|maj|3:5,2:1,1:3';

		// Locate: at the first and the top level of its ladder.
		const note = { string: 3, pitch: 'F' };
		for (const lead of ladderOf(LOCATE_NECK).map((level) => level.params.leadBeats as number)) {
			expect(compiled(LOCATE_NECK, note, lead)).toEqual(
				beatPlan({
					content: { kind: NOTE_CONTENT, value: note },
					leadBeats: lead,
					meter,
					respirationBars: pacingOf(LOCATE_NECK).respirationBars,
					windows: windowsOf(LOCATE_NECK),
					previewBeats
				})
			);
		}

		// Identify: in free time, one plan for every level.
		const name = { string: 3, fret: 5 };
		expect(compiled(IDENTIFY_NECK, name, null)).toEqual(
			freePlan({
				content: { kind: NAME_CONTENT, value: name },
				recallThresholdMs: recallThresholdOf(IDENTIFY_NECK) as number
			})
		);

		// The anchor: the root on the beat, the chord from beat 2 to the end of the bar.
		for (const lead of [8, 2]) {
			expect(compiled(TRIADS_ANCHOR, { voicingKey: key }, lead)).toEqual(
				withoutListenUntil(
					anchorPlan({
						root: { kind: NOTE_CONTENT, value: { string: 2, pitch: 'D' } },
						chord: { kind: CHORD_VOICING_CONTENT, value: { voicingKey: key, position: null } },
						leadBeats: lead,
						meter,
						respirationBars: pacingOf(TRIADS_ANCHOR).respirationBars,
						windows: windowsOf(TRIADS_ANCHOR),
						previewBeats
					})
				)
			);
		}

		// The zone: a beat plan heard by the chord sensor.
		const voicing = { voicingKey: key, position: 7 };
		const zone = beatPlan({
			content: { kind: CHORD_VOICING_CONTENT, value: voicing },
			leadBeats: 4,
			meter,
			respirationBars: pacingOf(TRIADS_ZONE).respirationBars,
			windows: windowsOf(TRIADS_ZONE),
			previewBeats
		});
		expect(compiled(TRIADS_ZONE, voicing, 4)).toEqual(
			withoutListenUntil({
				...zone,
				expectations: zone.expectations.map((e) => ({ ...e, sensor: 'chord' }))
			})
		);

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
			expect(compiled(exercise, change, null)).toEqual(gesturePlan(change, meter, exercise));
		}
	});

	it('plays locate and the triads at 80 bpm, fixed', () => {
		for (const exercise of [LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE]) {
			expect(exercise.tempo).toEqual({ fixed: 80 });
		}
	});
});
