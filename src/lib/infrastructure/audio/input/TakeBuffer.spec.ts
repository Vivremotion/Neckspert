import { describe, expect, it, vi } from 'vitest';
import { FRAME_SIZE, FakeFrameSource } from '../chords/testing/frames';
import { CLICK_DURATION_S, DOWNBEAT_CLICK } from '../sounds/clickSound';
import {
	REPLAY_START_DELAY_S,
	REPLAY_TIMEOUT_MARGIN_S,
	SESSION_TAKE_MAX_S,
	TakeBuffer
} from './TakeBuffer';

/** 512-sample frames last exactly half a second. */
const RATE = 2 * FRAME_SIZE;

/** Sample `i` of the signal is worth `i`, so a slice says where it was taken. */
function ramp(seconds: number): Float32Array {
	const signal = new Float32Array(seconds * RATE);
	for (let i = 0; i < signal.length; i++) signal[i] = i;
	return signal;
}

class FakeParam {
	readonly calls: { method: string; value: number; time: number }[] = [];
	setValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'setValueAtTime', value, time });
		return this;
	}
	exponentialRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
		return this;
	}
}

class FakeNode {
	connect<T>(destination: T): T {
		return destination;
	}
}

class FakeBuffer {
	private readonly data: Float32Array;
	constructor(
		readonly length: number,
		readonly sampleRate: number
	) {
		this.data = new Float32Array(length);
	}
	getChannelData(): Float32Array {
		return this.data;
	}
}

class FakeBufferSource extends FakeNode {
	buffer: FakeBuffer | null = null;
	startTime: number | null = null;
	stopTime: number | null = null;
	onended: (() => void) | null = null;
	start(when = 0): void {
		this.startTime = when;
	}
	stop(when = 0): void {
		this.stopTime = when;
	}
}

class FakeFilter extends FakeNode {
	type = 'lowpass';
	readonly frequency = new FakeParam();
	readonly Q = new FakeParam();
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam();
}

class FakeAudioContext {
	currentTime = 0;
	readonly sampleRate = RATE;
	readonly destination = {};
	readonly sources: FakeBufferSource[] = [];
	readonly filters: FakeFilter[] = [];
	readonly gains: FakeGain[] = [];

	createBuffer(_channels: number, length: number, sampleRate: number): FakeBuffer {
		return new FakeBuffer(length, sampleRate);
	}
	createBufferSource(): FakeBufferSource {
		const source = new FakeBufferSource();
		this.sources.push(source);
		return source;
	}
	createBiquadFilter(): FakeFilter {
		const filter = new FakeFilter();
		this.filters.push(filter);
		return filter;
	}
	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}
}

function setup(seconds: number, startTime = 0) {
	const input = new FakeFrameSource(RATE, ramp(seconds), startTime);
	const audio = new FakeAudioContext();
	const take = new TakeBuffer(input, () => audio as unknown as AudioContext);
	return { input, audio, take };
}

describe('TakeBuffer, keeping the input', () => {
	it('keeps the frames from the time asked, and gives the samples of [from, to)', () => {
		const { input, take } = setup(4);
		take.keepFrom(0.5);
		input.playUntil(3.5);
		// 3 s kept, from 0.5 to 3.5.
		expect(Array.from(take.samples(1, 2))).toEqual(Array.from(ramp(4).slice(RATE, 2 * RATE)));
		expect(take.samples(1, 2)).toHaveLength(RATE);
		// Before the time asked, and after the last frame: silence.
		expect(Array.from(take.samples(0, 0.5)).every((s) => s === 0)).toBe(true);
		const tail = take.samples(3, 4);
		expect(Array.from(tail.slice(0, RATE / 2))).toEqual(
			Array.from(ramp(4).slice(3 * RATE, 3.5 * RATE))
		);
		expect(Array.from(tail.slice(RATE / 2)).every((s) => s === 0)).toBe(true);
	});

	it('keeps nothing before it is asked to', () => {
		const { input, take } = setup(2);
		input.playUntil(2);
		expect(Array.from(take.samples(0, 2)).every((s) => s === 0)).toBe(true);
	});

	it('a start already past keeps what came before it', () => {
		const { input, take } = setup(4);
		take.keepFrom(0);
		input.playUntil(2);
		// Asked a little late: nothing is forgotten, nothing is kept twice.
		take.keepFrom(1.5);
		input.playUntil(4);
		expect(Array.from(take.samples(0, 4))).toEqual(Array.from(ramp(4)));
	});

	it('stops keeping at the end asked, until the next start', () => {
		const { input, take } = setup(6);
		take.keepFrom(0);
		take.keepUntil(2);
		input.playUntil(4);
		expect(Array.from(take.samples(0, 2))).toEqual(Array.from(ramp(6).slice(0, 2 * RATE)));
		expect(Array.from(take.samples(2, 4)).every((s) => s === 0)).toBe(true);
		take.keepFrom(4);
		input.playUntil(6);
		expect(Array.from(take.samples(4, 6))).toEqual(Array.from(ramp(6).slice(4 * RATE)));
	});

	it('keeps every run of the session', () => {
		const { input, take } = setup(6);
		take.keepFrom(0);
		input.playUntil(2);
		take.keepUntil(2);
		take.keepFrom(3);
		input.playUntil(4);
		expect(Array.from(take.samples(0, 2))).toEqual(Array.from(ramp(6).slice(0, 2 * RATE)));
		expect(Array.from(take.samples(2, 3)).every((s) => s === 0)).toBe(true);
		expect(Array.from(take.samples(3, 4))).toEqual(Array.from(ramp(6).slice(3 * RATE, 4 * RATE)));
		expect(take.holds(0, 2)).toBe(true);
		expect(take.holds(3, 4)).toBe(true);
	});

	it('drops a start asked ahead of time once it stops keeping, the runs before whole', () => {
		const { input, take } = setup(8);
		take.keepFrom(0);
		input.playUntil(2);
		take.keepUntil(2);
		take.keepFrom(3);
		take.stopKeeping();
		input.playUntil(6);
		expect(Array.from(take.samples(2, 6)).every((s) => s === 0)).toBe(true);
		take.keepFrom(6);
		input.playUntil(8);
		expect(Array.from(take.samples(0, 2))).toEqual(Array.from(ramp(8).slice(0, 2 * RATE)));
		expect(Array.from(take.samples(6, 8))).toEqual(Array.from(ramp(8).slice(6 * RATE)));
	});

	it(`forgets the oldest input past ${SESSION_TAKE_MAX_S} s kept`, () => {
		expect(SESSION_TAKE_MAX_S).toBe(360);
		const { input, take } = setup(400);
		take.keepFrom(0);
		input.playUntil(400);
		expect(Array.from(take.samples(0, 10)).every((s) => s === 0)).toBe(true);
		const kept = take.samples(40, 400);
		expect(kept[0]).toBe(40 * RATE);
		expect(kept[kept.length - 1]).toBe(400 * RATE - 1);
		expect(take.holds(0, 10)).toBe(false);
		expect(take.holds(390, 400)).toBe(true);
	});

	it('holds nothing not yet heard', () => {
		const { input, take } = setup(4);
		take.keepFrom(0);
		input.playUntil(2);
		expect(take.holds(0, 2)).toBe(true);
		expect(take.holds(1, 3)).toBe(false);
	});

	it('clear forgets everything', () => {
		const { input, take } = setup(4);
		take.keepFrom(0);
		input.playUntil(2);
		take.clear();
		expect(take.holds(0, 2)).toBe(false);
		expect(Array.from(take.samples(0, 2)).every((s) => s === 0)).toBe(true);
	});
});

describe('TakeBuffer, playing a take', () => {
	it('plays the samples kept, with the sounds at their times shifted by the latency', async () => {
		const { input, audio, take } = setup(4, 10);
		take.keepFrom(10);
		input.playUntil(4);
		audio.currentTime = 20;
		const done = take.play(
			11,
			13,
			[
				{ time: 10.5, sound: 'click' },
				{ time: 12, sound: 'click-accent' },
				{ time: 13, sound: 'click' }
			],
			0.03
		);
		const [recorded, ...bursts] = audio.sources;
		const start = 20 + REPLAY_START_DELAY_S;
		expect(recorded.startTime).toBeCloseTo(start, 9);
		expect(Array.from(recorded.buffer?.getChannelData() ?? [])).toEqual(
			Array.from(ramp(4).slice(RATE, 3 * RATE))
		);
		expect(recorded.buffer?.sampleRate).toBe(RATE);
		// Only the sound inside [from, to), a second in, heard where the input heard the player.
		expect(bursts).toHaveLength(1);
		expect(bursts[0].startTime).toBeCloseTo(start + 1 + 0.03, 9);
		expect(bursts[0].stopTime).toBeCloseTo(start + 1 + 0.03 + CLICK_DURATION_S, 9);
		expect(audio.filters[0].frequency.calls[0].value).toBe(DOWNBEAT_CLICK.filterHz);
		let resolved = false;
		void done.then(() => (resolved = true));
		await Promise.resolve();
		expect(resolved).toBe(false);
		recorded.onended?.();
		await expect(done).resolves.toBeUndefined();
	});

	it('stops a take under way, which then resolves', async () => {
		const { input, audio, take } = setup(2);
		take.keepFrom(0);
		input.playUntil(2);
		audio.currentTime = 5;
		const done = take.play(0, 2, [{ time: 1, sound: 'click' }], 0);
		audio.currentTime = 5.5;
		take.stop();
		await expect(done).resolves.toBeUndefined();
		expect(audio.sources.every((source) => source.stopTime !== null)).toBe(true);
	});

	it(`resolves ${REPLAY_TIMEOUT_MARGIN_S} s after the take's length when the output never ends it`, async () => {
		vi.useFakeTimers();
		try {
			const { input, audio, take } = setup(2);
			take.keepFrom(0);
			input.playUntil(2);
			let resolved = false;
			void take.play(0, 2, [], 0).then(() => (resolved = true));
			await vi.advanceTimersByTimeAsync((2 + REPLAY_START_DELAY_S) * 1000);
			expect(resolved).toBe(false);
			await vi.advanceTimersByTimeAsync(REPLAY_TIMEOUT_MARGIN_S * 1000);
			expect(resolved).toBe(true);
			expect(audio.sources[0].stopTime).not.toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('resolves at once when nothing is to be played', async () => {
		const { take, audio } = setup(1);
		await expect(take.play(3, 3, [], 0)).resolves.toBeUndefined();
		expect(audio.sources).toEqual([]);
	});
});
