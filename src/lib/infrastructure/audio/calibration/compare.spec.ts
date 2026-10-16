import { describe, expect, it } from 'vitest';
import { loopLatency, pairedDelay } from './compare';

const BEAT_S = 0.75;
const clicks = Array.from({ length: 8 }, (_, i) => i * BEAT_S);

/** A deterministic ±1 noise, in the unit asked. */
function jitter(i: number, amplitude: number): number {
	return (((i * 7919) % 21) / 10 - 1) * amplitude;
}

describe('loopLatency', () => {
	it('gives the median delay of the clicks heard and the share heard', () => {
		const heard = clicks.slice(0, 7).map((t) => t + 0.012);
		const result = loopLatency(clicks, heard, 0.3);
		expect(result.ms).toBeCloseTo(12, 6);
		expect(result.heardRatio).toBe(0.875);
	});

	it('gives no latency when nothing was heard', () => {
		expect(loopLatency(clicks, [], 0.3)).toEqual({ ms: null, heardRatio: 0 });
	});

	it('ignores sounds outside the window and pairs one sound per click', () => {
		const heard = clicks.flatMap((t) => [t + 0.02, t + 0.05]);
		// A sound before any click, and one far after the last.
		heard.push(-0.2, 7 * BEAT_S + 0.5);
		const result = loopLatency(clicks, heard, 0.3);
		expect(result.ms).toBeCloseTo(20, 6);
		expect(result.heardRatio).toBe(1);
	});
});

describe('pairedDelay', () => {
	it('finds the delay between two readings of the same attacks', () => {
		const b = Array.from({ length: 16 }, (_, i) => 1 + i * 0.6 + (i % 3) * 0.07);
		const a = b.map((t, i) => t + 0.008 + jitter(i, 0.001));
		const result = pairedDelay(a, b, 0.03);
		expect(result).not.toBeNull();
		expect(result!.ms).toBeCloseTo(8, 0);
		expect(result!.spreadMs).toBeLessThanOrEqual(1);
		expect(result!.pairs).toBe(16);
	});

	it('finds a large constant offset, as Firefox gives (−121 ms)', () => {
		const b = Array.from({ length: 16 }, (_, i) => 2 + i * 0.5);
		const a = b.map((t, i) => t - 0.121 + jitter(i, 0.004));
		const result = pairedDelay(a, b, 0.03);
		expect(result!.ms).toBeCloseTo(-121, -1);
		expect(Math.abs(result!.ms + 121)).toBeLessThan(2);
		expect(result!.pairs).toBe(16);
	});

	it('is not moved by attacks of one input far from any attack of the other', () => {
		const b = Array.from({ length: 16 }, (_, i) => 2 + i * 0.8);
		const a = b.map((t, i) => t - 0.03 + jitter(i, 0.002));
		const clean = pairedDelay(a, b, 0.03);
		// The built-in mic hears the room: breaths, keys, a hand on the laptop, between the notes.
		const noise = Array.from({ length: 60 }, (_, i) => 2.3 + i * 0.21);
		const noisy = pairedDelay(
			a,
			[...b, ...noise].sort((x, y) => x - y),
			0.03
		);
		expect(noisy!.pairs).toBe(16);
		expect(noisy!.ms).toBeCloseTo(clean!.ms, 6);
		expect(noisy!.spreadMs).toBeCloseTo(clean!.spreadMs, 6);
	});

	it('pairs one to one', () => {
		const a = [1, 2, 3];
		// Two readings of b near the first attack: only one pairs with it.
		const b = [1.01, 1.012, 2.01, 3.01];
		expect(pairedDelay(a, b, 0.03)!.pairs).toBe(3);
	});

	it('gives null when no attack pairs', () => {
		expect(pairedDelay([1, 2, 3], [], 0.03)).toBeNull();
		expect(pairedDelay([1, 2, 3], [10, 20], 0.03)).toBeNull();
	});
});
