import type { MechanicIdentity } from '$lib/domain/mechanics';
import {
	applyColdAttempt,
	classifyTemperature,
	introduceCard,
	probeTemperature,
	type ItemSource,
	type RecordOutcome
} from '$lib/domain/progress';
import type { DirectRecall } from '$lib/domain/learning';
import type {
	Attempt,
	CardState,
	MechanicId,
	PlannedItem,
	RecordedObservation,
	Temperature
} from '$lib/domain/types';
import type { ObservationSpan } from './observationSpan';
import type { AudioClockPort } from '$lib/application/ports';
import type {
	AttemptRepositoryPort,
	CardStateRepositoryPort,
	LevelStateRepositoryPort
} from '$lib/application/ports/repositories';

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
	selector: ItemSource;
	sessionId: string;
	/** Rules of a prompt's mechanic: its learner model and its items. */
	rules: (mechanic: MechanicId) => MechanicIdentity;
	/** The direct-recall rule of a mechanic (`LearningSubject.recall`): a probe's temperature, FSRS grades. */
	recall?: (mechanic: MechanicId) => DirectRecall;
	levels?: LevelStateRepositoryPort;
}

/** How `store` learns from an attempt. */
interface Learning {
	recall: DirectRecall;
	/** Where the level the source moved is written. */
	levels?: LevelStateRepositoryPort;
}

/**
 * Before history is read, for fatigue and the source: the item's own temperature in learning,
 * consolidation, free play and probes; otherwise cold on the series' first attempt at the card.
 */
function provisionalTemperature(item: PlannedItem, attemptedInSession: boolean): Temperature {
	return item.phase === 'learning' ||
		item.phase === 'consolidation' ||
		item.phase === 'free' ||
		item.phase === 'probe'
		? item.temperature
		: attemptedInSession
			? 'hot'
			: 'cold';
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
	 * Writes an attempt (`recordedAttempt`) with what its span heard so far
	 * and learns from it: synchronously, the source is told (`selector.record`) with the item's
	 * provisional temperature; then the temperature is settled from the card's history (a probe
	 * by `probeTemperature` and `recall`), the attempt written, and for a memory learner the card
	 * stored (a cold review or free attempt through FSRS, a probe or a learning prompt as the
	 * source returned it, a learning prompt's card introduced) and the level the source moved
	 * written. Its observations are completed when the span closes. Resolves with the attempt's id.
	 */
	recordResponse(
		attempt: Omit<Attempt, 'id'>,
		span: ObservationSpan,
		item: PlannedItem
	): Promise<number> {
		const rules = this.deps.rules(item.mechanic);
		const recall = this.deps.recall?.(item.mechanic);
		if (!recall && (item.phase === 'probe' || rules.learner === 'memory')) {
			throw new Error(`No direct-recall rule for mechanic ${item.mechanic}`);
		}
		// The caller's object is the one kept, so `completeObservations` and `contest` find it.
		const stored = attempt as Attempt<AttemptData>;
		const attemptedInSession = this.attempts.some((a) => a.cardKey === stored.cardKey);
		stored.temperature = provisionalTemperature(item, attemptedInSession);
		stored.observations = span.snapshot();

		// Fatigue and the source must see the attempt before any await, so the next round
		// cannot be drawn from stale state.
		this.attempts.push(stored);
		const recorded = this.deps.selector.record(stored, this.deps.now());
		if (recorded?.level && !this.deps.levels) {
			throw new Error('The source moved a level and no level repository was given');
		}

		let resolveId!: (id: number) => void;
		let rejectId!: (reason: unknown) => void;
		const id = new Promise<number>((resolve, reject) => {
			resolveId = resolve;
			rejectId = reject;
		});
		// Awaited by completions only; a failed write is reported through the tracked promise.
		id.catch(() => {});
		this.ids.set(stored, id);
		const learning: Learning = {
			// A skill learner without a rule never asks it: it has no probe and no card.
			recall: recall ?? (() => false),
			levels: this.deps.levels
		};
		const written = this.store(
			item,
			rules,
			learning,
			stored,
			recorded,
			attemptedInSession,
			resolveId
		);
		written.catch(rejectId);
		this.track(written);
		if (!span.isClosed) {
			span.onClose((observations) => void this.completeObservations(stored, observations));
		}
		return id;
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
		rules: MechanicIdentity,
		learning: Learning,
		attempt: Attempt,
		outcome: RecordOutcome,
		attemptedInSession: boolean,
		attemptId: (id: number) => void
	): Promise<void> {
		const { attempts, cards } = this.deps;
		const key = attempt.cardKey;
		const history = await attempts.listByCard(key);
		const existing = await cards.get(key);
		const lastAttemptAt = history.length > 0 ? history[history.length - 1].promptedAt : null;
		// A missed probe is hot: it measures no forgetting (spec 2026-10-03, section 1).
		const temperature =
			item.phase === 'probe'
				? probeTemperature(attempt, learning.recall)
				: this.temperatureFor(item, existing, {
						lastAttemptAt,
						attemptedInSession,
						now: attempt.promptedAt
					});
		attempt.temperature = temperature;

		attemptId(await attempts.add(attempt));

		await this.learnCard(item, rules, learning, attempt, outcome, history, existing);
		if (outcome?.level) await learning.levels?.put(outcome.level);
	}

	/** Only a memory learner keeps FSRS cards; a skill learner is measured by its attempts alone. */
	private async learnCard(
		item: PlannedItem,
		rules: MechanicIdentity,
		learning: Learning,
		attempt: Attempt,
		outcome: RecordOutcome,
		history: readonly Attempt[],
		existing: CardState | undefined
	): Promise<void> {
		if (rules.learner !== 'memory') return;
		const key = attempt.cardKey;
		const now = this.deps.now();
		if ((item.phase === 'review' || item.phase === 'free') && attempt.temperature === 'cold') {
			if (existing) {
				const fullHistory = [...history, attempt];
				const applied = applyColdAttempt(existing, attempt, fullHistory, now, learning.recall);
				await this.storeCard(applied);
			}
		} else if (item.phase === 'probe') {
			if (outcome?.card) await this.storeCard(outcome.card);
		} else if (item.phase === 'learning') {
			if (outcome?.card) await this.storeCard(outcome.card);
			else if (!existing) {
				// A prompt may add to its card's item (a position drawn for it): the card keeps its own.
				const kept = rules.cardItem ? rules.cardItem(item.item) : item.item;
				const card = { key, mechanic: item.mechanic, item: kept };
				const introduced = introduceCard(card, now, this.deps.sessionId);
				await this.storeCard(introduced);
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
