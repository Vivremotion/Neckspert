import { describe, expect, it } from 'vitest';
import { allExercises, exerciseById, exerciseSessionExercises } from './registry';
import { passageIndices, passageMembers } from './passage/indices';
import { firstEach, passageRound } from './passage/round';
import { passageDerivation } from '$lib/domain/families';
import { Fraction, METER_4_4 } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { ladderOf } from './ladder';
import { pacingOf } from './pacing';
import { GUITAR_DERIVATIONS } from '$lib/domain/families/guitar/derivations';
import { compileRound } from './round';
import { freeTime, gridChange, onTheBeat, pointAt } from './round/testing/plans';
import type { ExerciseDefinition } from './types';
import {
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE,
	RHYTHM_EXERCISES,
	GESTURE_EXERCISES
} from '$lib/testing/catalog';

describe('exercise catalog', () => {
	it('describes the two neck exercises', () => {
		expect(LOCATE_NECK).toEqual({
			id: 'locate-note-string',
			practices: 'locate-note-string',
			view: 'lane',
			tempo: 80,
			round: LOCATE_NECK.round,
			presentation: LOCATE_NECK.presentation,
			items: LOCATE_NECK.items,
			params: { ladder: ladderOf(LOCATE_NECK) }
		});
		expect(IDENTIFY_NECK).toEqual({
			id: 'identify-note',
			practices: 'identify-note',
			view: 'answer-keys',
			round: IDENTIFY_NECK.round,
			presentation: IDENTIFY_NECK.presentation,
			items: IDENTIFY_NECK.items,
			params: { ladder: ladderOf(IDENTIFY_NECK), learning: IDENTIFY_NECK.params.learning }
		});
	});

	it('finds an exercise by id and throws on an unknown one', () => {
		expect(exerciseById('identify-note')).toBe(IDENTIFY_NECK);
		expect(() => exerciseById('nope')).toThrow(/nope/);
	});

	it('describes the two triads exercises of the memory track, each with its rhythm, on the lane', () => {
		const params = {
			pacing: { respirationBars: 1 },
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
			id: 'chord-anchor',
			practices: 'chord-anchor',
			view: 'lane',
			tempo: 80,
			round: TRIADS_ANCHOR.round,
			presentation: TRIADS_ANCHOR.presentation,
			items: TRIADS_ANCHOR.items,
			params: { ...params, learning: TRIADS_ANCHOR.params.learning }
		});
		expect(TRIADS_ZONE).toEqual({
			id: 'chord-zone',
			practices: 'chord-zone',
			view: 'lane',
			tempo: 80,
			round: TRIADS_ZONE.round,
			presentation: TRIADS_ZONE.presentation,
			items: TRIADS_ZONE.items,
			params: { ...params, learning: TRIADS_ZONE.params.learning }
		});
		expect(exerciseById('chord-zone')).toBe(TRIADS_ZONE);
		expect(pacingOf(TRIADS_ANCHOR)).toEqual(params.pacing);
		expect(TRIADS_ANCHOR.params).not.toBe(TRIADS_ZONE.params);
	});

	it('writes every exercise as plain data', () => {
		// Fractions are written as text (`1/4`, `0`) and read back as fractions; no other text in
		// the catalog looks like one.
		const fractionsBack = (_key: string, value: unknown) =>
			typeof value === 'string' && /^-?\d+(\/\d+)?$/.test(value) ? Fraction.parse(value) : value;
		expect(JSON.parse(JSON.stringify(allExercises()), fractionsBack)).toEqual(allExercises());
		// A round template holds no fraction object: it goes through JSON as it is.
		const rounds = allExercises().filter((exercise) => exercise.round);
		expect(rounds).toHaveLength(11);
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
			skill: definition.practices,
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
				expectations: [
					pointAt('note', {
						kind: 'member',
						value: { family: 'note-places', index: note, selection: { family: 'note-places' } }
					})
				],
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
									index: GUITAR_DERIVATIONS.voicing.index({ voicingKey: key }),
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
		}

		// The zone: a beat plan heard by the chord sensor, the shape that covers the fret named.
		const voicing = { voicingKey: key, position: 7, fret: 8 };
		expect(compiled(TRIADS_ZONE, voicing, 4)).toEqual({
			prompt: Fraction.of(-1),
			expectations: [
				pointAt('chord', {
					kind: 'member',
					value: {
						family: 'chord-shapes',
						index: GUITAR_DERIVATIONS.voicing.index(voicing),
						selection: { family: 'chord-shapes', where: [{ at: 8 }] }
					}
				})
			],
			length: Fraction.of(1),
			mutedBars: [],
			policy: onTheBeat(false)
		});

		// The changes: the second round of the first passage of each, a bar long, its chord's shapes.
		for (const exercise of GESTURE_EXERCISES) {
			const [index] = passageIndices(exercise);
			const each = firstEach(exercise);
			const derivation = passageDerivation(exercise.passages!.members.family)!;
			const items = passageMembers(exercise, index, each).map((m) => derivation.itemOf(m));
			const round = passageRound(exercise, index, each, items[1], 1, items.length);
			expect(compileRound(exercise, round, meter, { previewBeats, fromRunStart: null })).toEqual({
				prompt: Fraction.of(-1, 4),
				expectations: [
					pointAt('chord', {
						kind: 'member',
						value: expect.objectContaining({ family: 'chord-shapes', previous: null })
					})
				],
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

describe('exerciseSessionExercises', () => {
	it('lists the exercises whose round writes a figure and that write levels, in catalog order', () => {
		expect(exerciseSessionExercises()).toEqual([...RHYTHM_EXERCISES]);
		// Levels, but no figure: the gesture is played in its own sessions.
		expect(exerciseSessionExercises()).not.toEqual(expect.arrayContaining([GESTURE_EXERCISES[0]]));
		expect(exerciseSessionExercises()).not.toContain(LOCATE_NECK);
	});
});
