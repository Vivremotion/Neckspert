import { describe, expect, it } from 'vitest';
import { cardKey, type PlannedItem } from '$lib/domain/types';
import type { SessionSelector } from '$lib/domain/progress';
import type { RoundOutcome } from '$lib/domain/timing';
import { identifyRules, locateRules } from '$lib/domain/mechanics';
import {
	FakeClock,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository
} from '$lib/testing/fakes';
import { AttemptRecorder } from './AttemptRecorder';

function item(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		...overrides
	};
}

function outcome(overrides: Partial<RoundOutcome> = {}): RoundOutcome {
	return {
		verdict: 'perfect',
		correct: true,
		answer: { midi: 65 },
		timingOffsetMs: 0,
		reactionMs: null,
		laneBeat: 8,
		...overrides
	};
}

const F_ON_B = { string: 2, pitch: 'F' } as const;

function setup(selector?: Partial<SessionSelector>) {
	const clock = new FakeClock();
	const attempts = new InMemoryAttemptRepository();
	const cards = new InMemoryCardStateRepository();
	const recorded: unknown[] = [];
	const spy: SessionSelector = {
		next: () => null,
		record: (attempt, now) => {
			recorded.push(attempt);
			return null;
		},
		cardChanged: () => {},
		...selector
	};
	const recorder = new AttemptRecorder({
		attempts,
		cards,
		clock,
		now: () => clock.toEpochMs(clock.now()),
		selector: spy,
		sessionId: 'sess-1',
		tempoBpm: 80
	});
	return { recorder, attempts, cards, recorded };
}

describe('AttemptRecorder', () => {
	it('tells the selector before the attempt is stored', async () => {
		const { recorder, attempts, recorded } = setup();
		const { attempt, stored } = recorder.record(
			item(),
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 })
		);
		expect(recorder.sessionAttempts).toEqual([attempt]);
		expect(recorded).toEqual([attempt]);
		expect(await attempts.all()).toEqual([]);
		await stored;
		expect(await attempts.all()).toHaveLength(1);
	});

	it('stores a missed probe hot and a passed probe cold', async () => {
		const probe = item({ phase: 'probe', temperature: 'cold' });
		const passed = setup();
		const a = passed.recorder.record(probe, outcome(), 1, locateRules.judge(F_ON_B, { midi: 65 }));
		await a.stored;
		expect(a.attempt.temperature).toBe('cold');
		const missed = setup();
		const b = missed.recorder.record(
			probe,
			outcome({ verdict: 'wrong', correct: false, answer: { midi: 60 } }),
			1,
			locateRules.judge(F_ON_B, { midi: 60 })
		);
		await b.stored;
		expect(b.attempt.temperature).toBe('hot');
	});

	it('creates the card of a learning prompt the selector does not report', async () => {
		const { recorder, cards } = setup();
		const planned = item({ phase: 'learning', temperature: 'hot' });
		await recorder.record(planned, outcome(), 1, locateRules.judge(F_ON_B, { midi: 65 })).stored;
		const card = await cards.get(cardKey(planned.target));
		expect(card).toBeDefined();
		expect(card?.learnedAt).toBeNull();
	});

	it('records the confusion of a wrong note', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			item(),
			outcome({ verdict: 'wrong', correct: false, answer: { midi: 66 } }),
			1,
			locateRules.judge(F_ON_B, { midi: 66 })
		);
		expect(attempt.confusion).toEqual({ kind: 'semitone', delta: 1 });
		expect(attempt.answer).toEqual({ kind: 'note', midi: 66 });
	});

	it('stores a tapped name and its confusion', () => {
		const { recorder } = setup();
		const planned = item({
			target: { direction: 'identify', string: 6, fret: 3 },
			leadBeats: null
		});
		const { attempt } = recorder.record(
			planned,
			outcome({ verdict: 'wrong', correct: false, answer: { pitch: 'G#' }, laneBeat: null }),
			1,
			identifyRules.judge({ string: 6, fret: 3 }, 'G#')
		);
		expect(attempt.answer).toEqual({ kind: 'name', pitch: 'G#' });
		expect(attempt.confusion).toEqual({ kind: 'semitone', delta: 1 });
	});

	it('stores no answer and no confusion when nothing was answered', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			item(),
			outcome({ verdict: 'wrong', correct: false, answer: null, timingOffsetMs: null }),
			1,
			null
		);
		expect(attempt.answer).toBeNull();
		expect(attempt.confusion).toBeNull();
	});
});
