import { describe, expect, it } from 'vitest';
import { GESTURE_LINK, summarizeGesture } from '$lib/domain/gesture';
import { gridById, gridChanges } from '$lib/domain/grid';
import { contentJudges } from '$lib/domain/judges';
import { chordGridRules, type ChordGridItem } from '$lib/domain/mechanics';
import type { StringNumber } from '$lib/domain/music';
import { DEFAULT_RESPONSE_WINDOWS } from '$lib/domain/exercise/windows';
import { figureParamsOf, RHYTHM_OFFBEATS } from '$lib/domain/exercise';
import { compileRound } from '$lib/domain/exercise/round';
import {
	Fraction,
	METER_4_4,
	PlanRound,
	attackPositions,
	createTempoMap,
	type CycleReport,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan
} from '$lib/domain/time';
import { cardKey, type Attempt, type Execution, type PlannedItem } from '$lib/domain/types';
import { changePlan } from '$lib/testing/plans';
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
import {
	recordedAttempt,
	roundPlanFromRecord,
	roundPlanRecord,
	type FigureAttemptData
} from './recordResponse';

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
		exerciseLevel: 0,
		item,
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		scope: 'iohefy-a'
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

const TEMPO = { at: Fraction.ZERO, bpm: 120, unit: Fraction.of(1, 4) };

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
	const plan = changePlan(item, METER_4_4, GESTURE_LINK);
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

function newAttempt(item: ChordGridItem, decided: string | null, ms: number) {
	const { clock } = makeRecorder();
	const outcome = newOutcome(item, decided, ms);
	const plan = changePlan(item, METER_4_4, GESTURE_LINK);
	return recordedAttempt({
		outcome,
		item: plannedOf(item),
		plan,
		data: (value) => chordGridPresenter.attemptData!(item, value),
		sessionId: 'sess-1',
		execution: RUN,
		promptedAt: clock.toEpochMs(PROMPT_S),
		cardKey: cardKey('chord-grid', chordGridRules.itemKey(item)),
		startAudioS: CHANGE_S,
		tempo: TEMPO,
		thresholds: null
	});
}

describe('recordedAttempt', () => {
	it('writes a gesture change as the target model asks', () => {
		const item = change(1);
		const attempt = newAttempt(item, RIGHT, 30);
		expect(attempt).toMatchObject({
			success: true,
			correct: true,
			timingOffsetMs: 30,
			reactionMs: 530,
			leadBeats: null,
			tempoBpm: 120,
			scope: 'iohefy-a',
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
		expect(plan).toEqual({
			...roundPlanRecord(changePlan(item, METER_4_4, GESTURE_LINK)),
			startAudioS: CHANGE_S,
			tempo: { at: '0', bpm: 120, unit: '1/4' }
		});
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
			...changePlan(change(1), METER_4_4, GESTURE_LINK),
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
		const ms = DEFAULT_RESPONSE_WINDOWS.lateMs + 100;
		const attempt = newAttempt(item, RIGHT, ms);
		expect(attempt).toMatchObject({ correct: true, success: false, timingOffsetMs: ms });
		expect((attempt.verdict.value as ResponseValue).verdict).toBe('offbeat');
	});

	it('lets the gesture summary read the new attempts', () => {
		const played: [number, string | null, number][] = [
			[0, RIGHT, 0],
			[1, WRONG, 10],
			[2, RIGHT, DEFAULT_RESPONSE_WINDOWS.lateMs + 100],
			[3, RIGHT, -40]
		];
		const withIds = (attempts: Omit<Attempt, 'id'>[]) =>
			attempts.map((attempt, id) => ({ ...attempt, id }));
		const passages = ['s:0', 's:1'];
		const make = () =>
			withIds(
				passages.flatMap((passage) =>
					played.map(([index, decided, ms]) => newAttempt(change(index, passage), decided, ms))
				)
			);
		const fresh = summarizeGesture([RUN], make());
		expect(fresh.exercises[0]).toMatchObject({ passagesPlayed: 2, changeSuccessRate: 0.5 });
		expect(fresh.misses).toHaveLength(2);
	});
	it('keeps the lead the item was played at', () => {
		const item = change(1);
		const { clock } = makeRecorder();
		const outcome = newOutcome(item, RIGHT, 0);
		const attempt = recordedAttempt({
			outcome,
			item: { ...plannedOf(item), leadBeats: 4 },
			plan: changePlan(item, METER_4_4, GESTURE_LINK),
			data: () => null,
			sessionId: 'sess-1',
			execution: RUN,
			promptedAt: clock.toEpochMs(PROMPT_S),
			cardKey: cardKey('chord-grid', chordGridRules.itemKey(item)),
			startAudioS: CHANGE_S,
			tempo: TEMPO,
			thresholds: null
		});
		expect(attempt.leadBeats).toBe(4);
	});

	it('writes no tempo scope for an execution without one', () => {
		const item = change(1);
		const { clock } = makeRecorder();
		const attempt = recordedAttempt({
			outcome: newOutcome(item, RIGHT, 0),
			item: plannedOf(item),
			plan: changePlan(item, METER_4_4, GESTURE_LINK),
			data: () => null,
			sessionId: 'sess-1',
			execution: { exerciseId: 'gesture-jam', tempoBpm: 120 },
			promptedAt: clock.toEpochMs(PROMPT_S),
			cardKey: cardKey('chord-grid', chordGridRules.itemKey(item)),
			startAudioS: CHANGE_S,
			tempo: TEMPO,
			thresholds: null
		});
		expect(attempt).not.toHaveProperty('scope');
	});
});

/** A cycle of the one-bar offbeats at level 1, its round compiled from the catalog. */
function offbeatsCycle(exact: boolean) {
	const [offbeats] = RHYTHM_OFFBEATS.figures ?? [];
	const item: PlannedItem = {
		exerciseId: RHYTHM_OFFBEATS.id,
		mechanic: 'figure',
		exerciseLevel: 0,
		item: { figureId: offbeats.id, level: 0 },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null
	};
	const plan = compileRound(RHYTHM_OFFBEATS, item, METER_4_4, { previewBeats: 0, fromRunStart: 0 });
	const tempo = { at: Fraction.ZERO, bpm: 80, unit: Fraction.of(1, 4) };
	const map = createTempoMap(10, [tempo]);
	const thresholds = figureParamsOf(RHYTHM_OFFBEATS, 0).thresholds;
	const round = new PlanRound({
		plan,
		clock: { map, start: Fraction.ZERO },
		judges: contentJudges,
		latency: null,
		thresholds,
		aids: ['cursor']
	});
	if (exact) {
		for (const at of attackPositions(offbeats.figure)) {
			round.observe({ time: map.toSeconds(at), sensor: 'attack', readable: true, payload: {} });
		}
	}
	const outcome = round.close(round.endTime);
	if (outcome === null) throw new Error('a cycle closed without an outcome');
	const attempt = recordedAttempt({
		outcome,
		item,
		plan,
		data: () => {
			throw new Error('a cycle has no response value to keep');
		},
		sessionId: 's1',
		execution: { exerciseId: RHYTHM_OFFBEATS.id, tempoBpm: 80 },
		promptedAt: 1234,
		cardKey: 'figure:offbeats-1@0',
		startAudioS: 12.5,
		tempo,
		thresholds
	});
	return { attempt, outcome, plan, thresholds };
}

describe('recordedAttempt, a cycle', () => {
	it('records a cycle round with its report and plan', () => {
		const { attempt, outcome, plan, thresholds } = offbeatsCycle(true);
		expect(attempt).toMatchObject({
			sessionId: 's1',
			exerciseId: 'rhythm-offbeats',
			mechanic: 'figure',
			cardKey: 'figure:offbeats-1@0',
			phase: 'free',
			temperature: 'hot',
			promptedAt: 1234,
			tempoBpm: 80,
			leadBeats: null,
			reactionMs: null,
			// No content: a cycle of pure rhythm judges no note.
			correct: null,
			success: true,
			aids: ['cursor']
		});
		expect(attempt.verdict).toEqual({ relation: 'cycle', version: 1, value: { passed: true } });
		expect(attempt.measures).toBe(outcome.measures);
		// Placement needs offsets: an exact cycle has one, at 0 ms.
		expect(attempt.timingOffsetMs).toBeCloseTo(0, 6);
		const data = attempt.data as FigureAttemptData;
		expect(data.item).toEqual({ figureId: 'offbeats-1', level: 0 });
		expect(data.level).toBe(0);
		expect((data.report as CycleReport).extra).toBe(0);
		// The plan it was judged against, where it started on the journal's clock, its tempo and
		// its thresholds, in plain JSON.
		const record = JSON.parse(JSON.stringify(attempt.plan));
		expect(record).toEqual({
			...roundPlanRecord(plan),
			startAudioS: 12.5,
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			thresholds
		});
		expect(roundPlanFromRecord(record)).toEqual(plan);
	});

	it('leaves the offset null when no attack gave a placement', () => {
		const { attempt } = offbeatsCycle(false);
		expect(attempt.success).toBe(false);
		expect(attempt.timingOffsetMs).toBeNull();
	});

	it('says a cycle with content is correct when no note is wrong nor missed', () => {
		const { attempt: rhythm, outcome, plan } = offbeatsCycle(true);
		const pitched: RoundPlan = {
			...plan,
			expectations: plan.expectations.map((e, k) => ({
				...e,
				content: { kind: 'pitch', value: { midi: 60 + k } }
			}))
		};
		const report = outcome.detail as CycleReport;
		const withVerdict = (verdict: CycleReport['expectations'][number]['verdict']) =>
			recordedAttempt({
				outcome: {
					...outcome,
					detail: {
						...report,
						expectations: report.expectations.map((e, k) => (k === 1 ? { ...e, verdict } : e))
					}
				},
				item: { ...plannedOf(change(1)), exerciseId: rhythm.exerciseId, mechanic: 'figure' },
				plan: pitched,
				data: () => null,
				sessionId: 's1',
				execution: { exerciseId: rhythm.exerciseId, tempoBpm: 80 },
				promptedAt: 0,
				cardKey: rhythm.cardKey,
				startAudioS: 0,
				tempo: null,
				thresholds: {}
			});
		expect(withVerdict('on-time').correct).toBe(true);
		expect(withVerdict('wrong-pitch').correct).toBe(false);
		expect(withVerdict('missed').correct).toBe(false);
		// Neither played nor missed: a lost beat dropped it.
		expect(withVerdict('dropped').correct).toBe(true);
		// Played in free time: no tempo kept.
		expect(withVerdict('on-time').plan).not.toHaveProperty('tempo');
	});
});

describe('roundPlanFromRecord', () => {
	it('reads back every field a plan record keeps', () => {
		const plan: RoundPlan = {
			...changePlan(change(1), METER_4_4, GESTURE_LINK),
			barOffset: Fraction.of(1, 2),
			listenUntil: Fraction.of(3, 4)
		};
		plan.expectations = plan.expectations.map((e) => ({
			...e,
			span: { until: Fraction.of(1, 2) },
			window: { ofGap: Fraction.of(1, 3) }
		}));
		expect(roundPlanFromRecord(JSON.parse(JSON.stringify(roundPlanRecord(plan))))).toEqual(plan);
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
