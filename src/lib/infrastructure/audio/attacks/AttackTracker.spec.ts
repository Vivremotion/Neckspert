import { describe, expect, it } from 'vitest';
import { MIN_ATTACK_GAP_MS } from './config';
import { AttackTracker } from './AttackTracker';
import { feed, glide, hum, mutedBurst, plucks, vibratoNote } from './testing/signals';

const RATES = [48000, 44100, 16000] as const;
const tol = (rate: number) => (rate === 16000 ? 0.003 : 0.002);

describe('AttackTracker', () => {
	it.each(RATES)('dates a single pluck within tolerance at %i Hz', (rate) => {
		const attacks = feed(
			new AttackTracker(rate),
			plucks({ rate, durationS: 1, attacksS: [0.3] }),
			rate
		);
		expect(attacks).toHaveLength(1);
		expect(Math.abs(attacks[0].time - 0.3)).toBeLessThanOrEqual(tol(rate));
	});

	it.each([0.075, 0.05, 0.03])('separates plucks %f s apart', (gap) => {
		const rate = 48000;
		const times = [0.2, 0.2 + gap, 0.2 + 2 * gap, 0.2 + 3 * gap];
		const attacks = feed(
			new AttackTracker(rate),
			plucks({ rate, durationS: 1, attacksS: times, hz: 330 }),
			rate
		);
		expect(attacks.map((a) => a.time)).toHaveLength(4);
		attacks.forEach((a, i) => expect(Math.abs(a.time - times[i])).toBeLessThanOrEqual(0.002));
	});

	it('hears a muted strum (pitchless burst)', () => {
		const rate = 48000;
		const attacks = feed(
			new AttackTracker(rate),
			mutedBurst({ rate, durationS: 0.6, atS: 0.25 }),
			rate
		);
		expect(attacks).toHaveLength(1);
	});

	it('gives one attack for a held note with vibrato (±50 cents, 5.5 Hz)', () => {
		const rate = 48000;
		const signal = vibratoNote({
			rate,
			durationS: 2,
			atS: 0.2,
			hz: 330,
			depthCents: 50,
			rateHz: 5.5
		});
		expect(feed(new AttackTracker(rate), signal, rate)).toHaveLength(1);
	});

	it('gives one attack for a two-semitone bend', () => {
		const rate = 48000;
		const signal = glide({ rate, durationS: 1.5, atS: 0.2, fromHz: 330, toHz: 370, glideS: 0.3 });
		expect(feed(new AttackTracker(rate), signal, rate)).toHaveLength(1);
	});

	it('hears soft playing at −30 dBFS but not hum at −60 dBFS', () => {
		const rate = 48000;
		const soft = plucks({ rate, durationS: 1, attacksS: [0.4], amplitude: 0.0316 });
		expect(feed(new AttackTracker(rate), soft, rate)).toHaveLength(1);
		expect(
			feed(new AttackTracker(rate), hum({ rate, durationS: 2, amplitude: 0.001 }), rate)
		).toHaveLength(0);
	});

	it.each(RATES)('counts the same attacks at %i Hz', (rate) => {
		const times = [0.2, 0.45, 0.6, 0.9];
		expect(
			feed(new AttackTracker(rate), plucks({ rate, durationS: 1.2, attacksS: times }), rate)
		).toHaveLength(4);
	});

	it('makes no attack out of a gap in the frames', () => {
		const rate = 48000;
		const signal = vibratoNote({ rate, durationS: 2, atS: 0.1, hz: 220, depthCents: 0, rateHz: 1 });
		expect(feed(new AttackTracker(rate), signal, rate, 512, 0, 1.0)).toHaveLength(1);
	});

	it('reports a strength between 0 and 1, larger for a harder pick', () => {
		const rate = 48000;
		const soft = plucks({ rate, durationS: 1.5, attacksS: [0.2], amplitude: 0.05 });
		const hard = plucks({ rate, durationS: 1.5, attacksS: [0.9], amplitude: 0.4 });
		const attacks = feed(
			new AttackTracker(rate),
			soft.map((v, i) => v + hard[i]),
			rate
		);
		expect(attacks).toHaveLength(2);
		expect(attacks[1].strength).toBeGreaterThan(attacks[0].strength);
		for (const a of attacks) {
			expect(a.strength).toBeGreaterThanOrEqual(0);
			expect(a.strength).toBeLessThanOrEqual(1);
		}
	});
});

describe('AttackTracker refinement fallback', () => {
	it('keeps the minimum gap from the previous attack when no sample crosses the threshold', () => {
		const rate = 48000;
		const perMs = rate / 1000;
		// Reaches into the tracker: digital silence after an onset 20 ms before the peak frame's end
		// finds no onset in the window, which opens only 25 ms after the last one.
		const inner = new AttackTracker(rate) as unknown as {
			received: number;
			lastOnset: number;
			refine(end: number): number;
		};
		const end = 20000;
		inner.received = end + 4800;
		inner.lastOnset = end - 20 * perMs;
		const onset = inner.refine(end);
		expect(onset - inner.lastOnset).toBeGreaterThanOrEqual(MIN_ATTACK_GAP_MS * perMs);
	});
});
