import { describe, expect, it } from 'vitest';
import { FakeClock, FakeSoundScheduler } from '$lib/testing/fakes';
import {
	Fraction,
	METER_4_4,
	clickAccompaniment,
	type Figure,
	type TempoSegment
} from '$lib/domain/time';
import { BREATH_MIN_MS, LISTEN_IN_BARS, Transport, TransportStopped } from './transport';

const f = Fraction.of;
const tempo = (bpm: number): TempoSegment => ({ at: Fraction.ZERO, bpm, unit: f(1, 4) });
const clicks = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on']
});
const offbeats = clickAccompaniment({ meter: METER_4_4, beats: [2, 4], accent: [], bars: ['on'] });

function setup() {
	const clock = new FakeClock();
	clock.time = 5;
	const sounds = new FakeSoundScheduler(clock);
	const transport = new Transport({ clock, sounds });
	return { clock, sounds, transport };
}

describe('Transport.begin', () => {
	it('plays the listen-in bars of the accompaniment, then a counted bar of four clicks', async () => {
		const { sounds, transport } = setup();
		const { map, playFrom } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: offbeats
		});
		expect(LISTEN_IN_BARS).toBe(2);
		expect(playFrom).toBe(3);
		const beat = 0.6;
		const emitted = sounds.emitted();
		const at = (bar: number, b: number) => map.origin + bar * 4 * beat + b * beat;
		expect(emitted).toHaveLength(2 * 2 + 4);
		// listen-in: the accompaniment's own sounds, bars 0 and 1
		[0, 1].forEach((bar, i) => {
			expect(emitted[i * 2].time).toBeCloseTo(at(bar, 1), 9);
			expect(emitted[i * 2 + 1].time).toBeCloseTo(at(bar, 3), 9);
			expect(emitted.slice(i * 2, i * 2 + 2).map((s) => s.sound)).toEqual(['click', 'click']);
		});
		// counted bar: every beat, accent on 1
		expect(emitted.slice(4).map((s) => s.sound)).toEqual([
			'click-accent',
			'click',
			'click',
			'click'
		]);
		emitted.slice(4).forEach((s, b) => expect(s.time).toBeCloseTo(at(2, b), 9));
	});

	it('plays right after the listen-in, with no count clicks nor countdown, without a counted bar', async () => {
		const { sounds, transport } = setup();
		const { playFrom } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: offbeats,
			countIn: false
		});
		expect(playFrom).toBe(LISTEN_IN_BARS);
		expect(sounds.emitted()).toHaveLength(LISTEN_IN_BARS * 2);
		expect(sounds.emitted().every((s) => s.sound === 'click')).toBe(true);
		[0, 1, 2].forEach((bar) => expect(transport.countdownAt(bar)).toBeNull());
	});

	it('honours a custom listen-in, with or without a counted bar', async () => {
		const { transport } = setup();
		const input = { meter: METER_4_4, tempo: tempo(100), accompaniment: offbeats };
		expect((await transport.begin({ ...input, listenInBars: 4 })).playFrom).toBe(5);
		expect((await transport.begin({ ...input, listenInBars: 1, countIn: false })).playFrom).toBe(1);
		expect((await transport.begin({ ...input, listenInBars: 0 })).playFrom).toBe(1);
		await expect(transport.begin({ ...input, listenInBars: 0, countIn: false })).rejects.toThrow(
			RangeError
		);
	});

	it('starts the map at least 0.1 s after now, once the clock has settled', async () => {
		const { clock, transport } = setup();
		let settled = false;
		clock.settle = async () => {
			clock.time = 7;
			settled = true;
		};
		const { map } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: clicks
		});
		expect(settled).toBe(true);
		expect(map.origin).toBeGreaterThanOrEqual(7.1);
		expect(transport.map).toBe(map);
	});

	it('lengthens the listen-in when asked, the count after the last listen-in bar', async () => {
		const { sounds, transport } = setup();
		const { playFrom } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: clicks,
			listenInBars: LISTEN_IN_BARS + 2
		});
		expect(playFrom).toBe(LISTEN_IN_BARS + 2 + 1);
		expect(transport.countdownAt(LISTEN_IN_BARS + 2)).toBe(4);
		expect(transport.countdownAt(LISTEN_IN_BARS)).toBeNull();
		// four listen-in bars of four clicks, then the counted bar
		expect(sounds.emitted()).toHaveLength(5 * 4);
	});

	it('refuses a listen-in that is not a whole number of bars', async () => {
		const { transport } = setup();
		await expect(
			transport.begin({
				meter: METER_4_4,
				tempo: tempo(100),
				accompaniment: clicks,
				listenInBars: -1
			})
		).rejects.toThrow(RangeError);
	});

	it('counts down 4, 3, 2, 1 over the counted bar and is null elsewhere', async () => {
		const { transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		expect(transport.countdownAt(2)).toBe(4);
		expect([0, 1, 2, 3].map((b) => transport.countdownAt(2, b))).toEqual([4, 3, 2, 1]);
		expect(transport.countdownAt(0)).toBeNull();
		expect(transport.countdownAt(1)).toBeNull();
		expect(transport.countdownAt(3)).toBeNull();
	});
});

describe('Transport.accompany and playFigure', () => {
	it('schedules the accompaniment of the asked bars on the current map', async () => {
		const { sounds, transport } = setup();
		const { map, playFrom } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: offbeats
		});
		const before = sounds.emitted().length;
		transport.accompany(playFrom, playFrom + 1, offbeats);
		const added = sounds.emitted().slice(before);
		expect(added).toHaveLength(2);
		expect(added[0].time).toBeCloseTo(map.origin + 3 * 2.4 + 0.6, 9);
	});

	it('plays a figure from a bar as the asked sound', async () => {
		const { sounds, transport } = setup();
		const { playFrom } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: clicks
		});
		const figure: Figure = {
			schema: 1,
			meter: METER_4_4,
			bars: 1,
			voices: [
				{
					id: 'a',
					elements: [
						{ kind: 'note', duration: f(1, 2), content: null },
						{ kind: 'rest', duration: f(1, 2) }
					]
				}
			]
		};
		const before = sounds.emitted().length;
		transport.playFigure(figure, 'demo', playFrom);
		const added = sounds.emitted().slice(before);
		expect(added.map((s) => s.sound)).toEqual(['demo']);
		expect(added[0].time).toBeCloseTo(transport.map.toSeconds(f(3)), 9);
	});

	it('wakes a callback at a bar of the map', async () => {
		const { clock, sounds, transport } = setup();
		const { map } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: clicks
		});
		let called = 0;
		transport.at(f(3, 2), () => called++);
		const time = map.origin + 1.5 * 2.4;
		clock.time = time - 0.01;
		sounds.flush();
		expect(called).toBe(0);
		clock.time = time;
		sounds.flush();
		expect(called).toBe(1);
	});

	it('tells the length of its bar in whole notes', async () => {
		const { transport } = setup();
		expect(() => transport.barLength).toThrow('the transport has not begun');
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		expect(transport.barLength.toString()).toBe('1');
	});
});

describe('Transport.breath', () => {
	it('lasts whole bars of at least BREATH_MIN_MS, clicks every beat and counts the last bar', async () => {
		const { sounds, transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(120), accompaniment: clicks });
		const before = sounds.emitted().length;
		const range = transport.breath(10);
		expect(BREATH_MIN_MS).toBe(4000);
		expect(range).toEqual({ from: 10, to: 12 });
		const seconds = transport.map.toSeconds(f(12)) - transport.map.toSeconds(f(10));
		expect(seconds * 1000).toBeGreaterThanOrEqual(BREATH_MIN_MS);
		expect(sounds.emitted().slice(before)).toHaveLength(8);
		expect(transport.countdownAt(10)).toBeNull();
		expect(transport.countdownAt(11)).toBe(4);
	});

	it('rounds up to more bars at a slower tempo', async () => {
		const { transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		// a bar lasts 2.4 s: two bars are 4.8 s
		expect(transport.breath(5)).toEqual({ from: 5, to: 7 });
		await transport.begin({ meter: METER_4_4, tempo: tempo(60), accompaniment: clicks });
		// a bar lasts 4 s: one bar is enough
		expect(transport.breath(5)).toEqual({ from: 5, to: 6 });
	});
});

describe('Transport.countIn', () => {
	async function started() {
		const ctx = setup();
		await ctx.transport.begin({ meter: METER_4_4, tempo: tempo(120), accompaniment: clicks });
		// begin fills bars 0-1 (listen-in) and 2 (count); two more clicked bars follow
		ctx.transport.accompany(3, 4, clicks);
		return ctx;
	}

	it('counts one bar in the middle of a series, then play resumes on the next downbeat', async () => {
		const { transport } = await started();
		expect(transport.countIn(4)).toBe(5);
		expect([0, 1, 2, 3].map((beat) => transport.countdownAt(4, beat))).toEqual([4, 3, 2, 1]);
		expect(transport.countdownAt(5)).toBeNull();
	});

	it('keeps restBars silent before the counted bar', async () => {
		const { sounds, transport } = await started();
		const before = sounds.emitted().length;
		expect(transport.countIn(4, { restBars: 2 })).toBe(7);
		const added = sounds.emitted().slice(before);
		const startOf = (bar: number) => transport.map.toSeconds(f(bar));
		expect(added).toHaveLength(4);
		expect(added.every((s) => s.time >= startOf(6) - 1e-9 && s.time < startOf(7))).toBe(true);
		expect(added[0].sound).toBe('click-accent');
		expect(transport.countdownAt(4)).toBeNull();
		expect(transport.countdownAt(5)).toBeNull();
		expect(transport.countdownAt(6)).toBe(4);
	});

	it('refuses a count over bars already scheduled', async () => {
		const { transport } = await started();
		expect(() => transport.countIn(3)).toThrow(RangeError);
		expect(() => transport.countIn(4, { restBars: -1 })).toThrow(RangeError);
		expect(() => transport.countIn(4, { restBars: 1.5 })).toThrow(RangeError);
		expect(transport.countdownAt(3)).toBeNull();
	});
});

describe('Transport.changeTempo', () => {
	it('adds a segment at the bar and places the listen-in and the count at the new tempo', async () => {
		const { sounds, transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: offbeats });
		const before = sounds.emitted().length;
		const { playFrom } = transport.changeTempo(10, tempo(120), offbeats);
		expect(playFrom).toBe(13);
		expect(transport.map.segments).toHaveLength(2);
		expect(transport.map.segments[1].bpm).toBe(120);
		expect(transport.map.segments[1].at.toString()).toBe(f(10).mul(f(1)).toString());
		const added = sounds.emitted().slice(before);
		expect(added).toHaveLength(8);
		const start = transport.map.toSeconds(f(10));
		expect(added[0].time).toBeCloseTo(start + 0.5, 9);
		expect(added[4].sound).toBe('click-accent');
		expect(added[4].time).toBeCloseTo(start + 2 * 2, 9);
		expect(transport.countdownAt(12)).toBe(4);
		expect(transport.countdownAt(13)).toBeNull();
	});
});

describe('Transport.stop', () => {
	it('cancels the sounds and the wake-ups', async () => {
		const { clock, sounds, transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		let called = false;
		transport.at(f(1), () => (called = true));
		transport.stop();
		clock.time = 100;
		sounds.flush();
		expect(called).toBe(false);
		expect(sounds.emitted()).toEqual([]);
	});
});

describe('Transport.changeTempo after a breath', () => {
	it('flows from the breath into the new tempo with exact times', async () => {
		const { sounds, transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(120), accompaniment: clicks });
		transport.accompany(3, 10, clicks);
		const breath = transport.breath(10);
		const before = sounds.emitted().length;
		const { playFrom } = transport.changeTempo(breath.to, tempo(60), offbeats);
		expect(playFrom).toBe(breath.to + 3);
		const added = sounds.emitted().slice(before);
		const start = transport.map.toSeconds(f(breath.to));
		expect(added[0].time).toBeCloseTo(start + 1, 9);
		expect(added[4].time).toBeCloseTo(start + 2 * 4, 9);
		expect(start).toBeCloseTo(transport.map.origin + breath.to * 2, 9);
	});

	it('throws when accompaniment is already scheduled past the bar', async () => {
		const { transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		transport.accompany(3, 12, clicks);
		expect(() => transport.changeTempo(10, tempo(120), clicks)).toThrow(RangeError);
		expect(() => transport.changeTempo(12, tempo(120), clicks)).not.toThrow();
	});

	it('counts the begin bars as scheduled, and rejects a bar not after the last segment', async () => {
		const { transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		expect(() => transport.changeTempo(2, tempo(120), clicks)).toThrow(RangeError);
		expect(() => transport.changeTempo(0, tempo(120), clicks)).toThrow(/after/);
	});
});

describe('Transport.changeTempo after a figure', () => {
	it('throws while a played figure still runs past the bar', async () => {
		const { transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		const figure: Figure = {
			schema: 1,
			meter: METER_4_4,
			bars: 2,
			voices: [{ id: 'a', elements: [{ kind: 'note', duration: f(2), content: null }] }]
		};
		transport.playFigure(figure, 'play-along', 3);
		expect(() => transport.changeTempo(4, tempo(120), clicks)).toThrow(RangeError);
		expect(() => transport.changeTempo(5, tempo(120), clicks)).not.toThrow();
	});
});

describe('Transport runs', () => {
	it('schedules nothing when stopped during settle, and begin rejects with TransportStopped', async () => {
		const { clock, sounds, transport } = setup();
		let release = () => {};
		clock.settle = () => new Promise<void>((resolve) => (release = resolve));
		const begun = transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		transport.stop();
		release();
		await expect(begun).rejects.toBeInstanceOf(TransportStopped);
		expect(sounds.emitted()).toEqual([]);
	});

	it('keeps only the second run sounds when begun twice', async () => {
		const { clock, sounds, transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		clock.time = 6;
		const { map } = await transport.begin({
			meter: METER_4_4,
			tempo: tempo(100),
			accompaniment: clicks
		});
		expect(sounds.emitted()).toHaveLength(12);
		expect(sounds.emitted().every((s) => s.time >= map.origin)).toBe(true);
	});

	it('supersedes a begin still settling when another begins', async () => {
		const { clock, sounds, transport } = setup();
		let release = () => {};
		clock.settle = () => new Promise<void>((resolve) => (release = resolve));
		const first = transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		const firstRelease = release;
		const second = transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		firstRelease();
		release();
		await expect(first).rejects.toBeInstanceOf(TransportStopped);
		await second;
		expect(sounds.emitted()).toHaveLength(12);
	});
});

describe('Transport meter', () => {
	it('rejects an accompaniment of another meter', async () => {
		const { transport } = setup();
		await transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: clicks });
		const waltz = clickAccompaniment({
			meter: { count: 3, unit: f(1, 4), grouping: [1, 1, 1] },
			beats: [1],
			accent: [],
			bars: ['on']
		});
		expect(() => transport.accompany(3, 4, waltz)).toThrow(RangeError);
		expect(() => transport.changeTempo(10, tempo(120), waltz)).toThrow(RangeError);
	});

	it('rejects an accompaniment of another meter at begin', async () => {
		const { transport } = setup();
		const waltz = clickAccompaniment({
			meter: { count: 3, unit: f(1, 4), grouping: [1, 1, 1] },
			beats: [1],
			accent: [],
			bars: ['on']
		});
		await expect(
			transport.begin({ meter: METER_4_4, tempo: tempo(100), accompaniment: waltz })
		).rejects.toBeInstanceOf(RangeError);
	});
});
