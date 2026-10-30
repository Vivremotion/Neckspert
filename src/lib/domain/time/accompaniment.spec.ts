import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import { METER_4_4 } from './meter';
import { createTempoMap } from './tempoMap';
import { figureFromJson, figureToJson, validateFigure, type Figure } from './figure';
import {
	accompanimentFrom,
	clickAccompaniment,
	landingBar,
	mutedBarsFrom,
	renderFigure,
	renderSounds,
	unmuted
} from './accompaniment';

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

	it('throws unless the figure has exactly one voice', () => {
		const voice = acc.figure.voices[0];
		const two = { ...acc, figure: { ...acc.figure, voices: [voice, { ...voice, id: 'other' }] } };
		const none = { ...acc, figure: { ...acc.figure, voices: [] } };
		expect(() => renderSounds(two, map, 0, 1)).toThrow(RangeError);
		expect(() => renderSounds(none, map, 0, 1)).toThrow(RangeError);
	});

	it('throws on a note without a sound even when its bar is muted or not rendered', () => {
		const silent: Figure = {
			schema: 2,
			meter: METER_4_4,
			bars: 1,
			voices: [{ id: 'v', elements: [{ kind: 'note', duration: f(1), content: null }] }]
		};
		const muted = { figure: silent, bars: ['off' as const] };
		expect(() => renderSounds(muted, map, 0, 2)).toThrow(RangeError);
		expect(() => renderSounds(muted, map, 3, 3)).toThrow(RangeError);
	});

	it('follows tempo changes in the map', () => {
		const faster = map.withSegment({ at: f(1), bpm: 240, unit: f(1, 4) });
		const sounds = renderSounds(acc, faster, 0, 2);
		expect(sounds.map((s) => s.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.25, 2.5, 2.75]);
	});
});

describe('renderFigure', () => {
	const backbeat: Figure = {
		schema: 2,
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

	it('starts the contretemps (c8 c8 r8 c8 r8 c8 r8 c8) at 4 s from bar 2', () => {
		const note = { kind: 'note', duration: f(1, 8), content: null } as const;
		const rest = { kind: 'rest', duration: f(1, 8) } as const;
		const contretemps: Figure = {
			schema: 2,
			meter: METER_4_4,
			bars: 1,
			voices: [{ id: 'v', elements: [note, note, rest, note, rest, note, rest, note] }]
		};
		const sounds = renderFigure(contretemps, 'demo', map, 2);
		expect(sounds.map((s) => s.time)).toEqual([4, 4.25, 4.75, 5.25, 5.75]);
		expect(sounds.every((s) => s.sound === 'demo')).toBe(true);
	});

	it('renders the attacks of every voice, merged and sorted by time', () => {
		const note = { kind: 'note', duration: f(1, 2), content: null } as const;
		const rest = { kind: 'rest', duration: f(1, 4) } as const;
		const two: Figure = {
			schema: 2,
			meter: METER_4_4,
			bars: 1,
			voices: [
				{ id: 'low', elements: [note, note] },
				{
					id: 'high',
					elements: [rest, { ...rest, kind: 'note', content: null }, rest, rest]
				}
			]
		};
		expect(renderFigure(two, 'play-along', map, 0).map((s) => s.time)).toEqual([0, 0.5, 1]);
	});

	it('plays a figure of several bars and skips tied notes', () => {
		const tied: Figure = {
			schema: 2,
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

const threeOne = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on', 'on', 'on', 'off']
});

describe('landingBar', () => {
	it('is the first muted bar, or 0 when the click never stops or there is no accompaniment', () => {
		expect(landingBar(threeOne)).toBe(3);
		expect(landingBar({ ...threeOne, bars: ['on', 'off', 'off', 'off'] })).toBe(1);
		expect(landingBar({ ...threeOne, bars: ['on'] })).toBe(0);
		expect(landingBar(null)).toBe(0);
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

describe('mutedBarsFrom', () => {
	it('rotates the accompaniment by the start bar to find the muted bars of a round', () => {
		expect(mutedBarsFrom(threeOne.bars, 3, 4)).toEqual([0]);
		expect(mutedBarsFrom(threeOne.bars, 0, 4)).toEqual([3]);
		expect(mutedBarsFrom(threeOne.bars, 1, 4)).toEqual([2]);
	});

	it('repeats a short accompaniment over the round', () => {
		expect(mutedBarsFrom(['on', 'off'], 0, 4)).toEqual([1, 3]);
	});

	it('refuses an accompaniment without bars, or a start that is not a bar', () => {
		expect(() => mutedBarsFrom([], 0, 4)).toThrow(RangeError);
		expect(() => mutedBarsFrom(threeOne.bars, -1, 4)).toThrow(RangeError);
	});
});
