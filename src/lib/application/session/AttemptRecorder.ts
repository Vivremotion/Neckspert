import { cardKeyOf, type MechanicRules } from '$lib/domain/mechanics';
import {
	applyColdAttempt,
	classifyTemperature,
	introduceCard,
	probeTemperature,
	type SessionSelector
} from '$lib/domain/progress';
import type {
	Attempt,
	CardState,
	Execution,
	MechanicId,
	PlannedItem,
	RecordedObservation,
	Temperature
} from '$lib/domain/types';
import type { RoundOutcome, TimingRelation } from '$lib/domain/timing';
import type { AudioClockPort } from '$lib/application/ports';
import type {
	AttemptRepositoryPort,
	CardStateRepositoryPort
} from '$lib/application/ports/repositories';

/** What the mechanic's judge said of the answer, stored as is; null without an answer. */
export type JudgedAnswer = { answer: unknown; confusion: unknown } | null;

/** `Attempt.data` as the recorder writes it: the mechanic's item, answer and confusion. */
export interface AttemptData {
	item: unknown;
	answer: unknown;
	confusion: unknown;
}

export interface AttemptRecorderDeps {
	attempts: AttemptRepositoryPort;
	cards: CardStateRepositoryPort;
	clock: AudioClockPort;
	now: () => number;
	selector: SessionSelector;
	sessionId: string;
	/** Rules of a prompt's mechanic: its card key, its time relation and its learner model. */
	rules: (mechanic: MechanicId) => MechanicRules;
	/** Time relation of a prompt at its exercise's rhythm; the mechanic's own when omitted. */
	timing?: (planned: PlannedItem) => TimingRelation;
}

/** Turns settled rounds into stored attempts and card updates, for one series. */
export class AttemptRecorder {
	private readonly deps: AttemptRecorderDeps;
	private readonly attempts: Attempt<AttemptData>[] = [];
	/** Per recorded attempt, the id its write returns (rejects when the write fails). */
	private readonly ids = new Map<Attempt, Promise<number>>();
	/** Writes and completions started and not yet forgotten, for `settled`. */
	private readonly pending = new Set<Promise<unknown>>();

	constructor(deps: AttemptRecorderDeps) {
		this.deps = deps;
	}

	/** This series' attempts, oldest first. */
	get sessionAttempts(): readonly Attempt<AttemptData>[] {
		return this.attempts;
	}

	/**
	 * Synchronous part done on return (attempt pushed, selector told), so fatigue and the next
	 * beat see it; `stored` settles once card and attempt are written. The attempt carries the
	 * exercise and tempo of `execution`, the run the prompt belongs to. `observations` is the
	 * snapshot stored with the attempt; `completeObservations` replaces it once the rest is in.
	 */
	record(
		planned: PlannedItem,
		outcome: RoundOutcome,
		promptTime: number,
		judged: JudgedAnswer,
		execution: Execution,
		observations: RecordedObservation[]
	): { attempt: Attempt<AttemptData>; stored: Promise<void> } {
		const { selector, sessionId, clock } = this.deps;
		const rules = this.deps.rules(planned.mechanic);
		const key = cardKeyOf(rules, planned.item);
		const promptedAt = clock.toEpochMs(promptTime);
		const attemptedInSession = this.attempts.some((a) => a.cardKey === key);

		// Provisional temperature for sync fatigue/session tracking; refined after history load.
		const provisionalTemperature =
			planned.phase === 'learning' ||
			planned.phase === 'consolidation' ||
			planned.phase === 'free' ||
			planned.phase === 'probe'
				? planned.temperature
				: attemptedInSession
					? 'hot'
					: 'cold';

		const attempt: Attempt<AttemptData> = {
			sessionId,
			exerciseId: execution.exerciseId,
			mechanic: planned.mechanic,
			cardKey: key,
			phase: planned.phase,
			temperature: provisionalTemperature,
			aid: planned.aid,
			promptedAt,
			tempoBpm: execution.tempoBpm,
			leadBeats: planned.leadBeats,
			timingOffsetMs: outcome.timingOffsetMs,
			reactionMs: outcome.reactionMs,
			correct: outcome.correct,
			verdict: outcome.verdict,
			data: {
				item: planned.item,
				answer: judged?.answer ?? null,
				confusion: judged?.confusion ?? null
			},
			observations
		};

		// Fatigue and the selector must see the attempt before any await, so the next onBeat
		// cannot pick a prompt from stale state.
		this.attempts.push(attempt);
		const recorded = selector.record(attempt, this.deps.now());

		let resolveId!: (id: number) => void;
		let rejectId!: (reason: unknown) => void;
		const id = new Promise<number>((resolve, reject) => {
			resolveId = resolve;
			rejectId = reject;
		});
		// Awaited by completions only; a failed write is reported through `stored`.
		id.catch(() => {});
		this.ids.set(attempt, id);
		const stored = this.store(planned, rules, attempt, recorded, attemptedInSession, resolveId);
		stored.catch(rejectId);
		this.track(stored);
		return { attempt, stored };
	}

	/** Waits for the attempt's write, then replaces its observations. No-op for an attempt this recorder did not record. */
	completeObservations(attempt: Attempt, observations: RecordedObservation[]): Promise<void> {
		const id = this.ids.get(attempt);
		if (!id) return Promise.resolve();
		attempt.observations = observations;
		const done = id.then((attemptId) =>
			this.deps.attempts.setObservations(attemptId, observations)
		);
		this.track(done);
		return done;
	}

	/** Waits for the attempt's write, then labels it contested. No-op for an attempt this recorder did not record. */
	contest(attempt: Attempt): Promise<void> {
		const id = this.ids.get(attempt);
		if (!id) return Promise.resolve();
		attempt.contested = true;
		const done = id.then((attemptId) => this.deps.attempts.setContested(attemptId));
		this.track(done);
		return done;
	}

	/** Settles once every write and completion started so far has settled. */
	async settled(): Promise<void> {
		while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
	}

	private track(promise: Promise<unknown>): void {
		// Reported, not swallowed: nothing else tells anyone an attempt was not written.
		const entry = promise.then(
			() => {},
			(error) => console.error('[neckspert] attempt write failed', error)
		);
		this.pending.add(entry);
		void entry.then(() => this.pending.delete(entry));
	}

	private async store(
		item: PlannedItem,
		rules: MechanicRules,
		attempt: Attempt,
		outcome: ReturnType<SessionSelector['record']>,
		attemptedInSession: boolean,
		attemptId: (id: number) => void
	): Promise<void> {
		const { attempts, cards } = this.deps;
		const timing = this.deps.timing?.(item) ?? rules.timing;
		const key = attempt.cardKey;
		const history = await attempts.listByCard(key);
		const existing = await cards.get(key);
		const lastAttemptAt = history.length > 0 ? history[history.length - 1].promptedAt : null;
		// A missed probe is hot: it measures no forgetting (spec 2026-10-03, section 1).
		const temperature =
			item.phase === 'probe'
				? probeTemperature(attempt, timing)
				: this.temperatureFor(item, existing, {
						lastAttemptAt,
						attemptedInSession,
						now: attempt.promptedAt
					});
		attempt.temperature = temperature;

		attemptId(await attempts.add(attempt));

		// Only a memory learner keeps FSRS cards; a skill learner is measured by its attempts alone.
		if (rules.learner !== 'memory') return;
		const now = this.deps.now();
		if ((item.phase === 'review' || item.phase === 'free') && temperature === 'cold') {
			if (existing) {
				const fullHistory = [...history, attempt];
				await this.storeCard(applyColdAttempt(existing, attempt, fullHistory, now, timing));
			}
		} else if (item.phase === 'probe') {
			if (outcome) await this.storeCard(outcome.card);
		} else if (item.phase === 'learning') {
			if (outcome) await this.storeCard(outcome.card);
			else if (!existing) {
				// A prompt may add to its card's item (a position drawn for it): the card keeps its own.
				const kept = rules.cardItem ? rules.cardItem(item.item) : item.item;
				const card = { key, mechanic: item.mechanic, item: kept };
				await this.storeCard(introduceCard(card, now, this.deps.sessionId, timing));
			}
		}
	}

	/** Stores a card and tells the selector, whose copy must not go stale. */
	private async storeCard(card: CardState): Promise<void> {
		await this.deps.cards.put(card);
		this.deps.selector.cardChanged(card);
	}

	/**
	 * Learning and consolidation stay hot. Free play counts cold only on a learned card.
	 * Reviews follow the cold-delay rule; probes are judged by probeTemperature.
	 */
	private temperatureFor(
		item: PlannedItem,
		card: CardState | undefined,
		input: { lastAttemptAt: number | null; attemptedInSession: boolean; now: number }
	): Temperature {
		if (item.phase === 'learning' || item.phase === 'consolidation') return item.temperature;
		if (item.phase === 'free' && (!card || card.learnedAt === null)) return item.temperature;
		return classifyTemperature(input);
	}
}
