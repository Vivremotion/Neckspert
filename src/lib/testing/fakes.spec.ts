import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import type { Attempt, CardState } from '$lib/domain/types';
import {
	FakeChordVerifier,
	FakeClock,
	FakeDiagnosticSink,
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
