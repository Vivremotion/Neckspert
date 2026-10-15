import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import type { Attempt, CardState } from '$lib/domain/types';
import type { BeatEvent } from '$lib/application/ports';
import {
	FakeChordVerifier,
	FakeClock,
	FakeDiagnosticSink,
	FakeMetronome,
	FakeNoteDetector,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySettingsRepository
} from './fakes';

function attempt(overrides: AttemptOverrides): Attempt {
	return responseAttempt({
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
	});
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

	it('calls a wake-up once the clock reaches its time, never before', () => {
		const clock = new FakeClock();
		const metronome = new FakeMetronome(clock);
		const calledAt: number[] = [];
		metronome.start(1);
		metronome.at(1.3, () => calledAt.push(clock.now()));
		clock.advance(1.29);
		metronome.flush();
		expect(calledAt).toEqual([]);
		clock.advance(0.02);
		metronome.flush();
		metronome.flush();
		expect(calledAt).toHaveLength(1);
	});

	it('interleaves beats and wake-ups in the order they are due', () => {
		const clock = new FakeClock();
		// A beat at 1.0 s is announced at 0.9 s (lookahead 0.1).
		const metronome = new FakeMetronome(clock, 4, 0.1);
		metronome.setTempo(60);
		const order: string[] = [];
		metronome.onBeat((beat) => order.push(`beat ${beat.index}`));
		metronome.start(1);
		metronome.at(0.95, () => order.push('0.95'));
		metronome.at(0.85, () => order.push('0.85'));
		clock.advance(1);
		metronome.flush();
		expect(order).toEqual(['0.85', 'beat 0', '0.95']);
	});

	it('forgets a cancelled wake-up and every wake-up on stop', () => {
		const clock = new FakeClock();
		const metronome = new FakeMetronome(clock);
		const called: string[] = [];
		metronome.start(1);
		const cancel = metronome.at(0.5, () => called.push('cancelled'));
		cancel();
		metronome.at(0.6, () => called.push('stopped'));
		metronome.stop();
		metronome.start(1);
		clock.advance(1);
		metronome.flush();
		expect(called).toEqual([]);
	});

	it('lets a wake-up restart the metronome', () => {
		const clock = new FakeClock();
		const metronome = new FakeMetronome(clock, 4, 0.1);
		metronome.setTempo(60);
		const beats: number[] = [];
		metronome.onBeat((beat) => beats.push(beat.time));
		metronome.start(1);
		metronome.at(1.5, () => {
			metronome.stop();
			metronome.start(3);
		});
		clock.advance(3);
		metronome.flush();
		expect(beats).toEqual([1, 3]);
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
		expected: ['a'],
		candidates: [{ id: 'a', kind: 'expected', notes: [{ string: 3 as const, fret: 2, midi: 57 }] }],
		style: 'strummed' as const
	};
	const report = { time: 1.2, windowMs: 250, decided: 'a', final: true, variants: [] };

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

describe('FakeDiagnosticSink', () => {
	it('keeps events, audio chunks and takes in order', async () => {
		const sink = new FakeDiagnosticSink();
		expect(sink.enabled).toBe(true);
		const input = { label: 'USB', sampleRate: 48000, channelCount: 1, builtInGain: 1 };
		await sink.openTake({ startedAt: 1000, startedAudioTime: 2, input });
		sink.event('input.opened', 2, input);
		const samples = new Int16Array([1, 2, 3]);
		sink.audio({ audioTime: 2.5, sampleRate: 16000, samples });
		sink.event('input.closed', 3, null);
		await sink.closeTake(2000);

		expect(sink.events).toEqual([
			{ kind: 'input.opened', audioTime: 2, data: input },
			{ kind: 'input.closed', audioTime: 3, data: null }
		]);
		expect(sink.chunks).toEqual([{ audioTime: 2.5, sampleRate: 16000, samples }]);
		expect(sink.takes).toEqual([
			{ opened: { startedAt: 1000, startedAudioTime: 2, input }, endedAt: 2000 }
		]);
	});

	it('can start disabled, as a journal turned off', () => {
		const sink = new FakeDiagnosticSink(false);
		expect(sink.enabled).toBe(false);
		sink.enabled = true;
		expect(sink.enabled).toBe(true);
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
		expect((await repo.update({ clickBleed: true })).clickBleed).toBe(true);
		expect((await repo.get()).locale).toBe('fr');
	});
});
