import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from './catalog';
import { exerciseLevelsOf, overrideParams, resolvedParamsOf, tempoOf } from './levels';
import type { ExerciseDefinition } from './types';

describe('overrideParams', () => {
	it('replaces the value at a dotted path and nothing else', () => {
		const params = { windows: { perfectMs: 80, lateMs: 300 }, tempo: 80 };
		const before = structuredClone(params);
		expect(overrideParams(params, { 'windows.perfectMs': 60 })).toEqual({
			windows: { perfectMs: 60, lateMs: 300 },
			tempo: 80
		});
		expect(params).toEqual(before);
	});

	it('replaces a whole object written at a path', () => {
		const A = { figure: 'a', bars: ['on', 'off'] };
		const B = { figure: 'b' };
		expect(overrideParams({ accompaniment: A }, { accompaniment: B })).toEqual({
			accompaniment: B
		});
	});

	it('creates a missing path', () => {
		expect(overrideParams({ tempo: 80 }, { 'pacing.breathMinMs': 2000 })).toEqual({
			tempo: 80,
			pacing: { breathMinMs: 2000 }
		});
		expect(
			overrideParams({ pacing: { respirationBars: 1 } }, { 'pacing.breathMinMs': 2000 })
		).toEqual({ pacing: { respirationBars: 1, breathMinMs: 2000 } });
	});

	it('throws on a path through a value that is not an object', () => {
		expect(() => overrideParams({ tempo: 80 }, { 'tempo.bpm': 90 })).toThrow(/tempo\.bpm/);
	});
});

describe('resolvedParamsOf', () => {
	it('resolves exercise, then exercise level, then item level', () => {
		const definition: ExerciseDefinition = {
			...LOCATE_NECK,
			tempo: { fixed: 80 },
			levels: [{ params: { tempo: 90, 'windows.perfectMs': 60 } }],
			params: {
				...LOCATE_NECK.params,
				ladder: [{ params: { leadBeats: 4, aided: false, 'windows.perfectMs': 100 } }]
			}
		};
		const exerciseOnly = resolvedParamsOf(definition, { exerciseLevel: 0, itemLevel: null });
		expect(exerciseOnly.tempo).toBe(90);
		expect(exerciseOnly.windows).toMatchObject({ perfectMs: 60, lateMs: 400 });
		const both = resolvedParamsOf(definition, { exerciseLevel: 0, itemLevel: 0 });
		expect(both.tempo).toBe(90);
		expect(both.windows).toMatchObject({ perfectMs: 100, lateMs: 400 });
		expect(both).toMatchObject({ leadBeats: 4, aided: false });
		expect(tempoOf(definition, 0)).toBe(90);
	});

	it('reads aid levels at negative indexes, -1 closest to level 1, and refuses one outside', () => {
		const definition: ExerciseDefinition = {
			...LOCATE_NECK,
			levels: [
				{ params: { cycleBars: 1 }, aid: true },
				{ params: { cycleBars: 2 }, aid: true },
				{ params: { cycleBars: 4 } },
				{ params: {} }
			],
			params: { ...LOCATE_NECK.params, cycleBars: 8 }
		};
		const bars = (exerciseLevel: number) =>
			resolvedParamsOf(definition, { exerciseLevel, itemLevel: null }).cycleBars;
		expect([-2, -1, 0, 1].map(bars)).toEqual([1, 2, 4, 8]);
		expect(() => bars(2)).toThrow(RangeError);
		expect(() => bars(-3)).toThrow(RangeError);
	});

	it('gives one implicit level to an exercise without levels', () => {
		expect(exerciseLevelsOf(LOCATE_NECK)).toEqual([{ params: {} }]);
		expect(tempoOf(LOCATE_NECK, 0)).toBe(80);
		expect(() => tempoOf(LOCATE_NECK, 1)).toThrow(/level 1/);
	});
});
