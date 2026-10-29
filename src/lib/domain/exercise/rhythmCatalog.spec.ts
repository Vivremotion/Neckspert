import { describe, expect, it } from 'vitest';
import {
	attackPositions,
	barLength,
	figureFromJson,
	figureToJson,
	Fraction,
	levelRange,
	validateFigure,
	type Level,
	type LevelParams
} from '$lib/domain/time';
import { mechanicRules } from '$lib/domain/mechanics';
import { rhythmFigureRules } from '$lib/domain/mechanics/rhythmFigure';
import { EXERCISES, exerciseById } from './catalog';
import { exerciseLevelsOf, resolvedParamsOf } from './levels';
import {
	eligibleFigures,
	RHYTHM_EXERCISES,
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR
} from './rhythmCatalog';
import type { ExerciseDefinition } from './types';

function levelsOf(exercise: ExerciseDefinition): readonly Level<Record<string, unknown>>[] {
	if (!exercise.levels) throw new Error(`${exercise.id} has no levels`);
	return exercise.levels;
}

/** The params of an exercise level, read as the rhythm reads them. */
function paramsAt(exercise: ExerciseDefinition, level: number): LevelParams {
	return resolvedParamsOf(exercise, {
		exerciseLevel: level,
		itemLevel: null
	}) as unknown as LevelParams;
}

/** Keys every exercise's resolved params carry besides its level params. */
const RESOLVED_ELSEWHERE = ['sensor', 'windows', 'pacing', 'recallThresholdMs'];

const ACCENTED_EVERY_BEAT = {
	schema: 1,
	meter: { count: 4, unit: '1/4', grouping: [1, 1, 1, 1] },
	bars: 1,
	voices: [
		{
			id: 'click',
			elements: [
				{ kind: 'note', duration: '1/4', content: 'click-accent' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' }
			]
		}
	]
};

const EVERY_BEAT = {
	...ACCENTED_EVERY_BEAT,
	voices: [
		{
			id: 'click',
			elements: [
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' }
			]
		}
	]
};

const TWO_AND_FOUR = {
	...ACCENTED_EVERY_BEAT,
	voices: [
		{
			id: 'click',
			elements: [
				{ kind: 'rest', duration: '1/4' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'rest', duration: '1/4' },
				{ kind: 'note', duration: '1/4', content: 'click' }
			]
		}
	]
};

/**
 * Every level of every rhythm exercise as `resolveLevel` resolved it over the exercise's `base`
 * params before H6 (JSON, the tempo as its quarter-note bpm): frozen, the proof that writing the
 * levels as paths changed nothing.
 */
const RESOLVED_BEFORE_H6: Record<string, Record<number, Record<string, unknown>>> = {
	'rhythm-silent-bars': {
		[-1]: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'on', 'on', 'on'] },
			cycleBars: 4,
			tempo: 80,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		0: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'on', 'on', 'off'] },
			cycleBars: 4,
			tempo: 80,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		1: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'on', 'off', 'off'] },
			cycleBars: 4,
			tempo: 80,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		2: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'off', 'off', 'off'] },
			cycleBars: 4,
			tempo: 80,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		3: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'on', 'on', 'off'] },
			cycleBars: 4,
			tempo: 65,
			window: { ms: 50 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: false,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		4: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'on', 'off', 'off'] },
			cycleBars: 4,
			tempo: 65,
			window: { ms: 50 },
			feedback: 'summary',
			listen: 'free',
			cursor: false,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		5: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on', 'off', 'off', 'off'] },
			cycleBars: 4,
			tempo: 65,
			window: { ms: 30 },
			feedback: 'out-of-tolerance',
			listen: 'free',
			cursor: false,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 20, holdOffset: 25, holdDrift: 10, precision: 30 }
		}
	},
	'rhythm-two-four': {
		[-1]: {
			accompaniment: { figure: EVERY_BEAT, bars: ['on'] },
			cycleBars: 4,
			tempo: 100,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'aid',
			cursor: true,
			countIn: false,
			pacing: { respirationBars: 1, roundsPerBreath: 1, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		0: {
			accompaniment: { figure: TWO_AND_FOUR, bars: ['on'] },
			cycleBars: 4,
			tempo: 100,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'aid',
			cursor: true,
			countIn: false,
			pacing: { respirationBars: 1, roundsPerBreath: 1, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		1: {
			accompaniment: { figure: TWO_AND_FOUR, bars: ['on'] },
			cycleBars: 4,
			tempo: 120,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'aid',
			cursor: true,
			countIn: false,
			pacing: { respirationBars: 1, roundsPerBreath: 1, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		2: {
			accompaniment: { figure: TWO_AND_FOUR, bars: ['on'] },
			cycleBars: 4,
			tempo: 140,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'aid',
			cursor: false,
			countIn: false,
			pacing: { respirationBars: 1, roundsPerBreath: 1, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		}
	},
	'rhythm-offbeats': {
		[-1]: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on'] },
			cycleBars: 1,
			tempo: 70,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		0: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on'] },
			cycleBars: 1,
			tempo: 80,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 80, holdOffset: 200, holdDrift: 100, precision: 60 }
		},
		1: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on'] },
			cycleBars: 2,
			tempo: 80,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		2: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on'] },
			cycleBars: 2,
			tempo: 90,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: true,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		},
		3: {
			accompaniment: { figure: ACCENTED_EVERY_BEAT, bars: ['on'] },
			cycleBars: 2,
			tempo: 100,
			window: { ms: 80 },
			feedback: 'every-cycle',
			listen: 'free',
			cursor: false,
			pacing: { respirationBars: 1, roundsPerBreath: 4, breathMinMs: 4000 },
			thresholds: { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }
		}
	}
};

/** Every level index of an exercise, aid levels (negative) first. */
function indexes(levels: readonly Level<unknown>[]): number[] {
	const { lowest, highest } = levelRange(levels);
	return Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i);
}

describe('the rhythm exercises', () => {
	it('are in the catalog, on the rhythm-figure mechanic', () => {
		expect(RHYTHM_EXERCISES).toEqual([RHYTHM_SILENT_BARS, RHYTHM_TWO_FOUR, RHYTHM_OFFBEATS]);
		for (const exercise of RHYTHM_EXERCISES) {
			expect(EXERCISES).toContain(exercise);
			expect(exerciseById(exercise.id)).toBe(exercise);
			expect(exercise.mechanic).toBe('rhythm-figure');
			expect(mechanicRules(exercise.mechanic)).toBe(rhythmFigureRules);
		}
		expect(RHYTHM_EXERCISES.map((e) => e.id)).toEqual([
			'rhythm-silent-bars',
			'rhythm-two-four',
			'rhythm-offbeats'
		]);
	});

	it('write every figure validly, and keep it as JSON', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			expect(exercise.figures?.length).toBeGreaterThan(0);
			for (const { id, figure } of exercise.figures ?? []) {
				expect(validateFigure(figure), id).toBeNull();
				const json = JSON.parse(JSON.stringify(figureToJson(figure)));
				expect(figureFromJson(json), id).toEqual(figure);
			}
			const ids = (exercise.figures ?? []).map((f) => f.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it('resolve every level over the exercise params, to a figure each can play', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			for (const index of indexes(levelsOf(exercise))) {
				const params = paramsAt(exercise, index);
				const playable = eligibleFigures(exercise, params);
				expect(playable.length, `${exercise.id} level ${index}`).toBeGreaterThan(0);
				for (const { figure } of playable) expect(params.cycleBars % figure.bars).toBe(0);
			}
		}
	});

	it('put the aid levels first', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			const levels = levelsOf(exercise);
			expect(levels[0].aid, exercise.id).toBe(true);
			const firstRegular = levels.findIndex((l) => !l.aid);
			expect(levels.slice(firstRegular).some((l) => l.aid)).toBe(false);
		}
		expect(levelRange(RHYTHM_SILENT_BARS.levels ?? [])).toEqual({
			lowest: -1,
			first: 0,
			highest: 5
		});
		expect(levelRange(RHYTHM_TWO_FOUR.levels ?? [])).toEqual({ lowest: -1, first: 0, highest: 2 });
		expect(levelRange(RHYTHM_OFFBEATS.levels ?? [])).toEqual({ lowest: -1, first: 0, highest: 3 });
	});

	it('share the common params and carry a how-to in both languages', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			expect(exercise.params).toMatchObject({
				feedback: 'every-cycle',
				cursor: true,
				window: { ms: 80 }
			});
			expect(paramsAt(exercise, 0).accompaniment.figure.meter.count).toBe(4);
			expect(exercise.params).toMatchObject({ sensor: 'attack' });
			expect(exercise.howTo?.fr.length).toBeGreaterThan(20);
			expect(exercise.howTo?.en.length).toBeGreaterThan(20);
			expect(exercise.title?.fr.length).toBeGreaterThan(3);
			expect(exercise.title?.en.length).toBeGreaterThan(3);
		}
		expect(RHYTHM_OFFBEATS.title).toEqual({ fr: 'Contretemps', en: 'Offbeats' });
		// The offbeat figure attacks the first beat of the bar too: its how-to says so.
		expect(RHYTHM_OFFBEATS.howTo?.fr).toContain('plus le premier temps de la mesure');
		expect(RHYTHM_OFFBEATS.howTo?.en).toContain('plus the first beat of the bar');
		expect(RHYTHM_SILENT_BARS.params.pacing).toEqual({ roundsPerBreath: 4, breathMinMs: 4000 });
		expect(RHYTHM_SILENT_BARS.params.thresholds).toEqual({
			regularity: 40,
			holdOffset: 60,
			holdDrift: 25,
			precision: 60
		});
	});

	it('mute more bars as the silent bars climb, then again slower', () => {
		const all = [-1, 0, 1, 2, 3, 4, 5].map((i) => paramsAt(RHYTHM_SILENT_BARS, i));
		expect(all.map((p) => p.accompaniment.bars.filter((b) => b === 'off').length)).toEqual([
			0, 1, 2, 3, 1, 2, 3
		]);
		expect(all.map((p) => p.tempo)).toEqual([80, 80, 80, 80, 65, 65, 65]);
		expect(all.every((p) => p.cycleBars === 4)).toBe(true);
		expect(all[4]).toMatchObject({ cursor: false, window: { ms: 50 } });
		expect(all[5].feedback).toBe('summary');
		expect(all[6]).toMatchObject({
			window: { ms: 30 },
			feedback: 'out-of-tolerance',
			cursor: false,
			thresholds: { regularity: 20, holdOffset: 25, holdDrift: 10, precision: 30 }
		});
		expect(RHYTHM_SILENT_BARS.pick).toBe('loop');
	});

	it('read a new line of four bars at each cycle, with the click on 2 and 4', () => {
		expect(RHYTHM_TWO_FOUR.figures).toHaveLength(6);
		expect(RHYTHM_TWO_FOUR.figures?.every((f) => f.figure.bars === 4)).toBe(true);
		expect(RHYTHM_TWO_FOUR.pick).toBe('next');
		expect(RHYTHM_TWO_FOUR.params).toMatchObject({
			cycleBars: 4,
			pacing: { roundsPerBreath: 1 },
			listen: 'aid'
		});
		const clicks = (index: number) =>
			attackPositions(paramsAt(RHYTHM_TWO_FOUR, index).accompaniment.figure).map((p) =>
				p.toString()
			);
		expect(clicks(0)).toEqual(['1/4', '3/4']);
		expect(clicks(-1)).toHaveLength(4);
		expect([0, 1, 2].map((i) => paramsAt(RHYTHM_TWO_FOUR, i).tempo)).toEqual([100, 120, 140]);
		expect(paramsAt(RHYTHM_TWO_FOUR, 2).cursor).toBe(false);
		expect(paramsAt(RHYTHM_TWO_FOUR, 0).cursor).toBe(true);
	});

	it('play offbeats on one bar, then on two bars whose second has no attack on the 1', () => {
		expect(RHYTHM_OFFBEATS.pick).toBe('loop');
		const level1 = paramsAt(RHYTHM_OFFBEATS, 0);
		expect(eligibleFigures(RHYTHM_OFFBEATS, level1).map((f) => f.figure.bars)).toEqual([1]);
		expect(level1.thresholds).toMatchObject({ regularity: 80, holdOffset: 200, holdDrift: 100 });

		const level2 = paramsAt(RHYTHM_OFFBEATS, 1);
		expect(level2.cycleBars).toBe(2);
		const [two] = eligibleFigures(RHYTHM_OFFBEATS, level2);
		expect(two.figure.bars).toBe(2);
		const attacks = attackPositions(two.figure);
		expect(attacks.some((a) => a.equals(Fraction.ZERO))).toBe(true);
		expect(attacks.some((a) => a.equals(Fraction.of(1)))).toBe(false);

		expect([-1, 0, 1, 2, 3].map((i) => paramsAt(RHYTHM_OFFBEATS, i).tempo)).toEqual([
			70, 80, 80, 90, 100
		]);
		expect(paramsAt(RHYTHM_OFFBEATS, 3).cursor).toBe(false);
	});
	it('resolves every level of every rhythm exercise to the params it resolved to before', () => {
		expect(RHYTHM_EXERCISES.map((e) => e.id)).toEqual(Object.keys(RESOLVED_BEFORE_H6));
		for (const exercise of RHYTHM_EXERCISES) {
			const before = RESOLVED_BEFORE_H6[exercise.id];
			expect(indexes(levelsOf(exercise))).toEqual(
				Object.keys(before)
					.map(Number)
					.sort((a, b) => a - b)
			);
			for (const index of indexes(levelsOf(exercise))) {
				const resolved = JSON.parse(
					JSON.stringify(resolvedParamsOf(exercise, { exerciseLevel: index, itemLevel: null }))
				) as Record<string, unknown>;
				const row = before[index];
				const levelParams = Object.fromEntries(Object.keys(row).map((key) => [key, resolved[key]]));
				expect(levelParams, `${exercise.id} level ${index}`).toEqual(row);
				const others = Object.keys(resolved).filter((key) => !(key in row));
				expect(others.every((key) => RESOLVED_ELSEWHERE.includes(key))).toBe(true);
			}
		}
	});

	it('breathes at least two bars at every level', () => {
		// A breath lasts `pacing.breathMinMs` in whole bars. The next run reads its level at the
		// bar before the breath ends, once the last cycle has settled a quarter bar into the
		// breath: that holds from 2 bars on.
		for (const exercise of RHYTHM_EXERCISES) {
			for (const index of indexes(levelsOf(exercise))) {
				const params = resolvedParamsOf(exercise, { exerciseLevel: index, itemLevel: null });
				const { breathMinMs } = params.pacing as { breathMinMs?: number };
				const { tempo, accompaniment } = params as unknown as LevelParams;
				const { meter } = accompaniment.figure;
				const barMs = (barLength(meter).div(meter.unit).toNumber() * 60_000) / tempo;
				const bars = Math.max(1, Math.ceil((breathMinMs ?? 0) / barMs - 1e-9));
				expect(breathMinMs, `${exercise.id} level ${index}`).toBe(4000);
				expect(bars, `${exercise.id} level ${index}`).toBeGreaterThanOrEqual(2);
			}
		}
	});

	it('writes thresholds as dotted paths', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			for (const level of exerciseLevelsOf(exercise)) {
				expect(Object.keys(level.params)).not.toContain('thresholds');
			}
		}
		const [, level1] = exerciseLevelsOf(RHYTHM_OFFBEATS);
		expect(level1.params).toMatchObject({
			'thresholds.regularity': 80,
			'thresholds.holdOffset': 200,
			'thresholds.holdDrift': 100
		});
		expect(paramsAt(RHYTHM_OFFBEATS, 0).thresholds.precision).toBe(60);
	});
});
