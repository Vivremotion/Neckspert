import { describe, expect, it } from 'vitest';
import type { Execution, PlannedItem } from '$lib/domain/types';
import type { SessionSelector } from '$lib/domain/progress';
import type { RoundOutcome } from '$lib/domain/timing';
import { identifyRules, locateRules, mechanicRules } from '$lib/domain/mechanics';
import {
	FakeClock,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository
} from '$lib/testing/fakes';
import { AttemptRecorder } from './AttemptRecorder';

const F_ON_B = { string: 2, pitch: 'F' } as const;
const LOCATE_RUN: Execution = { exerciseId: 'locate-neck', tempoBpm: 80 };
const IDENTIFY_RUN: Execution = { exerciseId: 'identify-neck', tempoBpm: null };

function item(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		item: F_ON_B,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		...overrides
	};
}

function identifyItem(): PlannedItem {
	return item({
		exerciseId: 'identify-neck',
		mechanic: 'identify',
		item: { string: 6, fret: 3 },
		leadBeats: null
	});
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

function setup(selector?: Partial<SessionSelector>) {
	const clock = new FakeClock();
	const attempts = new InMemoryAttemptRepository();
	const cards = new InMemoryCardStateRepository();
	const recorded: unknown[] = [];
	const spy: SessionSelector = {
		next: () => null,
		record: (attempt) => {
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
		rules: mechanicRules
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
			locateRules.judge(F_ON_B, { midi: 65 }),
			LOCATE_RUN
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
		const a = passed.recorder.record(
			probe,
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 }),
			LOCATE_RUN
		);
		await a.stored;
		expect(a.attempt.temperature).toBe('cold');
		const missed = setup();
		const b = missed.recorder.record(
			probe,
			outcome({ verdict: 'wrong', correct: false, answer: { midi: 60 } }),
			1,
			locateRules.judge(F_ON_B, { midi: 60 }),
			LOCATE_RUN
		);
		await b.stored;
		expect(b.attempt.temperature).toBe('hot');
	});

	it('creates the card of a learning prompt the selector does not report', async () => {
		const { recorder, cards } = setup();
		const planned = item({ phase: 'learning', temperature: 'hot' });
		await recorder.record(
			planned,
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 }),
			LOCATE_RUN
		).stored;
		const card = await cards.get('locate:2:F');
		expect(card).toMatchObject({ mechanic: 'locate', item: F_ON_B, learnedAt: null });
	});

	it('records the confusion of a wrong note', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			item(),
			outcome({ verdict: 'wrong', correct: false, answer: { midi: 66 } }),
			1,
			locateRules.judge(F_ON_B, { midi: 66 }),
			LOCATE_RUN
		);
		expect(attempt.data).toEqual({
			item: F_ON_B,
			answer: { midi: 66 },
			confusion: { kind: 'semitone', delta: 1 }
		});
	});

	it('stores a tapped name and its confusion', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			identifyItem(),
			outcome({ verdict: 'wrong', correct: false, answer: { pitch: 'G#' }, laneBeat: null }),
			1,
			identifyRules.judge({ string: 6, fret: 3 }, 'G#'),
			IDENTIFY_RUN
		);
		expect(attempt.data).toEqual({
			item: { string: 6, fret: 3 },
			answer: { pitch: 'G#' },
			confusion: { kind: 'semitone', delta: 1 }
		});
	});

	it('stores no answer and no confusion when nothing was answered', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			item(),
			outcome({ verdict: 'wrong', correct: false, answer: null, timingOffsetMs: null }),
			1,
			null,
			LOCATE_RUN
		);
		expect(attempt.data).toEqual({ item: F_ON_B, answer: null, confusion: null });
	});

	it('stamps each attempt with its exercise, mechanic and execution tempo', () => {
		const { recorder } = setup();
		const locate = recorder.record(item(), outcome(), 1, locateRules.judge(F_ON_B, { midi: 65 }), {
			exerciseId: 'locate-neck',
			tempoBpm: 120
		}).attempt;
		const identify = recorder.record(
			identifyItem(),
			outcome({ answer: { pitch: 'G' }, laneBeat: null }),
			1,
			identifyRules.judge({ string: 6, fret: 3 }, 'G'),
			IDENTIFY_RUN
		).attempt;
		expect(locate).toMatchObject({
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			cardKey: 'locate:2:F',
			tempoBpm: 120
		});
		expect(identify).toMatchObject({
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			cardKey: 'identify:6:3',
			tempoBpm: null
		});
	});

	it('judges direct recall at the execution tempo', async () => {
		// A 2-beat lead at 80 bpm (1 500 ms) is direct recall; at 60 bpm (2 000 ms) it is not.
		const probe = item({ phase: 'probe', temperature: 'cold', leadBeats: 2 });
		const judged = locateRules.judge(F_ON_B, { midi: 65 });
		const atEighty = setup();
		const fast = atEighty.recorder.record(probe, outcome(), 1, judged, LOCATE_RUN);
		await fast.stored;
		const atSixty = setup();
		const slow = atSixty.recorder.record(probe, outcome(), 1, judged, {
			exerciseId: 'locate-neck',
			tempoBpm: 60
		});
		await slow.stored;
		expect([fast.attempt.temperature, slow.attempt.temperature]).toEqual(['cold', 'hot']);
	});
});
