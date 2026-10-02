import {
	cardKey,
	type Attempt,
	type CardKey,
	type CardState,
	type PlannedItem,
	type Target
} from '$lib/domain/types';
import { introduceCard, markLearned } from './cards';
import {
	CONFUSION_LOOKBACK,
	CONSOLIDATION_SKIP_RECENT,
	LEARN_COLD_CAP,
	LEARN_PRESENT_LEAD_BEATS,
	LEARN_RETEST_GAPS,
	LEARN_SESSION_MS,
	LEARN_SUCCESSES,
	LEARNING_SLOTS,
	MAX_UNCONSOLIDATED
} from './constants';
import { nextNewTarget } from './introduction';
import { isDirectRecall, leadForThreshold } from './lead';
import { lastAttemptByCard, reviewableCards } from './review';
import type { RecordOutcome, SelectorContext, SessionSelector } from './selector';

/** A note presented in this session and not learned yet. */
interface LearningEntry {
	target: Target;
	/** Prompt count from which its next retest is due. */
	dueAt: number;
	successes: number;
	aided: boolean;
}

function retestDueAt(servedAt: number, gap: number): number {
	return servedAt + gap + 1;
}

class LearnSelector implements SessionSelector {
	private readonly cards: Map<CardKey, CardState>;
	private readonly last: Map<CardKey, number>;
	private readonly history = new Map<CardKey, Attempt[]>();
	private readonly learning = new Map<CardKey, LearningEntry>();
	private readonly servedAt = new Map<CardKey, number>();
	/** Times each card was served in this session, so consolidation rotates. */
	private readonly servedCount = new Map<CardKey, number>();
	private readonly recent: CardKey[] = [];
	private served = 0;
	private reviews = 0;

	constructor(
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		private readonly sessionId: string,
		private readonly tempoBpm: number
	) {
		this.cards = new Map(cards.map((card) => [card.key, card]));
		this.last = lastAttemptByCard(attempts);
		const sorted = [...attempts].sort((a, b) => a.promptedAt - b.promptedAt);
		for (const attempt of sorted) this.remember(attempt);
	}

	next(context: SelectorContext): PlannedItem | null {
		if (context.elapsedMs >= LEARN_SESSION_MS) return null;
		const item = this.pick(context);
		if (!item) return null;
		const key = cardKey(item.target);
		this.servedAt.set(key, this.served);
		this.servedCount.set(key, (this.servedCount.get(key) ?? 0) + 1);
		this.recent.push(key);
		if (this.recent.length > CONSOLIDATION_SKIP_RECENT) this.recent.shift();
		this.served++;
		return item;
	}

	record(attempt: Attempt, now: number): RecordOutcome {
		this.last.set(attempt.cardKey, attempt.promptedAt);
		this.remember(attempt);
		if (attempt.phase !== 'learning') return null;
		const entry = this.learning.get(attempt.cardKey);
		const servedAt = this.servedAt.get(attempt.cardKey);
		if (!entry || servedAt === undefined) return null;

		if (attempt.aid === 'show-position') {
			entry.aided = !attempt.correct;
			entry.successes = 0;
			entry.dueAt = retestDueAt(servedAt, LEARN_RETEST_GAPS[0]);
			return null;
		}
		if (!isDirectRecall(attempt, this.tempoBpm)) {
			entry.aided = true;
			entry.successes = 0;
			entry.dueAt = retestDueAt(servedAt, LEARN_RETEST_GAPS[0]);
			return null;
		}
		entry.successes++;
		if (entry.successes >= LEARN_SUCCESSES) {
			this.learning.delete(attempt.cardKey);
			const card = this.cards.get(attempt.cardKey);
			if (!card) return null;
			const learned = markLearned(card, now, this.tempoBpm);
			this.cards.set(learned.key, learned);
			return { learned };
		}
		const gap = LEARN_RETEST_GAPS[Math.min(entry.successes, LEARN_RETEST_GAPS.length - 1)];
		entry.dueAt = retestDueAt(servedAt, gap);
		return null;
	}

	cardChanged(card: CardState): void {
		this.cards.set(card.key, card);
	}

	private remember(attempt: Attempt): void {
		const list = this.history.get(attempt.cardKey) ?? [];
		list.push(attempt);
		if (list.length > CONFUSION_LOOKBACK) list.shift();
		this.history.set(attempt.cardKey, list);
	}

	private pick(context: SelectorContext): PlannedItem | null {
		const dueRetest = this.earliestRetest((entry) => entry.dueAt <= this.served);
		if (dueRetest) return this.retest(dueRetest);
		if (!context.fatigued) {
			const item =
				this.review(context.now) ??
				this.resume() ??
				this.introduce(context.now) ??
				this.consolidate();
			if (item) return item;
		}
		const early = this.earliestRetest(() => true);
		return early ? this.retest(early) : null;
	}

	private earliestRetest(accept: (entry: LearningEntry) => boolean): LearningEntry | null {
		let best: LearningEntry | null = null;
		for (const entry of this.learning.values()) {
			if (!accept(entry)) continue;
			if (!best || entry.dueAt < best.dueAt) best = entry;
		}
		return best;
	}

	private retest(entry: LearningEntry): PlannedItem {
		const locate = entry.target.direction === 'locate';
		return {
			target: entry.target,
			phase: 'learning',
			temperature: 'hot',
			aid: entry.aided ? 'show-position' : 'none',
			leadBeats: !locate
				? null
				: entry.aided
					? LEARN_PRESENT_LEAD_BEATS
					: leadForThreshold(this.tempoBpm)
		};
	}

	private present(target: Target): PlannedItem {
		const entry: LearningEntry = { target, dueAt: Infinity, successes: 0, aided: true };
		this.learning.set(cardKey(target), entry);
		entry.dueAt = retestDueAt(this.served, LEARN_RETEST_GAPS[0]);
		return this.retest(entry);
	}

	private review(now: number): PlannedItem | null {
		if (this.reviews >= LEARN_COLD_CAP) return null;
		const card = reviewableCards([...this.cards.values()], this.last, now).find(
			(candidate) => !this.servedAt.has(candidate.key)
		);
		if (!card) return null;
		this.reviews++;
		return {
			target: card.target,
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: card.target.direction === 'locate' ? card.leadBeats : null
		};
	}

	private resume(): PlannedItem | null {
		const card = [...this.cards.values()]
			.filter((candidate) => candidate.learnedAt === null && !this.servedAt.has(candidate.key))
			.sort((a, b) => a.introducedAt - b.introducedAt || a.key.localeCompare(b.key))[0];
		return card ? this.present(card.target) : null;
	}

	private introduce(now: number): PlannedItem | null {
		const cards = [...this.cards.values()];
		const beingLearned = cards.filter((card) => card.learnedAt === null).length;
		const unconsolidated = cards.filter(
			(card) => card.learnedAt !== null && card.acquiredAt === null
		).length;
		if (beingLearned >= LEARNING_SLOTS || unconsolidated >= MAX_UNCONSOLIDATED) return null;
		const target = nextNewTarget(cards);
		if (!target) return null;
		const card = introduceCard(target, now, this.sessionId);
		this.cards.set(card.key, card);
		return this.present(target);
	}

	private consolidate(): PlannedItem | null {
		const confused = (key: CardKey) =>
			(this.history.get(key) ?? []).some((attempt) => attempt.confusion !== null);
		const card = [...this.cards.values()]
			.filter((candidate) => candidate.learnedAt !== null && !this.recent.includes(candidate.key))
			.sort((a, b) => {
				const byConfusion = Number(confused(b.key)) - Number(confused(a.key));
				if (byConfusion !== 0) return byConfusion;
				const byServed = (this.servedCount.get(a.key) ?? 0) - (this.servedCount.get(b.key) ?? 0);
				if (byServed !== 0) return byServed;
				if (a.scheduling.stability !== b.scheduling.stability) {
					return a.scheduling.stability - b.scheduling.stability;
				}
				return a.key.localeCompare(b.key);
			})[0];
		if (!card) return null;
		return {
			target: card.target,
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: card.target.direction === 'locate' ? card.leadBeats : null
		};
	}
}

/** Chooses each prompt of a learn session (spec 2026-10-02, section 1). */
export function createLearnSelector(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
	tempoBpm: number;
}): SessionSelector {
	return new LearnSelector(input.cards, input.attempts, input.sessionId, input.tempoBpm);
}
