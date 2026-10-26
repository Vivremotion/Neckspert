import { describe, expect, it } from 'vitest';
import { GESTURE_LINK, gesturePlan, summarizeGesture } from '$lib/domain/gesture';
import { gridById, gridChanges } from '$lib/domain/grid';
import { contentJudges } from '$lib/domain/judges';
import { chordGridRules, type ChordGridItem } from '$lib/domain/mechanics';
import type { StringNumber } from '$lib/domain/music';
import { LATE_LIMIT_MS } from '$lib/domain/scoring/timing';
import {
	Fraction,
	METER_4_4,
	PlanRound,
	createTempoMap,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan
} from '$lib/domain/time';
import type { RoundOutcome as OldRoundOutcome } from '$lib/domain/timing';
import { cardKey, type Attempt, type Execution, type PlannedItem } from '$lib/domain/types';
import { chordGridPresenter } from '$lib/application/mechanics/chordGrid';
import {
	FakeClock,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository
} from '$lib/testing/fakes';
import { shapeId } from '$lib/testing/shapes';
import { AttemptRecorder } from '../AttemptRecorder';
import { aidsOf } from '../aids';
import { ObservationSpan } from '../observationSpan';
import { responseAttempt, roundPlanRecord } from './recordResponse';

const G_B_E: StringNumber[] = [3, 2, 1];
const IOHEFY = gridChanges(gridById('iohefy-a'));
const RIGHT = shapeId('D', 'min', G_B_E, '7-6-5');
const WRONG = shapeId('D', 'maj', G_B_E, '7-7-5');

function change(index: number, passageId = 's:0'): ChordGridItem {
	return {
		rule: 'jam',
		element: 'jam:iohefy-a',
		passageId,
		index,
		changes: IOHEFY,
		symbol: IOHEFY[index].symbol,
		chord: 'D|min',
		sets: [G_B_E],
		previous: null
	};
}

function plannedOf(item: ChordGridItem): PlannedItem {
	return {
		exerciseId: 'gesture-jam',
		mechanic: 'chord-grid',
		item,
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		tempoScope: 'iohefy-a'
	};
}

const RUN: Execution = { exerciseId: 'gesture-jam', scope: 'iohefy-a', tempoBpm: 120 };

/** ♩ = 120 bpm from 0.1 s: a beat lasts 0.5 s; the change is on beat 4, at 2.1 s. */
const ORIGIN_S = 0.1;
const SECONDS_PER_BEAT = 0.5;
const beatTime = (beat: number) => ORIGIN_S + beat * SECONDS_PER_BEAT;
const CHANGE_BEAT = 4;
const CHANGE_S = beatTime(CHANGE_BEAT);
const PROMPT_S = beatTime(CHANGE_BEAT - 1);

const reading = (decided: string | null) => ({ decided, windowMs: 300, final: true, variants: [] });

function makeRecorder() {
	const clock = new FakeClock();
	const attempts = new InMemoryAttemptRepository();
	const recorder = new AttemptRecorder({
		attempts,
		cards: new InMemoryCardStateRepository(),
		clock,
		now: () => clock.toEpochMs(clock.now()),
		selector: { next: () => null, record: () => null, cardChanged: () => {} },
		sessionId: 'sess-1',
		rules: () => chordGridRules
	});
	return { recorder, attempts, clock };
}

/** A change played on the new path: its plan judged by a PlanRound, an attack `ms` after the change. */
function newOutcome(item: ChordGridItem, decided: string | null, ms: number): RoundOutcome {
	const plan = gesturePlan(item, METER_4_4, GESTURE_LINK);
	const map = createTempoMap(ORIGIN_S, [{ at: Fraction.ZERO, bpm: 120, unit: Fraction.of(1, 4) }]);
	const round = new PlanRound({
		plan,
		clock: { map, start: Fraction.of(CHANGE_BEAT, 4) },
		judges: contentJudges,
		latency: { ms: 0, provenance: 'system' },
		thresholds: null,
		aids: aidsOf(plannedOf(item))
	});
	const time = CHANGE_S + ms / 1000;
	const event = round.observe({
		time,
		sensor: 'chord',
		readable: true,
		payload: reading(decided),
		final: true
	}).event;
	const outcome = event.kind === 'settled' ? event.outcome : round.close(round.endTime);
	if (!outcome) throw new Error('the round settled nothing');
	return outcome;
}

/** The same change on the old path: the grid relation's round, the old recorder's entry. */
function oldAttempt(item: ChordGridItem, decided: string | null, ms: number): Attempt {
	const { recorder } = makeRecorder();
	const round = chordGridRules.timing.open({
		planned: plannedOf(item),
		promptBeat: CHANGE_BEAT - 1,
		now: 0,
		beatTime,
		secondsPerBeat: SECONDS_PER_BEAT,
		chained: false
	});
	const judged = chordGridRules.judge(item, reading(decided));
	const event = round.observe({
		time: CHANGE_S + ms / 1000,
		correct: judged.correct,
		answer: judged.answer,
		confusion: judged.confusion,
		sensor: 'chord',
		final: true
	});
	const outcome: OldRoundOutcome | null =
		event.kind === 'settled' ? event.outcome : round.abandon(CHANGE_S + 2);
	if (!outcome) throw new Error('the old round settled nothing');
	return recorder.record(plannedOf(item), outcome, PROMPT_S, judged, RUN, []).attempt;
}

function newAttempt(item: ChordGridItem, decided: string | null, ms: number) {
	const { clock } = makeRecorder();
	const outcome = newOutcome(item, decided, ms);
	const plan = gesturePlan(item, METER_4_4, GESTURE_LINK);
	return responseAttempt({
		outcome,
		item: plannedOf(item),
		plan,
		data: chordGridPresenter.attemptData!(item, outcome.verdict.value as ResponseValue),
		sessionId: 'sess-1',
		execution: RUN,
		promptedAt: clock.toEpochMs(PROMPT_S),
		cardKey: cardKey('chord-grid', chordGridRules.itemKey(item))
	});
}

/** What the target model keeps of a gesture attempt as it is today. */
const KEPT = [
	'sessionId',
	'exerciseId',
	'mechanic',
	'cardKey',
	'phase',
	'temperature',
	'aids',
	'promptedAt',
	'tempoBpm',
	'tempoScope',
	'leadBeats',
	'timingOffsetMs',
	'reactionMs',
	'correct',
	'success',
	'data'
] as const;

const kept = (attempt: Omit<Attempt, 'id'>) =>
	Object.fromEntries(KEPT.map((key) => [key, attempt[key]]));

describe('responseAttempt', () => {
	it('writes a gesture change as the target model asks', () => {
		const item = change(1);
		const attempt = newAttempt(item, RIGHT, 30);
		expect(kept(attempt)).toEqual(kept(oldAttempt(item, RIGHT, 30)));
		expect(attempt).toMatchObject({
			success: true,
			correct: true,
			timingOffsetMs: 30,
			reactionMs: 530,
			leadBeats: null,
			tempoBpm: 120,
			tempoScope: 'iohefy-a',
			temperature: 'hot',
			phase: 'free',
			measures: {},
			data: { item, answer: { decided: RIGHT }, confusion: null }
		});
		expect(attempt.verdict).toMatchObject({
			relation: 'response',
			version: 1,
			value: { verdict: 'perfect', timingOffsetMs: 30, reactionMs: 530 }
		});

		const plan = JSON.parse(JSON.stringify(attempt.plan));
		expect(plan).toEqual(roundPlanRecord(gesturePlan(item, METER_4_4, GESTURE_LINK)));
		expect(plan).toMatchObject({
			prompt: '-1/4',
			length: '1',
			handover: '1',
			countEndsOn: 'target',
			mutedBars: [],
			policy: { unit: 'response', verdict: 'response', pairing: { mode: 'first-answer' } },
			expectations: [
				{
					at: '0',
					span: 'point',
					role: 'target',
					sensor: 'chord',
					content: { kind: 'chord-grid', value: { element: 'jam:iohefy-a', index: 1 } },
					window: { ms: expect.any(Number) },
					bar: 0
				}
			]
		});
	});

	it('keeps where a plan places its target in its bar', () => {
		const plan = {
			...gesturePlan(change(1), METER_4_4, GESTURE_LINK),
			barOffset: Fraction.of(1, 2)
		};
		expect(roundPlanRecord(plan)).toMatchObject({ countEndsOn: 'target', barOffset: '1/2' });
		const bare: RoundPlan = { ...plan };
		delete bare.barOffset;
		delete bare.countEndsOn;
		const record = roundPlanRecord(bare);
		expect('barOffset' in record || 'countEndsOn' in record).toBe(false);
	});

	it('keeps an offbeat change correct but not a success', () => {
		const item = change(1);
		const ms = LATE_LIMIT_MS + 100;
		const attempt = newAttempt(item, RIGHT, ms);
		expect(kept(attempt)).toEqual(kept(oldAttempt(item, RIGHT, ms)));
		expect(attempt).toMatchObject({ correct: true, success: false, timingOffsetMs: ms });
		expect((attempt.verdict.value as ResponseValue).verdict).toBe('offbeat');
	});

	it('lets the gesture summary read the new attempts', () => {
		const played: [number, string | null, number][] = [
			[0, RIGHT, 0],
			[1, WRONG, 10],
			[2, RIGHT, LATE_LIMIT_MS + 100],
			[3, RIGHT, -40]
		];
		const withIds = (attempts: Omit<Attempt, 'id'>[]) =>
			attempts.map((attempt, id) => ({ ...attempt, id }));
		const passages = ['s:0', 's:1'];
		const make = (build: typeof newAttempt) =>
			withIds(
				passages.flatMap((passage) =>
					played.map(([index, decided, ms]) => build(change(index, passage), decided, ms))
				)
			);
		const fresh = summarizeGesture([RUN], make(newAttempt));
		expect(fresh.exercises[0]).toMatchObject({ passagesPlayed: 2, changeSuccessRate: 0.5 });
		expect(fresh.misses).toHaveLength(2);
		expect(fresh).toEqual(summarizeGesture([RUN], make(oldAttempt)));
	});
	it('keeps the lead the item was played at', () => {
		const item = change(1);
		const { clock } = makeRecorder();
		const outcome = newOutcome(item, RIGHT, 0);
		const attempt = responseAttempt({
			outcome,
			item: { ...plannedOf(item), leadBeats: 4 },
			plan: gesturePlan(item, METER_4_4, GESTURE_LINK),
			data: null,
			sessionId: 'sess-1',
			execution: RUN,
			promptedAt: clock.toEpochMs(PROMPT_S),
			cardKey: cardKey('chord-grid', chordGridRules.itemKey(item))
		});
		expect(attempt.leadBeats).toBe(4);
	});

	it('writes no tempo scope for an execution without one', () => {
		const item = change(1);
		const { clock } = makeRecorder();
		const attempt = responseAttempt({
			outcome: newOutcome(item, RIGHT, 0),
			item: plannedOf(item),
			plan: gesturePlan(item, METER_4_4, GESTURE_LINK),
			data: null,
			sessionId: 'sess-1',
			execution: { exerciseId: 'gesture-jam', tempoBpm: 120 },
			promptedAt: clock.toEpochMs(PROMPT_S),
			cardKey: cardKey('chord-grid', chordGridRules.itemKey(item))
		});
		expect(attempt).not.toHaveProperty('tempoScope');
	});
});

describe('AttemptRecorder.recordResponse', () => {
	it('writes the attempt with the span so far, then completes it when the span closes', async () => {
		const { recorder, attempts } = makeRecorder();
		const item = change(1);
		const span = new ObservationSpan(PROMPT_S, plannedOf(item));
		const heard = { time: CHANGE_S, readable: true, payload: reading(RIGHT) };
		span.add('chord', heard, 'answer', true);
		const attempt = newAttempt(item, RIGHT, 0);

		const id = await recorder.recordResponse(attempt, span, plannedOf(item));
		const [stored] = await attempts.listByCard(attempt.cardKey);
		expect(stored).toMatchObject({ id, verdict: { relation: 'response' } });
		expect(stored.observations).toHaveLength(1);
		expect(recorder.sessionAttempts).toHaveLength(1);

		span.add('chord', { ...heard, time: CHANGE_S + 1 }, 'settled', true);
		span.close();
		await recorder.settled();
		const [completed] = await attempts.listByCard(attempt.cardKey);
		expect(completed.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
	});
});
