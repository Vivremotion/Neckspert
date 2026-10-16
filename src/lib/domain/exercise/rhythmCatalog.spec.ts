import { describe, expect, it } from 'vitest';
import {
	attackPositions,
	figureFromJson,
	figureToJson,
	Fraction,
	levelRange,
	resolveLevel,
	validateFigure,
	type Level,
	type LevelParams
} from '$lib/domain/time';
import { mechanicRules } from '$lib/domain/mechanics';
import { rhythmFigureRules } from '$lib/domain/mechanics/rhythmFigure';
import { EXERCISES, exerciseById } from './catalog';
import {
	eligibleFigures,
	RHYTHM_EXERCISES,
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR
} from './rhythmCatalog';
import type { ExerciseDefinition } from './types';

function rhythmOf(exercise: ExerciseDefinition): { base: LevelParams; levels: readonly Level[] } {
	if (!exercise.base || !exercise.levels) throw new Error(`${exercise.id} has no levels`);
	return { base: exercise.base, levels: exercise.levels };
}

/** Every level index of an exercise, aid levels (negative) first. */
function indexes(levels: readonly Level[]): number[] {
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

	it('resolve every level over the base params, to a figure each can play', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			const { base, levels } = rhythmOf(exercise);
			for (const index of indexes(levels)) {
				const params = resolveLevel(base, levels, index);
				const playable = eligibleFigures(exercise, params);
				expect(playable.length, `${exercise.id} level ${index}`).toBeGreaterThan(0);
				for (const { figure } of playable) expect(params.cycleBars % figure.bars).toBe(0);
			}
		}
	});

	it('put the aid levels first', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			const { levels } = rhythmOf(exercise);
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

	it('share the common base and carry a how-to in both languages', () => {
		for (const exercise of RHYTHM_EXERCISES) {
			expect(exercise.base).toMatchObject({
				feedback: 'every-cycle',
				cursor: true,
				window: { ms: 80 }
			});
			expect(exercise.base?.accompaniment.figure.meter.count).toBe(4);
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
		expect(RHYTHM_SILENT_BARS.base?.cyclesPerBreath).toBe(4);
		expect(RHYTHM_SILENT_BARS.base?.thresholds).toEqual({
			regularity: 40,
			holdOffset: 60,
			holdDrift: 25,
			precision: 60
		});
	});

	it('mute more bars as the silent bars climb, then again slower', () => {
		const { base, levels } = rhythmOf(RHYTHM_SILENT_BARS);
		const all = [-1, 0, 1, 2, 3, 4, 5].map((i) => resolveLevel(base, levels, i));
		expect(all.map((p) => p.accompaniment.bars.filter((b) => b === 'off').length)).toEqual([
			0, 1, 2, 3, 1, 2, 3
		]);
		expect(all.map((p) => p.tempo.bpm)).toEqual([80, 80, 80, 80, 65, 65, 65]);
		expect(all.every((p) => p.tempo.unit.equals(Fraction.of(1, 4)))).toBe(true);
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
		const { base, levels } = rhythmOf(RHYTHM_TWO_FOUR);
		expect(RHYTHM_TWO_FOUR.figures).toHaveLength(6);
		expect(RHYTHM_TWO_FOUR.figures?.every((f) => f.figure.bars === 4)).toBe(true);
		expect(RHYTHM_TWO_FOUR.pick).toBe('next');
		expect(base).toMatchObject({ cycleBars: 4, cyclesPerBreath: 1, listen: 'aid' });
		const clicks = (index: number) =>
			attackPositions(resolveLevel(base, levels, index).accompaniment.figure).map((p) =>
				p.toString()
			);
		expect(clicks(0)).toEqual(['1/4', '3/4']);
		expect(clicks(-1)).toHaveLength(4);
		expect([0, 1, 2].map((i) => resolveLevel(base, levels, i).tempo.bpm)).toEqual([100, 120, 140]);
		expect(resolveLevel(base, levels, 2).cursor).toBe(false);
		expect(resolveLevel(base, levels, 0).cursor).toBe(true);
	});

	it('play offbeats on one bar, then on two bars whose second has no attack on the 1', () => {
		const { base, levels } = rhythmOf(RHYTHM_OFFBEATS);
		expect(RHYTHM_OFFBEATS.pick).toBe('loop');
		const level1 = resolveLevel(base, levels, 0);
		expect(eligibleFigures(RHYTHM_OFFBEATS, level1).map((f) => f.figure.bars)).toEqual([1]);
		expect(level1.thresholds).toMatchObject({ regularity: 80, holdOffset: 200, holdDrift: 100 });

		const level2 = resolveLevel(base, levels, 1);
		expect(level2.cycleBars).toBe(2);
		const [two] = eligibleFigures(RHYTHM_OFFBEATS, level2);
		expect(two.figure.bars).toBe(2);
		const attacks = attackPositions(two.figure);
		expect(attacks.some((a) => a.equals(Fraction.ZERO))).toBe(true);
		expect(attacks.some((a) => a.equals(Fraction.of(1)))).toBe(false);

		expect([-1, 0, 1, 2, 3].map((i) => resolveLevel(base, levels, i).tempo.bpm)).toEqual([
			70, 80, 80, 90, 100
		]);
		expect(resolveLevel(base, levels, 3).cursor).toBe(false);
	});
});
