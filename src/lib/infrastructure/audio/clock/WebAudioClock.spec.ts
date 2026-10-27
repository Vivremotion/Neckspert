import { afterEach, describe, expect, it, vi } from 'vitest';
import { OUTPUT_WARMUP_S, SETTLE_TIMEOUT_MS, WebAudioClock } from './WebAudioClock';

class FakeContext {
	currentTime = 0;
	resumeCalls = 0;

	constructor(public state: AudioContextState = 'suspended') {}

	async resume(): Promise<void> {
		this.resumeCalls++;
		this.state = 'running';
	}
}

class FakeContextWithTimestamp extends FakeContext {
	timestamp: AudioTimestamp = { contextTime: 0, performanceTime: 0 };

	getOutputTimestamp(): AudioTimestamp {
		return this.timestamp;
	}
}

function clockWith(fake: FakeContext) {
	const factory = vi.fn(() => fake as unknown as AudioContext);
	return { clock: new WebAudioClock(factory), factory };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('WebAudioClock', () => {
	it('does not create the AudioContext before resume()', () => {
		const { clock, factory } = clockWith(new FakeContext());
		expect(factory).not.toHaveBeenCalled();
		expect(() => clock.context()).toThrow(/resume/);
		expect(() => clock.now()).toThrow(/resume/);
		expect(() => clock.toEpochMs(0)).toThrow(/resume/);
	});

	it('can be constructed with the default factory outside a browser', () => {
		expect(() => new WebAudioClock()).not.toThrow();
	});

	it('creates one context and resumes it when suspended', async () => {
		const fake = new FakeContext('suspended');
		const { clock, factory } = clockWith(fake);
		await Promise.all([clock.resume(), clock.resume()]);
		expect(factory).toHaveBeenCalledTimes(1);
		expect(clock.context()).toBe(fake);
		expect(fake.state).toBe('running');
	});

	it('does not resume a running context', async () => {
		const fake = new FakeContext('running');
		const { clock } = clockWith(fake);
		await clock.resume();
		expect(fake.resumeCalls).toBe(0);
	});

	it('reads the audio time from the context', async () => {
		const fake = new FakeContext();
		const { clock } = clockWith(fake);
		await clock.resume();
		fake.currentTime = 12.5;
		expect(clock.now()).toBe(12.5);
	});
});

describe('WebAudioClock.toEpochMs', () => {
	it('uses the output timestamp when the context provides one', async () => {
		const fake = new FakeContextWithTimestamp('running');
		fake.currentTime = 10.2;
		fake.timestamp = { contextTime: 10, performanceTime: 5000 };
		const { clock } = clockWith(fake);
		await clock.resume();
		const expected = performance.timeOrigin + 5000 + (10.5 - 10) * 1000;
		expect(clock.toEpochMs(10.5)).toBeCloseTo(expected, 2);
	});

	it('falls back to Date.now() while the output timestamp is not ready', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
		const fake = new FakeContextWithTimestamp('running');
		fake.currentTime = 20;
		const { clock } = clockWith(fake);
		await clock.resume();
		expect(clock.toEpochMs(19.5)).toBe(1_790_000_000_000 - 500);
	});

	it('falls back to Date.now() without getOutputTimestamp', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
		const fake = new FakeContext('running');
		fake.currentTime = 3;
		const { clock } = clockWith(fake);
		await clock.resume();
		expect(clock.toEpochMs(4)).toBe(1_790_000_000_000 + 1000);
	});
});

describe('WebAudioClock.epochNow', () => {
	it('reads the wall time before resume(), no context created', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
		const { clock, factory } = clockWith(new FakeContext());
		expect(clock.epochNow()).toBe(1_790_000_000_000);
		expect(factory).not.toHaveBeenCalled();
	});

	it('reads the audio clock once the context exists', async () => {
		const fake = new FakeContextWithTimestamp('running');
		fake.currentTime = 10.2;
		fake.timestamp = { contextTime: 10, performanceTime: 5000 };
		const { clock } = clockWith(fake);
		await clock.resume();
		const expected = performance.timeOrigin + 5000 + (10.2 - 10) * 1000;
		expect(clock.epochNow()).toBeCloseTo(expected, 2);
	});
});

describe('WebAudioClock.settle', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('waits until the output has played OUTPUT_WARMUP_S, the first sounds of a fresh output being lost', async () => {
		expect(OUTPUT_WARMUP_S).toBe(0.5);
		vi.useFakeTimers();
		const fake = new FakeContext();
		const { clock } = clockWith(fake);
		await clock.resume();
		let settled = false;
		void clock.settle().then(() => (settled = true));
		fake.currentTime = 0.2;
		await vi.advanceTimersByTimeAsync(200);
		expect(settled).toBe(false);
		fake.currentTime = 0.5;
		await vi.advanceTimersByTimeAsync(50);
		expect(settled).toBe(true);
	});

	it('does not wait for an output already running', async () => {
		const fake = new FakeContext();
		fake.currentTime = 12;
		const { clock } = clockWith(fake);
		await clock.resume();
		await expect(clock.settle()).resolves.toBeUndefined();
	});

	it('gives up waiting on a clock that does not move', async () => {
		vi.useFakeTimers();
		const { clock } = clockWith(new FakeContext());
		await clock.resume();
		let settled = false;
		void clock.settle().then(() => (settled = true));
		await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS);
		expect(settled).toBe(true);
	});
});
