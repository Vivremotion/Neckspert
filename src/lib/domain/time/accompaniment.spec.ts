import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import { METER_4_4 } from './meter';
import { createTempoMap } from './tempoMap';
import { figureFromJson, figureToJson, validateFigure, type Figure } from './figure';
import { clickAccompaniment, renderFigure, renderSounds } from './accompaniment';

const f = Fraction.of;
const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 120, unit: f(1, 4) }]);
const FOUR_BARS = ['on', 'on', 'on', 'off'] as const;

describe('clickAccompaniment', () => {
	it('builds a valid one-bar figure whose notes carry the click sounds', () => {
		const acc = clickAccompaniment({
			meter: METER_4_4,
			beats: [1, 2, 3, 4],
			accent: [1],
			bars: [...FOUR_BARS]
		});
		expect(validateFigure(acc.figure)).toBeNull();
		expect(acc.figure.bars).toBe(1);
		expect(acc.figure.voices).toHaveLength(1);
		expect(
			acc.figure.voices[0].elements.map((e) => (e.kind === 'note' ? e.content : 'rest'))
		).toEqual(['click-accent', 'click', 'click', 'click']);
		expect(acc.bars).toEqual(['on', 'on', 'on', 'off']);
	});

	it('leaves the beats that are not asked as rests', () => {
		const acc = clickAccompaniment({ meter: METER_4_4, beats: [2, 4], accent: [], bars: ['on'] });
		expect(validateFigure(acc.figure)).toBeNull();
		expect(acc.figure.voices[0].elements.map((e) => e.kind)).toEqual([
			'rest',
			'note',
			'rest',
			'note'
		]);
	});

	it('follows the meter grouping for the length of each beat', () => {
		const sixEight = { count: 6, unit: f(1, 8), grouping: [3, 3] };
		const acc = clickAccompaniment({ meter: sixEight, beats: [1, 2], accent: [1], bars: ['on'] });
		expect(validateFigure(acc.figure)).toBeNull();
		expect(acc.figure.voices[0].elements.map((e) => e.duration.toString())).toEqual(['3/8', '3/8']);
	});

	it('rejects beats outside the bar, repeated beats, accents off the beats and no bars', () => {
		const base = { meter: METER_4_4, beats: [1], accent: [], bars: ['on' as const] };
		expect(() => clickAccompaniment({ ...base, beats: [5] })).toThrow(RangeError);
		expect(() => clickAccompaniment({ ...base, beats: [0] })).toThrow(RangeError);
		expect(() => clickAccompaniment({ ...base, beats: [1, 1] })).toThrow(RangeError);
		expect(() => clickAccompaniment({ ...base, accent: [2] })).toThrow(RangeError);
		expect(() => clickAccompaniment({ ...base, bars: [] })).toThrow(RangeError);
	});
});

describe('renderSounds', () => {
	const acc = clickAccompaniment({
		meter: METER_4_4,
		beats: [1, 2, 3, 4],
		accent: [1],
		bars: [...FOUR_BARS]
	});

	it('gives 12 sounds over four bars, none in the muted one', () => {
		const sounds = renderSounds(acc, map, 0, 4);
		expect(sounds).toHaveLength(12);
		expect(sounds[0]).toEqual({ time: 0, sound: 'click-accent' });
		expect(sounds[1]).toEqual({ time: 0.5, sound: 'click' });
		expect(sounds.filter((s) => s.time >= 6 && s.time < 8)).toEqual([]);
		expect(sounds.map((s) => s.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
		expect(sounds[4].sound).toBe('click-accent');
	});

	it('plays two sounds per bar for beats 2 and 4', () => {
		const offbeats = clickAccompaniment({
			meter: METER_4_4,
			beats: [2, 4],
			accent: [],
			bars: ['on']
		});
		expect(renderSounds(offbeats, map, 0, 2).map((s) => s.time)).toEqual([0.5, 1.5, 2.5, 3.5]);
	});

	it('resumes the bar cycle from any bar', () => {
		const sounds = renderSounds(acc, map, 4, 8);
		expect(sounds).toHaveLength(12);
		expect(sounds[0]).toEqual({ time: 8, sound: 'click-accent' });
		expect(sounds.filter((s) => s.time >= 14)).toEqual([]);
		expect(renderSounds(acc, map, 7, 8)).toEqual([]);
	});

	it('is empty for an empty range and rejects a backwards or fractional one', () => {
		expect(renderSounds(acc, map, 2, 2)).toEqual([]);
		expect(() => renderSounds(acc, map, 3, 2)).toThrow(RangeError);
		expect(() => renderSounds(acc, map, 0.5, 2)).toThrow(RangeError);
	});

	it('follows tempo changes in the map', () => {
		const faster = map.withSegment({ at: f(1), bpm: 240, unit: f(1, 4) });
		const sounds = renderSounds(acc, faster, 0, 2);
		expect(sounds.map((s) => s.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75]);
	});
});

describe('renderFigure', () => {
	const backbeat: Figure = {
		schema: 1,
		meter: METER_4_4,
		bars: 1,
		voices: [
			{
				id: 'v',
				elements: [
					{ kind: 'rest', duration: f(1, 4) },
					{ kind: 'note', duration: f(1, 4), content: null },
					{ kind: 'rest', duration: f(1, 4) },
					{ kind: 'note', duration: f(1, 4), content: null }
				]
			}
		]
	};

	it('starts at the time of the given bar', () => {
		const sounds = renderFigure(backbeat, 'demo', map, 2);
		expect(sounds).toEqual([
			{ time: 4.5, sound: 'demo' },
			{ time: 5.5, sound: 'demo' }
		]);
	});

	it('plays a figure of several bars and skips tied notes', () => {
		const tied: Figure = {
			schema: 1,
			meter: METER_4_4,
			bars: 2,
			voices: [
				{
					id: 'v',
					elements: [
						{ kind: 'note', duration: f(1, 2), tieToNext: true, content: null },
						{ kind: 'note', duration: f(1, 2), content: null },
						{ kind: 'note', duration: f(1), content: null }
					]
				}
			]
		};
		expect(renderFigure(tied, 'play-along', map, 0)).toEqual([
			{ time: 0, sound: 'play-along' },
			{ time: 2, sound: 'play-along' }
		]);
	});
});

describe('figure JSON with a sound as content', () => {
	it('round-trips a sound and rejects an unknown one', () => {
		const acc = clickAccompaniment({ meter: METER_4_4, beats: [1, 3], accent: [1], bars: ['on'] });
		expect(figureFromJson(figureToJson(acc.figure))).toEqual(acc.figure);
		const json = JSON.parse(JSON.stringify(figureToJson(acc.figure)));
		json.voices[0].elements[2].content = 'kazoo';
		expect(() => figureFromJson(json)).toThrow(/content/);
	});
});
