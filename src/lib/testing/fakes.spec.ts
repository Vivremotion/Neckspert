import { describe, expect, it } from 'vitest';
import type { Attempt, CardState } from '$lib/domain/types';
import type { BeatEvent } from '$lib/application/ports';
import {
	FakeChordVerifier,
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySettingsRepository
} from './fakes';

function attempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's1',
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		cardKey: 'locate:2:F',
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		tempoBpm: 80,
		leadBeats: 2,
		promptedAt: 1000,
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 10,
		reactionMs: 900,
		data: { item: { string: 2, pitch: 'F' }, answer: { midi: 65 }, confusion: null },
		observations: [],
		...overrides
	};
}

describe('FakeMetronome', () => {
	it('emits beats as the clock advances', () => {
		const clock = new FakeClock();
		const metronome = new FakeMetronome(clock);
		const beats: BeatEvent[] = [];
		metronome.onBeat((beat) => beats.push(beat));
		metronome.setTempo(120);
		metronome.start(1);

		clock.advance(1.45);
		metronome.flush();

		expect(beats.map((b) => b.index)).toEqual([0, 1]);
		expect(beats[1].time).toBeCloseTo(1.5);
		expect(beats[0].isDownbeat).toBe(true);
		expect(metronome.beatTime(4)).toBeCloseTo(3);
	});

	it('refuses a tempo change while running', () => {
		const metronome = new FakeMetronome(new FakeClock());
		metronome.start(0);
		expect(() => metronome.setTempo(100)).toThrow();
	});
});

describe('FakeNoteDetector', () => {
	it('only emits while running', async () => {
		const detector = new FakeNoteDetector();
		const seen: number[] = [];
		detector.onNote((onset) => seen.push(onset.midi));
		detector.emitNote({ time: 1, midi: 60, frequencyHz: 261.6, clarity: 0.95 });
		await detector.start(null);
		detector.emitNote({ time: 2, midi: 62, frequencyHz: 293.7, clarity: 0.95 });
		expect(seen).toEqual([62]);
	});

	it('only emits rejections while running', async () => {
		const detector = new FakeNoteDetector();
		const seen: number[] = [];
		detector.onRejected((rejection) => seen.push(rejection.time));
		const rejection = {
			reason: 'unclear' as const,
			attack: { frequencyHz: 220, clarity: 0.4 },
			sustain: { frequencyHz: 220, clarity: 0.5 }
		};
		detector.emitRejection({ ...rejection, time: 1 });
		await detector.start(null);
		detector.emitRejection({ ...rejection, time: 2 });
		expect(seen).toEqual([2]);
	});
});

describe('FakeChordVerifier', () => {
	const expectation = {
		opensAt: 1,
		expected: 'a',
		candidates: [{ id: 'a', kind: 'expected', notes: [{ string: 3 as const, fret: 2, midi: 57 }] }],
		style: 'strummed' as const
	};
	const report = { time: 1.2, windowMs: 250, decided: 'a', variants: [] };

	it('keeps every expectation in order', () => {
		const verifier = new FakeChordVerifier();
		verifier.expect(expectation);
		verifier.expect(null);
		expect(verifier.expectations).toEqual([expectation, null]);
	});

	it('emits reports to subscribers until they unsubscribe', () => {
		const verifier = new FakeChordVerifier();
		const received: unknown[] = [];
		const stop = verifier.onReport((r) => received.push(r));
		verifier.emit(report);
		stop();
		verifier.emit(report);
		expect(received).toEqual([report]);
	});
});

describe('in-memory repositories', () => {
	it('stores attempts with ids, oldest first', async () => {
		const repo = new InMemoryAttemptRepository();
		const first = await repo.add(attempt({ promptedAt: 2000 }));
		await repo.add(attempt({ promptedAt: 1000, sessionId: 's2' }));
		expect(first).toBe(1);
		expect((await repo.all()).map((a) => a.promptedAt)).toEqual([1000, 2000]);
		expect(await repo.listBySession('s2')).toHaveLength(1);
		expect(await repo.listSince(1500)).toHaveLength(1);
	});

	it('stores card states by key', async () => {
		const repo = new InMemoryCardStateRepository();
		const state = { key: 'locate:2:F' } as CardState;
		await repo.put(state);
		expect(await repo.get('locate:2:F')).toEqual(state);
	});

	it('merges settings over defaults', async () => {
		const repo = new InMemorySettingsRepository();
		expect((await repo.get()).locale).toBe('fr');
		expect((await repo.update({ calibrationOffsetMs: 42 })).calibrationOffsetMs).toBe(42);
		expect((await repo.get()).locale).toBe('fr');
	});
});
