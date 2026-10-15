import { describe, expect, it } from 'vitest';
import { FakeClock, FakeSoundScheduler } from '$lib/testing/fakes';
import {
	Fraction,
	METER_4_4,
	clickAccompaniment,
	type Figure,
	type TempoSegment
} from '$lib/domain/time';
import { BREATH_MIN_MS, LISTEN_IN_BARS, Transport } from './transport';

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
