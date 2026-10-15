import { describe, expect, it } from 'vitest';
import {
	RHYTHM_EXERCISES,
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR
} from '$lib/domain/exercise';
import { Fraction, METER_4_4, clickAccompaniment, levelRange } from '$lib/domain/time';
import { FakeClock, FakeSoundScheduler } from '$lib/testing/fakes';
import { Transport } from '../transport';
import { levelView, figurePosition, tempoView } from './rhythmStage';
import {
	accompanimentFrom,
	figureFor,
	landingBar,
	levelParamsOf,
	rhythmLevels,
	unmuted
} from './rhythmExercise';

const threeOne = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on', 'on', 'on', 'off']
});

describe('landingBar', () => {
	it('is the first muted bar, or 0 when the click never stops', () => {
		expect(landingBar(threeOne)).toBe(3);
		expect(landingBar({ ...threeOne, bars: ['on', 'off', 'off', 'off'] })).toBe(1);
		expect(landingBar({ ...threeOne, bars: ['on'] })).toBe(0);
	});
});

describe('accompanimentFrom', () => {
	it('puts the first bar of the accompaniment on the given transport bar', () => {
		const rotated = accompanimentFrom(threeOne, 3);
		// transport bars 3, 4, 5, 6 read bars 0, 1, 2, 3 of the accompaniment
		expect([3, 4, 5, 6].map((bar) => rotated.bars[bar % 4])).toEqual(['on', 'on', 'on', 'off']);
		expect(rotated.figure).toBe(threeOne.figure);
	});

	it('leaves no bar muted in the listen-in', () => {
		expect(unmuted(threeOne).bars).toEqual(['on']);
	});
});

describe('figureFor', () => {
	it('plays the same figure in a loop and the next line in turn otherwise', () => {
		const offbeats1 = levelParamsOf(RHYTHM_OFFBEATS, 0);
		const offbeats2 = levelParamsOf(RHYTHM_OFFBEATS, 1);
		expect(figureFor(RHYTHM_OFFBEATS, offbeats1, 5).id).toBe('offbeats-1');
		expect(figureFor(RHYTHM_OFFBEATS, offbeats2, 0).id).toBe('offbeats-2');
		const twoFour = levelParamsOf(RHYTHM_TWO_FOUR, 0);
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

describe('the stage helpers', () => {
	it('write the tempo with its unit and number the levels from 1', () => {
		expect(tempoView({ at: Fraction.ZERO, bpm: 100, unit: Fraction.of(1, 4) })).toEqual({
			bpm: 100,
			unit: '♩'
		});
		const { levels } = rhythmLevels(RHYTHM_SILENT_BARS);
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

describe('the breath between two runs', () => {
	it('lasts at least 2 bars for every exercise at every level tempo', async () => {
		// The controller reads the next run's level at the bar before the breath ends, once the
		// last cycle has settled a quarter bar into the breath: that holds from 2 bars on.
		for (const exercise of RHYTHM_EXERCISES) {
			const { levels } = rhythmLevels(exercise);
			const { lowest, highest } = levelRange(levels);
			for (let level = lowest; level <= highest; level++) {
				const params = levelParamsOf(exercise, level);
				const clock = new FakeClock();
				const transport = new Transport({ clock, sounds: new FakeSoundScheduler(clock) });
				await transport.begin({
					meter: params.accompaniment.figure.meter,
					tempo: params.tempo,
					accompaniment: params.accompaniment
				});
				const { from, to } = transport.breath(0);
				expect(to - from, `${exercise.id} level ${level}`).toBeGreaterThanOrEqual(2);
			}
		}
	});
});
