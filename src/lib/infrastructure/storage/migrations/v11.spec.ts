import { describe, expect, it } from 'vitest';
import { exerciseLevelsOf, tempoOf } from '$lib/domain/exercise/levels';
import { GESTURE_EXERCISES, readGestureParams } from '$lib/domain/gesture/exercises';
import type { LevelState } from '$lib/domain/time';
import {
	GESTURE_EXERCISES_V11,
	GESTURE_GRID_EXERCISES_V11,
	GESTURE_TEMPOS_V11,
	attemptToV11,
	backupV6ToV7,
	gestureLevelOfTempo,
	levelStatesV11,
	type BackupV6,
	type ProgressionV10
} from './v11';

function progression(
	exerciseId: string,
	tempoBpm: number,
	scope?: string,
	mechanic = 'chord-grid'
): ProgressionV10 {
	return { exerciseId, mechanic, tempoBpm, updatedAt: 1, ...(scope !== undefined && { scope }) };
}

function level(exerciseId: string, scope: string, value: number): LevelState {
	return {
		exerciseId,
		scope,
		item: '',
		level: value,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
}

describe('gestureLevelOfTempo', () => {
	it('maps a tempo to the highest level not above it', () => {
		expect(gestureLevelOfTempo(112.5)).toBe(6);
		expect(gestureLevelOfTempo(160)).toBe(8);
		expect(gestureLevelOfTempo(70)).toBe(0);
		expect(gestureLevelOfTempo(80)).toBe(0);
		expect(gestureLevelOfTempo(120)).toBe(8);
	});
});

describe('levelStatesV11', () => {
	it("turns each gesture progression into its scope's exercise level", () => {
		expect(
			levelStatesV11(
				[progression('gesture-climb', 112.5, 'blues-f'), progression('gesture-link', 95)],
				[]
			)
		).toEqual([level('gesture-climb', 'blues-f', 6), level('gesture-link', '', 3)]);
	});

	it('drops the progressions the game ignores', () => {
		expect(
			levelStatesV11(
				[
					progression('locate-neck', 120, undefined, 'locate'),
					progression('triads-anchor', 100, undefined, 'triad-anchor'),
					progression('gesture-zone', 100),
					// A link has no grid: a scope on it was never read either.
					progression('gesture-link', 100, 'blues-f'),
					progression('tuba-solo', 100, undefined, 'tuba')
				],
				[]
			)
		).toEqual([]);
	});

	it('keeps a level state already there', () => {
		const stored = { ...level('gesture-jam', 'iohefy-a', 2), successes: 4 };
		expect(
			levelStatesV11(
				[progression('gesture-jam', 120, 'iohefy-a'), progression('gesture-jam', 90, 'blues-f')],
				[stored]
			)
		).toEqual([level('gesture-jam', 'blues-f', 2)]);
	});
});

describe('attemptToV11', () => {
	it('renames tempoScope to scope on attempts', () => {
		const attempt = { id: 1, exerciseId: 'gesture-climb', tempoBpm: 80, tempoScope: 'blues-f' };
		const upgraded = attemptToV11(attempt);
		expect(upgraded).toEqual({
			id: 1,
			exerciseId: 'gesture-climb',
			tempoBpm: 80,
			scope: 'blues-f'
		});
		expect(Object.hasOwn(upgraded, 'tempoScope')).toBe(false);
		// The attempt given is left as it was.
		expect(attempt.tempoScope).toBe('blues-f');
	});

	it('leaves an attempt without tempoScope without scope', () => {
		const attempt: { id: number; exerciseId: string; tempoBpm: number; tempoScope?: string } = {
			id: 2,
			exerciseId: 'locate-neck',
			tempoBpm: 80
		};
		const upgraded = attemptToV11(attempt);
		expect(upgraded).toEqual(attempt);
		expect(Object.hasOwn(upgraded, 'scope')).toBe(false);
	});
});

describe('GESTURE_TEMPOS_V11', () => {
	// Tripwire, as for TRIAD_LADDER_V10: the migration never reads the catalog, but a divergence
	// must be noticed, then decided (the frozen tempos stay as they are).
	it('freezes the gesture tempos against the catalog', () => {
		expect(GESTURE_EXERCISES.map((definition) => definition.id)).toEqual([
			...GESTURE_EXERCISES_V11
		]);
		for (const definition of GESTURE_EXERCISES) {
			expect(exerciseLevelsOf(definition).map((_, i) => tempoOf(definition, i))).toEqual([
				...GESTURE_TEMPOS_V11
			]);
		}
		expect(
			GESTURE_EXERCISES.filter(
				(definition) => (readGestureParams(definition).grids ?? []).length > 0
			).map((definition) => definition.id)
		).toEqual([...GESTURE_GRID_EXERCISES_V11]);
	});
});

describe('backupV6ToV7', () => {
	it('converts a backup 6 to 7', () => {
		const rhythm = level('rhythm-silent-bars', '', 2);
		const attempts = [
			{ id: 1, exerciseId: 'gesture-climb', tempoBpm: 110, tempoScope: 'blues-f' },
			{ id: 2, exerciseId: 'locate-neck', tempoBpm: 80 }
		];
		const v6: BackupV6 = {
			app: 'neckspert-play',
			version: 6,
			exportedAt: 5,
			settings: {},
			cards: [],
			sessions: [],
			progressions: [
				progression('gesture-climb', 112.5, 'blues-f'),
				progression('locate-neck', 120, undefined, 'locate')
			],
			attempts,
			levelStates: [rhythm]
		};
		const v7 = backupV6ToV7(v6);
		expect(v7).toEqual({
			app: 'neckspert-play',
			version: 7,
			exportedAt: 5,
			settings: {},
			cards: [],
			sessions: [],
			attempts: [
				{ id: 1, exerciseId: 'gesture-climb', tempoBpm: 110, scope: 'blues-f' },
				{ id: 2, exerciseId: 'locate-neck', tempoBpm: 80 }
			],
			levelStates: [rhythm, level('gesture-climb', 'blues-f', 6)]
		});
		expect(Object.hasOwn(v7, 'progressions')).toBe(false);
		// The file given is left as it was.
		expect(v6.version).toBe(6);
		expect(attempts[0].tempoScope).toBe('blues-f');
	});
});
