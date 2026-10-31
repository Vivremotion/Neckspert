import { describe, expect, it } from 'vitest';
import { RHYTHM_SILENT_BARS } from '$lib/domain/exercise/rhythmCatalog';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import { exercisePresenter } from './exercisePresenter';
import { figurePresenter } from './figurePresenters';

describe('exercisePresenter', () => {
	const round = RHYTHM_SILENT_BARS.round as NonNullable<ExerciseDefinition['round']>;
	const listening = (...sensors: string[]): ExerciseDefinition => ({
		...RHYTHM_SILENT_BARS,
		round: {
			...round,
			expectations: sensors.map((sensor) => ({ ...round.expectations[0], sensor }))
		}
	});

	it('listens with the sensor its round names, not its mechanic’s', () => {
		expect(exercisePresenter(figurePresenter, listening('note')).sensors).toEqual(['note']);
	});

	it('opens a sensor its round names twice once', () => {
		expect(exercisePresenter(figurePresenter, listening('note', 'note', 'chord')).sensors).toEqual([
			'note',
			'chord'
		]);
	});

	it('keeps its mechanic’s where the round names none', () => {
		expect(exercisePresenter(figurePresenter, { ...RHYTHM_SILENT_BARS, round: undefined })).toBe(
			figurePresenter
		);
		expect(exercisePresenter(figurePresenter, listening())).toBe(figurePresenter);
	});

	it('leaves what the rhythm exercises already listen with', () => {
		expect(exercisePresenter(figurePresenter, RHYTHM_SILENT_BARS).sensors).toEqual(
			figurePresenter.sensors
		);
	});
});
