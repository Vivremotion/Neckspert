import { describe, expect, it } from 'vitest';
import { exerciseLevelsOf, RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS } from '$lib/domain/exercise';
import { Fraction } from '$lib/domain/time';
import { levelView, figurePosition, tempoView } from './rhythmStage';

describe('the stage helpers', () => {
	it('write the tempo with its unit and number the levels from 1', () => {
		expect(tempoView({ at: Fraction.ZERO, bpm: 100, unit: Fraction.of(1, 4) })).toEqual({
			bpm: 100,
			unit: '♩'
		});
		const levels = exerciseLevelsOf(RHYTHM_SILENT_BARS);
		expect(levelView(levels, 0)).toEqual({ shown: 1, of: 6, aid: false });
		expect(levelView(levels, -1)).toEqual({ shown: 0, of: 6, aid: true });
	});

	it('place the cursor in the figure from the bar where the cycle began', () => {
		const [two] = RHYTHM_OFFBEATS.figures?.slice(1) ?? [];
		expect(figurePosition({ figure: two.figure, startBar: 0, barInCycle: 1, beat: 2 })).toEqual(
			Fraction.of(3, 2)
		);
		expect(figurePosition({ figure: two.figure, startBar: 1, barInCycle: 1, beat: 0 })).toEqual(
			Fraction.ZERO
		);
	});
});
