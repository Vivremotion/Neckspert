import type { ExpectationWindow, ResponseValue, RoundOutcome, RoundPlan } from '$lib/domain/time';
import type { Attempt, CardKey, Execution, PlannedItem } from '$lib/domain/types';

/** A round plan as an attempt keeps it, in plain JSON: fractions as text (`"3/8"`). */
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
		mutedBars: [...plan.mutedBars]
	};
}

/**
 * The attempt of a settled response round, on the target model: success, correct, the verdict
 * envelope, measures and aids are the round's; offset and reaction are read in its response
 * value; the tempo and its scope are the execution's, the lead the item's (the one played, which
 * statistics read). In the item's phase; its temperature and observations are the recorder's
 * (`AttemptRecorder.recordResponse`), which settles them.
 */
export function responseAttempt(input: {
	outcome: RoundOutcome;
	item: PlannedItem;
	plan: RoundPlan;
	/** `MechanicPresenter.attemptData`. */
	data: unknown;
	sessionId: string;
	execution: Execution;
	/** Epoch ms of the prompt. */
	promptedAt: number;
	cardKey: CardKey;
}): Omit<Attempt, 'id'> {
	const { outcome, item, execution } = input;
	const value = outcome.verdict.value as ResponseValue;
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
		...(execution.scope !== undefined && { tempoScope: execution.scope }),
		leadBeats: item.leadBeats,
		timingOffsetMs: value.timingOffsetMs,
		reactionMs: value.reactionMs,
		correct: outcome.correct,
		success: outcome.success,
		verdict: outcome.verdict,
		measures: outcome.measures,
		plan: roundPlanRecord(input.plan),
		data: input.data,
		observations: []
	};
}
