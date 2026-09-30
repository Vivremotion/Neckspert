import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioClock } from './WebAudioClock';

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
