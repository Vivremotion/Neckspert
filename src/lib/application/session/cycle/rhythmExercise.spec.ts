import { describe, expect, it } from 'vitest';
import { RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS, RHYTHM_TWO_FOUR } from '$lib/domain/exercise';
import { Fraction } from '$lib/domain/time';
import { levelView, figurePosition, tempoView } from './rhythmStage';
import { figureFor, rhythmLevels, rhythmParamsOf, tempoSegmentOf } from './rhythmExercise';

describe('figureFor', () => {
	it('plays the same figure in a loop and the next line in turn otherwise', () => {
		const offbeats1 = rhythmParamsOf(RHYTHM_OFFBEATS, 0);
		const offbeats2 = rhythmParamsOf(RHYTHM_OFFBEATS, 1);
		expect(figureFor(RHYTHM_OFFBEATS, offbeats1, 5).id).toBe('offbeats-1');
		expect(figureFor(RHYTHM_OFFBEATS, offbeats2, 0).id).toBe('offbeats-2');
		const twoFour = rhythmParamsOf(RHYTHM_TWO_FOUR, 0);
		expect([0, 1, 5, 6].map((n) => figureFor(RHYTHM_TWO_FOUR, twoFour, n).id)).toEqual([
			'line-1',
			'line-2',
			'line-6',
			'line-1'
		]);
	});

	it('refuses an exercise without levels', () => {
		expect(() => rhythmLevels({ ...RHYTHM_SILENT_BARS, levels: undefined })).toThrow();
	});
});

describe('rhythmParamsOf', () => {
	it('reads the level params out of the resolved params, the tempo on the beat of the accompaniment', () => {
		const params = rhythmParamsOf(RHYTHM_TWO_FOUR, 1);
		expect(Object.keys(params)).not.toContain('sensor');
		expect(params).toMatchObject({ tempo: 120, countIn: false, cycleBars: 4 });
		expect(tempoSegmentOf(params)).toEqual({
			at: Fraction.ZERO,
			bpm: 120,
			unit: Fraction.of(1, 4)
		});
	});

	it('refuses a level the exercise does not have, or a start the player could not use', () => {
		expect(() => rhythmParamsOf(RHYTHM_TWO_FOUR, 3)).toThrow(RangeError);
		const silent = {
			...RHYTHM_TWO_FOUR,
			levels: [{ params: { listenInBars: 0 } }]
		};
		expect(() => rhythmParamsOf(silent, 0)).toThrow(/listen-in/);
	});
});

describe('the stage helpers', () => {
	it('write the tempo with its unit and number the levels from 1', () => {
		expect(tempoView({ at: Fraction.ZERO, bpm: 100, unit: Fraction.of(1, 4) })).toEqual({
			bpm: 100,
			unit: '♩'
		});
		const levels = rhythmLevels(RHYTHM_SILENT_BARS);
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
