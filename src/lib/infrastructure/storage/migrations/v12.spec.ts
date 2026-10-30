import { describe, expect, it } from 'vitest';
import { roundPlanFromRecord } from '$lib/application/session/series/recordResponse';
import { RHYTHM_EXERCISES } from '$lib/domain/exercise';
import { compileRound } from '$lib/domain/exercise/round';
import { figureRules } from '$lib/domain/mechanics';
import {
	Fraction,
	METER_4_4,
	figureExpectations,
	figureToJson,
	type Figure
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { CYCLE_PLANS_V11, makeBackupV7, makeCycleAttemptV11 } from '../testing/fixtures';
import {
	FIGURE_MECHANIC_V12,
	RHYTHM_FIGURE_MECHANIC_V11,
	RHYTHM_SENSOR_V11,
	attemptToV12,
	backupV7ToV8,
	cyclePlanToV12,
	type CyclePlanRecordV11
} from './v12';

function exerciseOf(id: string) {
	const exercise = RHYTHM_EXERCISES.find((candidate) => candidate.id === id);
	if (!exercise) throw new Error(`no rhythm exercise ${id}`);
	return exercise;
}

function itemOf(exerciseId: string, figureId: string, level: number): PlannedItem {
	return {
		exerciseId,
		mechanic: 'figure',
		exerciseLevel: level,
		item: { figureId, level },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	};
}

describe('cyclePlanToV12', () => {
	for (const { exerciseId, level, figureId, record } of CYCLE_PLANS_V11) {
		it(`rewrites a stored cycle plan as the round plan it judged (${exerciseId})`, () => {
			const rewritten = cyclePlanToV12(record);
			const compiled = compileRound(
				exerciseOf(exerciseId),
				itemOf(exerciseId, figureId, level),
				METER_4_4,
				{ previewBeats: 0, fromRunStart: record.startBar }
			);
			expect(roundPlanFromRecord(rewritten)).toEqual(compiled);
			// What it played at, which the round plan alone does not say.
			expect(rewritten).toMatchObject({ tempo: record.tempo, thresholds: record.thresholds });
			expect(rewritten.startAudioS).toBe(record.startAudioS);
			expect(Object.hasOwn(rewritten, 'startAudioS')).toBe(record.startAudioS !== undefined);
			// Plain JSON, nothing of the cycle record left.
			expect(JSON.parse(JSON.stringify(rewritten))).toEqual(rewritten);
			expect(rewritten).not.toHaveProperty('cycleBars');
			expect(rewritten).not.toHaveProperty('figure');
		});
	}

	it('the frozen cycle compiler still matches figureExpectations', () => {
		const window = { ms: 80 };
		const of = Fraction.of;
		// Two bars whose ties count each held note once, across the bar line too: a quarter tied
		// to an eighth, an eighth, a rest, a quarter tied over the bar to a half, two quarters.
		const tied: Figure = {
			schema: 2,
			meter: METER_4_4,
			bars: 2,
			voices: [
				{
					id: 'main',
					elements: [
						{ kind: 'note', duration: of(1, 4), content: null, tieToNext: true },
						{ kind: 'note', duration: of(1, 8), content: null },
						{ kind: 'note', duration: of(1, 8), content: null },
						{ kind: 'rest', duration: of(1, 4) },
						{ kind: 'note', duration: of(1, 4), content: null, tieToNext: true },
						{ kind: 'note', duration: of(1, 2), content: null },
						{ kind: 'note', duration: of(1, 4), content: null },
						{ kind: 'note', duration: of(1, 4), content: null }
					]
				}
			]
		};
		const figures = [
			...RHYTHM_EXERCISES.flatMap((exercise) => exercise.figures ?? []),
			{ id: 'tied', figure: tied }
		];
		let compared = 0;
		for (const { id, figure } of figures) {
			for (const loops of [1, 2, 4]) {
				for (const startBar of [0, 1, 2, 3]) {
					const cycleBars = figure.bars * loops;
					const record: CyclePlanRecordV11 = {
						figureId: id,
						figure: figureToJson(figure),
						cycleBars,
						startBar,
						accompaniment: { figure: figureToJson(figure), bars: ['on', 'off', 'on'] },
						tempo: { at: '0', bpm: 80, unit: '1/4' },
						window,
						thresholds: {}
					};
					const rewritten = roundPlanFromRecord(cyclePlanToV12(record));
					expect(rewritten.expectations, `${id} × ${loops} from ${startBar}`).toEqual(
						figureExpectations({
							figure,
							at: Fraction.ZERO,
							bars: cycleBars,
							startBar,
							sensor: RHYTHM_SENSOR_V11,
							window,
							content: () => null
						})
					);
					expect(rewritten.mutedBars).toEqual(
						Array.from({ length: cycleBars }, (_, i) => i).filter((i) => (startBar + i) % 3 === 1)
					);
					compared++;
				}
			}
		}
		expect(compared).toBe(10 * 3 * 4);
		// The ties are read: five attacks, not the seven notes written.
		const [{ record }] = CYCLE_PLANS_V11;
		const loop = cyclePlanToV12({
			...record,
			figure: figureToJson(tied),
			cycleBars: 2,
			startBar: 0
		});
		expect(loop.expectations.map((e) => e.at)).toEqual(['0', '3/8', '3/4', '3/2', '7/4']);
	});

	it('throws on a record it cannot read', () => {
		const [{ record }] = CYCLE_PLANS_V11;
		expect(() => cyclePlanToV12({ ...record, figure: null })).toThrow();
		expect(() => cyclePlanToV12({ ...record, cycleBars: 0 })).toThrow();
		expect(() => cyclePlanToV12({ ...record, startBar: -1 })).toThrow();
		expect(() => cyclePlanToV12({ ...CYCLE_PLANS_V11[1].record, cycleBars: 2 })).toThrow();
		expect(() =>
			cyclePlanToV12({ ...record, accompaniment: { ...record.accompaniment, bars: [] } })
		).toThrow();
	});
});

describe('attemptToV12', () => {
	it('renames the mechanic', () => {
		const attempt = makeCycleAttemptV11();
		const upgraded = attemptToV12(attempt) as Record<string, unknown>;
		expect(RHYTHM_FIGURE_MECHANIC_V11).toBe('rhythm-figure');
		expect(FIGURE_MECHANIC_V12).toBe(figureRules.id);
		expect(upgraded).toEqual({
			...attempt,
			mechanic: 'figure',
			cardKey: 'figure:offbeats-2@2',
			plan: cyclePlanToV12(CYCLE_PLANS_V11[2].record)
		});
		// The attempt given is left as it was.
		expect(attempt.mechanic).toBe('rhythm-figure');
	});

	it('keeps a rhythm attempt stored before plans were, and drops a plan it cannot read', () => {
		expect(attemptToV12(makeCycleAttemptV11({ plan: null }))).toMatchObject({
			mechanic: 'figure',
			plan: null
		});
		expect(
			attemptToV12(makeCycleAttemptV11({ plan: { cycleBars: 1, figure: 'garbled' } }))
		).toMatchObject({ mechanic: 'figure', plan: null });
	});

	it('leaves the attempts of every other mechanic as they are', () => {
		const locate = { mechanic: 'locate', cardKey: 'locate:2:F', plan: { cycleBars: 1 } };
		expect(attemptToV12(locate)).toBe(locate);
	});
});

describe('backupV7ToV8', () => {
	it('upgrades the rhythm attempts of a version 7 file, the rest as it is', () => {
		const rhythm = makeCycleAttemptV11({ id: 2 });
		const v7 = makeBackupV7();
		const other = v7.attempts[0];
		const file = { ...v7, attempts: [other, rhythm] };
		const v8 = backupV7ToV8(file);
		expect(v8).toEqual({ ...file, version: 8, attempts: [other, attemptToV12(rhythm)] });
		expect(file.version).toBe(7);
	});
});
