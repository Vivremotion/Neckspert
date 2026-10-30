import {
	CYCLE_VERDICT,
	Fraction,
	type CycleReport,
	type CycleThresholds,
	type Expectation,
	type ExpectationWindow,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan,
	type TempoSegment
} from '$lib/domain/time';
import type { Attempt, CardKey, Execution, PlannedItem } from '$lib/domain/types';

/**
 * A round plan as an attempt keeps it, in plain JSON: fractions as text (`"3/8"`); with what the
 * round was played at, so it can be judged again whatever the catalog becomes: where it started
 * on the audio clock the diagnostic journal uses too (absent from the attempts stored before it
 * was kept), its tempo (none in free time) and the thresholds its verdict read (none for a
 * verdict that reads none).
 */
export interface RoundPlanRecord {
	prompt: string | null;
	expectations: {
		at: string | null;
		span: 'point' | { until: string };
		role: 'target' | 'judged-rest';
		sensor: string;
		content: { kind: string; value: unknown } | null;
		window: { ms: number } | { ofGap: string };
		bar: number;
	}[];
	length: string;
	policy: RoundPlan['policy'];
	handover?: string;
	listenUntil?: string;
	mutedBars: number[];
	countEndsOn?: 'prompt' | 'target';
	barOffset?: string;
	startAudioS?: number;
	tempo?: { at: string; bpm: number; unit: string };
	thresholds?: CycleThresholds;
}

/** The data of a round judged by the cycle verdict: its item, the level played, the judge's report. */
export interface FigureAttemptData {
	item: unknown;
	level: number;
	report: CycleReport;
}

function windowRecord(
	window: ExpectationWindow
): RoundPlanRecord['expectations'][number]['window'] {
	return 'ms' in window ? { ms: window.ms } : { ofGap: window.ofGap.toString() };
}

/** A plain JSON copy: a fraction anywhere inside becomes its text (`Fraction.toJSON`). */
function asJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** The plan as JSON, fractions as text, so an attempt keeps what it was judged against. */
export function roundPlanRecord(plan: RoundPlan): RoundPlanRecord {
	return {
		prompt: plan.prompt?.toString() ?? null,
		expectations: plan.expectations.map((e) => ({
			at: e.at?.toString() ?? null,
			span: e.span === 'point' ? 'point' : { until: e.span.until.toString() },
			role: e.role,
			sensor: e.sensor,
			content: e.content && { kind: e.content.kind, value: asJson(e.content.value) },
			window: windowRecord(e.window),
			bar: e.bar
		})),
		length: plan.length.toString(),
		policy: asJson(plan.policy),
		...(plan.handover && { handover: plan.handover.toString() }),
		...(plan.listenUntil && { listenUntil: plan.listenUntil.toString() }),
		mutedBars: [...plan.mutedBars],
		...(plan.countEndsOn && { countEndsOn: plan.countEndsOn }),
		...(plan.barOffset && { barOffset: plan.barOffset.toString() })
	};
}

function windowOf(record: RoundPlanRecord['expectations'][number]['window']): ExpectationWindow {
	return 'ms' in record ? { ms: record.ms } : { ofGap: Fraction.parse(record.ofGap) };
}

/** The plan a record keeps, as the judge reads it: what `roundPlanRecord` wrote, read back. */
export function roundPlanFromRecord(record: RoundPlanRecord): RoundPlan {
	const parse = (text: string | null) => (text === null ? null : Fraction.parse(text));
	const plan: RoundPlan = {
		prompt: parse(record.prompt),
		expectations: record.expectations.map((e): Expectation => ({
			at: parse(e.at),
			span: e.span === 'point' ? 'point' : { until: Fraction.parse(e.span.until) },
			role: e.role,
			sensor: e.sensor,
			content: e.content && { kind: e.content.kind, value: asJson(e.content.value) },
			window: windowOf(e.window),
			bar: e.bar
		})),
		length: Fraction.parse(record.length),
		policy: asJson(record.policy),
		mutedBars: [...record.mutedBars]
	};
	if (record.handover !== undefined) plan.handover = Fraction.parse(record.handover);
	if (record.listenUntil !== undefined) plan.listenUntil = Fraction.parse(record.listenUntil);
	if (record.countEndsOn !== undefined) plan.countEndsOn = record.countEndsOn;
	if (record.barOffset !== undefined) plan.barOffset = Fraction.parse(record.barOffset);
	return plan;
}

/**
 * The judge's word on the content of a cycle: null when no expectation asks for any (pure
 * rhythm); else whether none was played wrong nor missed (one a lost beat dropped is neither).
 */
function cycleCorrect(plan: RoundPlan, report: CycleReport): boolean | null {
	if (plan.expectations.every((e) => e.content === null)) return null;
	return report.expectations.every((e) => e.verdict !== 'wrong-pitch' && e.verdict !== 'missed');
}

/**
 * The attempt of a settled round, every round one way, on the target model: success, the
 * verdict envelope, measures and aids are the round's, and the plan it was judged against
 * (`roundPlanRecord`) with where it started, its tempo and its thresholds. A round judged by the
 * cycle verdict keeps its report (`FigureAttemptData`) and its placement as its offset, and is
 * correct as `cycleCorrect` says; any other keeps its presenter's data, its correctness, offset
 * and reaction read in its response value. The tempo and its scope are the execution's, the lead
 * the item's (the one played, which statistics read). In the item's phase; its temperature and
 * observations are the recorder's (`AttemptRecorder.recordResponse`), which settles them.
 */
export function recordedAttempt(input: {
	outcome: RoundOutcome;
	item: PlannedItem;
	plan: RoundPlan;
	/** The mechanic's data for a response value (`MechanicPresenter.attemptData`). */
	data: (value: ResponseValue) => unknown;
	sessionId: string;
	execution: Execution;
	/** Epoch ms of the prompt (a cycle's: its first bar). */
	promptedAt: number;
	cardKey: CardKey;
	/** Audio seconds of the round's start. */
	startAudioS: number;
	/** The tempo it was played at, from its start; null in free time. */
	tempo: TempoSegment | null;
	/** What its verdict judged against; null for a verdict that reads no thresholds. */
	thresholds: CycleThresholds | null;
}): Omit<Attempt, 'id'> {
	const { outcome, item, execution, tempo } = input;
	const cycle = outcome.verdict.relation === CYCLE_VERDICT;
	const report = outcome.detail as CycleReport;
	const value = outcome.verdict.value as ResponseValue;
	const data: unknown = cycle
		? ({ item: item.item, level: item.exerciseLevel, report } satisfies FigureAttemptData)
		: input.data(value);
	return {
		sessionId: input.sessionId,
		exerciseId: execution.exerciseId,
		mechanic: item.mechanic,
		cardKey: input.cardKey,
		phase: item.phase,
		temperature: 'hot',
		aids: [...outcome.aids],
		promptedAt: input.promptedAt,
		tempoBpm: execution.tempoBpm,
		...(execution.scope !== undefined && { scope: execution.scope }),
		leadBeats: item.leadBeats,
		timingOffsetMs: cycle ? (outcome.measures.placement?.value ?? null) : value.timingOffsetMs,
		reactionMs: cycle ? null : value.reactionMs,
		correct: cycle ? cycleCorrect(input.plan, report) : outcome.correct,
		success: outcome.success,
		verdict: outcome.verdict,
		measures: outcome.measures,
		plan: {
			...roundPlanRecord(input.plan),
			startAudioS: input.startAudioS,
			...(tempo && {
				tempo: { at: tempo.at.toString(), bpm: tempo.bpm, unit: tempo.unit.toString() }
			}),
			...(input.thresholds && { thresholds: { ...input.thresholds } })
		} satisfies RoundPlanRecord,
		data,
		observations: []
	};
}
