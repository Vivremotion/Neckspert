import { beforeEach, describe, expect, it } from 'vitest';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions/register';
import { allExercises, clearExercises, exerciseById } from '$lib/domain/exercise';
import { allGrids, clearGrids, gridById } from '$lib/domain/grid';
import {
	BLUES_F,
	GESTURE_CLIMB,
	GESTURE_JAM,
	GESTURE_LINK,
	GESTURE_ZONE,
	IDENTIFY_NECK,
	IOHEFY_A,
	LOCATE_NECK,
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	TRIADS_ANCHOR,
	TRIADS_ZONE
} from '$lib/testing/catalog';
import { CATALOG_FILES } from './catalogFiles';

function load() {
	clearExercises();
	clearGrids();
	return registerFiles(CATALOG_FILES, definitionChecks());
}

describe('the catalog files', () => {
	it('holds the four files', () => {
		expect(Object.keys(CATALOG_FILES).sort()).toEqual([
			'/catalog/changes.json',
			'/catalog/chords.json',
			'/catalog/notes.json',
			'/catalog/rhythm.json'
		]);
	});

	it('loads without a single refusal', () => {
		expect(load()).toEqual([]);
		expect(allExercises()).toHaveLength(11);
		expect(allGrids().map((grid) => grid.id)).toEqual(['iohefy-a', 'blues-f']);
	});
});

// Temporary: removed with the code constants.
describe('parity with the code', () => {
	const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
	const exercises = [
		LOCATE_NECK,
		IDENTIFY_NECK,
		TRIADS_ANCHOR,
		TRIADS_ZONE,
		GESTURE_LINK,
		GESTURE_CLIMB,
		GESTURE_ZONE,
		GESTURE_JAM,
		RHYTHM_SILENT_BARS,
		RHYTHM_TWO_FOUR,
		RHYTHM_OFFBEATS
	];
	beforeEach(() => {
		load();
	});
	it.each(exercises.map((e) => [e.id, e] as const))(
		'reads %s as the code writes it',
		(id, code) => {
			expect(plain(exerciseById(id))).toEqual(plain(code));
		}
	);
	it.each([IOHEFY_A, BLUES_F].map((g) => [g.id, g] as const))(
		'reads grid %s as the code writes it',
		(id, code) => {
			expect(plain(gridById(id))).toEqual(plain(code));
		}
	);
});
