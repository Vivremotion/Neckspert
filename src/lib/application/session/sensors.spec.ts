import { describe, expect, it } from 'vitest';
import {
	FakeAttackDetector,
	FakeChordVerifier,
	FakeClock,
	FakeNoteDetector
} from '$lib/testing/fakes';
import { attackSensor, chordSensor, noteSensor, tapSensor, type Observation } from './sensors';

describe('noteSensor', () => {
	it('dates each attack on the audio clock, latency removed', async () => {
		const detector = new FakeNoteDetector();
		await detector.start(null);
		const source = noteSensor(detector)({ latencyMs: 35, clock: new FakeClock() });
		const seen: Observation[] = [];
		source.onObservation((observation) => seen.push(observation));
		const onset = { time: 1.0, midi: 65, frequencyHz: 349.23, clarity: 0.95 };
		detector.emitNote(onset);
		expect(seen).toHaveLength(1);
		expect(seen[0].time).toBeCloseTo(0.965, 9);
		expect(seen[0].payload).toEqual({ midi: 65, frequencyHz: 349.23, clarity: 0.95 });
		expect(seen[0].readable).toBe(true);
	});

	it('emits a rejected attack as an unreadable observation, latency removed', async () => {
		const detector = new FakeNoteDetector();
		await detector.start(null);
		const source = noteSensor(detector)({ latencyMs: 30, clock: new FakeClock() });
		const seen: Observation[] = [];
		source.onObservation((observation) => seen.push(observation));
		detector.emitRejection({
			time: 1.0,
			reason: 'no-pitch',
			attack: { frequencyHz: 0, clarity: 0.2 },
			sustain: { frequencyHz: 0, clarity: 0.1 }
		});
		expect(seen).toHaveLength(1);
		expect(seen[0].time).toBeCloseTo(0.97, 9);
		expect(seen[0].payload).toEqual({
			reason: 'no-pitch',
			attack: { frequencyHz: 0, clarity: 0.2 },
			sustain: { frequencyHz: 0, clarity: 0.1 }
		});
		expect(seen[0].readable).toBe(false);
	});

	it('stops the stream once unsubscribed', async () => {
		const detector = new FakeNoteDetector();
		await detector.start(null);
		const source = noteSensor(detector)({ latencyMs: 0, clock: new FakeClock() });
		const seen: Observation[] = [];
		const unsubscribe = source.onObservation((observation) => seen.push(observation));
		unsubscribe();
		detector.emitNote({ time: 1, midi: 65, frequencyHz: 349.23, clarity: 0.95 });
		detector.emitRejection({
			time: 1,
			reason: 'no-pitch',
			attack: { frequencyHz: 0, clarity: 0.2 },
			sustain: { frequencyHz: 0, clarity: 0.1 }
		});
		expect(seen).toEqual([]);
	});
});

describe('attackSensor', () => {
	it('dates each attack minus the calibrated latency, readable, with its strength', () => {
		const detector = new FakeAttackDetector();
		const source = attackSensor(detector)({ latencyMs: 12, clock: new FakeClock() });
		const seen: Observation[] = [];
		source.onObservation((observation) => seen.push(observation));
		detector.emit({ time: 1, strength: 0.5 });
		detector.emit({ time: 2, strength: 0.9, channel: 1 });
		expect(seen).toHaveLength(2);
		expect(seen[0].time).toBeCloseTo(0.988, 9);
		expect(seen[0].payload).toEqual({ strength: 0.5 });
		expect(seen[0].readable).toBe(true);
		expect(seen[1].payload).toEqual({ strength: 0.9, channel: 1 });
	});

	it('keeps the pre-attack folded into an attack in its payload', () => {
		const detector = new FakeAttackDetector();
		const source = attackSensor(detector)({ latencyMs: 0, clock: new FakeClock() });
		const seen: Observation[] = [];
		source.onObservation((observation) => seen.push(observation));
		detector.emit({ time: 1, strength: 0.7, preAttack: { beforeMs: 48, belowDb: 15 } });
		expect(seen[0].payload).toEqual({ strength: 0.7, preAttack: { beforeMs: 48, belowDb: 15 } });
	});

	it('stops listening once unsubscribed', () => {
		const detector = new FakeAttackDetector();
		const source = attackSensor(detector)({ latencyMs: 0, clock: new FakeClock() });
		const seen: Observation[] = [];
		const unsubscribe = source.onObservation((observation) => seen.push(observation));
		expect(detector.listeners).toBe(1);
		unsubscribe();
		detector.emit({ time: 1, strength: 0.5 });
		expect(detector.listeners).toBe(0);
		expect(seen).toEqual([]);
	});
});

describe('tapSensor', () => {
	it('dates a pushed value at the audio clock time', () => {
		const clock = new FakeClock();
		clock.advance(2.5);
		const source = tapSensor()({ latencyMs: 35, clock });
		const seen: Observation[] = [];
		source.onObservation((observation) => seen.push(observation));
		source.push!('G');
		expect(seen).toEqual([{ time: clock.now(), payload: 'G', readable: true }]);
	});

	it('stops the stream once unsubscribed', () => {
		const source = tapSensor()({ latencyMs: 0, clock: new FakeClock() });
		const seen: Observation[] = [];
		source.onObservation((observation) => seen.push(observation))();
		source.push!('G');
		expect(seen).toEqual([]);
	});
});

describe('chordSensor', () => {
	const expectation = {
		opensAt: 1,
		expected: ['a'],
		candidates: [],
		style: 'strummed' as const
	};

	it('hands the expectation to the verifier', () => {
		const verifier = new FakeChordVerifier();
		const source = chordSensor(verifier)({ latencyMs: 25, clock: new FakeClock() });
		source.expect?.(expectation);
		source.expect?.(null);
		expect(verifier.expectations).toEqual([expectation, null]);
	});

	it('dates each report at its attack, latency removed, the rest as payload', () => {
		const verifier = new FakeChordVerifier();
		const source = chordSensor(verifier)({ latencyMs: 25, clock: new FakeClock() });
		const seen: Observation[] = [];
		const stop = source.onObservation((observation) => seen.push(observation));
		const report = {
			time: 2,
			windowMs: 250,
			decided: 'a',
			final: false,
			variants: [{ id: 'default', decided: 'a', scores: { a: 0.8 } }]
		};
		verifier.emit(report);
		stop();
		verifier.emit(report);
		expect(seen).toHaveLength(1);
		expect(seen[0].time).toBeCloseTo(1.975, 9);
		expect(seen[0].readable).toBe(true);
		expect(seen[0].final).toBe(false);
		expect(seen[0].payload).toEqual({
			windowMs: 250,
			decided: 'a',
			final: false,
			variants: [{ id: 'default', decided: 'a', scores: { a: 0.8 } }]
		});
	});
});
