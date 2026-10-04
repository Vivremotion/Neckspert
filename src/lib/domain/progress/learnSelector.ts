import {
	cardKey,
	isSuccess,
	LEAD_STEPS,
	type Attempt,
	type CardKey,
	type CardState,
	type LeadBeats,
	type PlannedItem,
	type Target
} from '$lib/domain/types';
import { allowedAfter, pickAtRandom } from './order';
import { introduceCard, markLearned, probeCard } from './cards';
import {
	CONFUSION_LOOKBACK,
	CONSOLIDATION_POOL,
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
	/** Successes at the final step: the direct-recall lead (mode 1), unaided (mode 2). */
	successes: number;
	/** Mode 2 only: the name is shown on the next prompt. */
	aided: boolean;
	/** Mode 1 only: lead of the next prompt, from 8 down to the direct-recall lead. */
	lead: LeadBeats;
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
	/** Probe served and not recorded yet; still set at the next `next()` means it was abandoned (pause). */
	private unansweredProbe: CardKey | null = null;
	private reviews = 0;
	/** Target of the last prompt served: the next one is never it, nor its mirror. */
	private previous: Target | null = null;

	constructor(
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		private readonly sessionId: string,
		private readonly tempoBpm: number,
		private readonly random: () => number
	) {
		this.cards = new Map(cards.map((card) => [card.key, card]));
		this.last = lastAttemptByCard(attempts);
		const sorted = [...attempts].sort((a, b) => a.promptedAt - b.promptedAt);
		for (const attempt of sorted) this.remember(attempt);
	}

	next(context: SelectorContext): PlannedItem | null {
		if (context.elapsedMs >= LEARN_SESSION_MS) return null;
		this.dropAbandonedProbe();
		const item = this.pick(context);
		if (!item) return null;
		const key = cardKey(item.target);
		this.servedAt.set(key, this.served);
		this.servedCount.set(key, (this.servedCount.get(key) ?? 0) + 1);
		this.recent.push(key);
		if (this.recent.length > CONSOLIDATION_SKIP_RECENT) this.recent.shift();
		this.served++;
		this.previous = item.target;
		return item;
	}

	record(attempt: Attempt, now: number): RecordOutcome {
		this.last.set(attempt.cardKey, attempt.promptedAt);
		this.remember(attempt);
		if (attempt.phase === 'probe') {
			if (attempt.cardKey === this.unansweredProbe) this.unansweredProbe = null;
			return this.recordProbe(attempt, now);
		}
		if (attempt.phase !== 'learning') return null;
		const entry = this.learning.get(attempt.cardKey);
		const servedAt = this.servedAt.get(attempt.cardKey);
		if (!entry || servedAt === undefined) return null;

		const [shortGap, longGap] = LEARN_RETEST_GAPS;
		const step =
			entry.target.direction === 'locate'
				? this.climbLead(entry, isSuccess(attempt))
				: this.climbIdentify(entry, attempt);
		if (step === 'learned') {
			this.learning.delete(attempt.cardKey);
			const card = this.cards.get(attempt.cardKey);
			if (!card) return null;
			const learned = markLearned(card, now, this.tempoBpm);
			this.cards.set(learned.key, learned);
			return { card: learned };
		}
		entry.dueAt = retestDueAt(servedAt, step === 'short' ? shortGap : longGap);
		return null;
	}

	/** Forgets the in-memory card of a probe nobody answered, so the note can be probed again. */
	private dropAbandonedProbe(): void {
		if (this.unansweredProbe === null) return;
		this.cards.delete(this.unansweredProbe);
		this.servedAt.delete(this.unansweredProbe);
		this.unansweredProbe = null;
		// Never played: it does not count as the previous note.
		this.previous = null;
	}

	/** A passed probe goes to review; a missed one is presented with the aid on the next prompt. */
	private recordProbe(attempt: Attempt, now: number): RecordOutcome {
		const card = this.cards.get(attempt.cardKey);
		if (!card) return null;
		const known = probeCard(card.target, attempt, now, this.sessionId, this.tempoBpm);
		if (known) {
			this.cards.set(known.key, known);
			return { card: known };
		}
		// Ahead of any other due retest: the aid must follow the miss directly.
		this.present(card.target).dueAt = -Infinity;
		return { card };
	}

	/**
	 * Mode 1 ladder: a success halves the lead (8, 4, then the direct-recall lead), a miss
	 * doubles it up to 8. LEARN_SUCCESSES successes at the direct-recall lead make it learned.
	 */
	private climbLead(entry: LearningEntry, correct: boolean): 'short' | 'long' | 'learned' {
		const final = leadForThreshold(this.tempoBpm);
		const index = LEAD_STEPS.indexOf(entry.lead);
		if (!correct) {
			entry.lead = LEAD_STEPS[Math.max(index - 1, 0)];
			entry.successes = 0;
			return 'short';
		}
		if (entry.lead > final) {
			const fromPresentation = entry.lead === LEARN_PRESENT_LEAD_BEATS;
			entry.lead = LEAD_STEPS[Math.min(index + 1, LEAD_STEPS.indexOf(final))];
			return fromPresentation ? 'short' : 'long';
		}
		entry.successes++;
		return entry.successes >= LEARN_SUCCESSES ? 'learned' : 'long';
	}

	/** Mode 2: name shown until answered right, then LEARN_SUCCESSES quick unaided answers. */
	private climbIdentify(entry: LearningEntry, attempt: Attempt): 'short' | 'long' | 'learned' {
		if (entry.aided) {
			entry.aided = !attempt.correct;
			entry.successes = 0;
			return 'short';
		}
		if (!isDirectRecall(attempt, this.tempoBpm)) {
			entry.aided = true;
			entry.successes = 0;
			return 'short';
		}
		entry.successes++;
		return entry.successes >= LEARN_SUCCESSES ? 'learned' : 'long';
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

	/**
	 * Category priority is fixed: retests, cold reviews, resumed notes, new notes, consolidation.
	 * Inside a category the draw is random, never the previous card nor its mirror, and another
	 * string when possible (`pickAtRandom`).
	 */
	private pick(context: SelectorContext): PlannedItem | null {
		const dueRetest = this.dueRetest();
		if (dueRetest) return this.retest(dueRetest);
		if (!context.fatigued) {
			const item =
				this.review(context.now) ??
				this.resume() ??
				this.introduce(context.now) ??
				this.consolidate();
			if (item) return item;
		}
		// Nothing else: a retest early rather than an end of session, the previous card as a
		// last resort only.
		const early =
			this.earliestRetest((entry) => allowedAfter(entry.target, this.previous)) ??
			this.earliestRetest(() => true);
		return early ? this.retest(early) : null;
	}

	/** A due retest; the aided presentation after a missed probe always comes first. */
	private dueRetest(): LearningEntry | null {
		const due = [...this.learning.values()].filter((entry) => entry.dueAt <= this.served);
		const afterProbe = due.find((entry) => entry.dueAt === -Infinity);
		return afterProbe ?? pickAtRandom(due, this.previous, this.random);
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
		const aided = locate ? entry.lead === LEARN_PRESENT_LEAD_BEATS : entry.aided;
		return {
			target: entry.target,
			phase: 'learning',
			temperature: 'hot',
			aid: aided ? 'show-position' : 'none',
			leadBeats: locate ? entry.lead : null
		};
	}

	/** Starts aided learning; the first retest comes after the short gap unless the caller moves it. */
	private present(target: Target): LearningEntry {
		const entry: LearningEntry = {
			target,
			dueAt: retestDueAt(this.served, LEARN_RETEST_GAPS[0]),
			successes: 0,
			aided: true,
			lead: LEARN_PRESENT_LEAD_BEATS
		};
		this.learning.set(cardKey(target), entry);
		return entry;
	}

	private review(now: number): PlannedItem | null {
		if (this.reviews >= LEARN_COLD_CAP) return null;
		const candidates = reviewableCards([...this.cards.values()], this.last, now).filter(
			(candidate) => !this.servedAt.has(candidate.key)
		);
		const card = pickAtRandom(candidates, this.previous, this.random);
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
		const candidates = [...this.cards.values()]
			.filter((candidate) => candidate.learnedAt === null && !this.servedAt.has(candidate.key))
			.sort((a, b) => a.introducedAt - b.introducedAt || a.key.localeCompare(b.key));
		const card = pickAtRandom(candidates, this.previous, this.random);
		return card ? this.retest(this.present(card.target)) : null;
	}

	private introduce(now: number): PlannedItem | null {
		const cards = [...this.cards.values()];
		const beingLearned = cards.filter((card) => card.learnedAt === null).length;
		const unconsolidated = cards.filter(
			(card) => card.learnedAt !== null && card.acquiredAt === null
		).length;
		if (beingLearned >= LEARNING_SLOTS || unconsolidated >= MAX_UNCONSOLIDATED) return null;
		const target = nextNewTarget(cards);
		if (!target || !allowedAfter(target, this.previous)) return null;
		const card = introduceCard(target, now, this.sessionId);
		this.cards.set(card.key, card);
		this.unansweredProbe = card.key;
		return {
			target,
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			leadBeats: target.direction === 'locate' ? leadForThreshold(this.tempoBpm) : null
		};
	}

	private consolidate(): PlannedItem | null {
		const confused = (key: CardKey) =>
			(this.history.get(key) ?? []).some((attempt) => attempt.confusion !== null);
		const weakest = [...this.cards.values()]
			.filter(
				(candidate) =>
					candidate.learnedAt !== null &&
					!this.recent.includes(candidate.key) &&
					allowedAfter(candidate.target, this.previous)
			)
			.sort((a, b) => {
				const byConfusion = Number(confused(b.key)) - Number(confused(a.key));
				if (byConfusion !== 0) return byConfusion;
				const byServed = (this.servedCount.get(a.key) ?? 0) - (this.servedCount.get(b.key) ?? 0);
				if (byServed !== 0) return byServed;
				if (a.scheduling.stability !== b.scheduling.stability) {
					return a.scheduling.stability - b.scheduling.stability;
				}
				return a.key.localeCompare(b.key);
			})
			.slice(0, CONSOLIDATION_POOL);
		const card = pickAtRandom(weakest, this.previous, this.random);
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
	/** Draws inside a category. Injected for tests. */
	random?: () => number;
}): SessionSelector {
	return new LearnSelector(
		input.cards,
		input.attempts,
		input.sessionId,
		input.tempoBpm,
		input.random ?? Math.random
	);
}
