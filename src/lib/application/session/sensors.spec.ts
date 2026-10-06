import { describe, expect, it } from 'vitest';
import { FakeClock, FakeNoteDetector } from '$lib/testing/fakes';
import { noteSensor, tapSensor, type Observation } from './sensors';

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
