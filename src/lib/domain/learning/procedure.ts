import type { SkillId } from '../types';
import { introduceCard, markLearned } from '../progress/cards';
import { lastAttemptByCard, reviewableCards } from '../progress/review';
import type { RecordOutcome, SelectorContext, ItemSource } from '../progress/selector';
import { cardSuccessRate, successRate } from '../progress/success';
import { levelRange, nextLevelState, type LevelState } from '../time/levels';
import {
	cardKey,
	type Attempt,
	type CardKey,
	type CardState,
	type ItemPhase,
	type PlannedItem,
	type Temperature
} from '../types';
import { asksDirectRecall, ladderLevel, passesTop } from './ladder';
import {
	DEFAULT_SET_LEARNING,
	type ItemLearning,
	type LearningCategory,
	type SetLearning
} from './params';
import type { CardRef, Ladder, LadderParams, LearningSubject } from './subject';

/** The source of items of a learning session, whatever the exercise. */
export interface LearningProcedure extends ItemSource {
	/** The level an item holds now (as given, or as moved this session). */
	levelOf(card: CardRef): LevelState;
}

/** An item presented in this session and not learned yet. */
interface LearningEntry {
	ref: CardRef;
	/** Prompt count from which its next retest is due. */
	dueAt: number;
}

function retestDueAt(servedAt: number, gap: number): number {
	return servedAt + gap + 1;
}

function refOf(card: CardState): CardRef {
	return { skill: card.skill, item: card.item };
}

function levelKey(exerciseId: string, item: string): string {
	return `${exerciseId}\u0000${item}`;
}

class Procedure implements LearningProcedure {
	private readonly cards: Map<CardKey, CardState>;
	private readonly last: Map<CardKey, number>;
	/** Every attempt of each card, oldest first: what `nextNew` reads. */
	private readonly history = new Map<CardKey, Attempt[]>();
	private readonly levels = new Map<string, LevelState>();
	private readonly learning = new Map<CardKey, LearningEntry>();
	private readonly servedAt = new Map<CardKey, number>();
	/** Times each card was served in this session, so consolidation rotates. */
	private readonly servedCount = new Map<CardKey, number>();
	private readonly recent: CardKey[] = [];
	private served = 0;
	private reviews = 0;
	/** The item last served: the next one is never it. */
	private previous: CardRef | null = null;
	/** This session's attempts the procedure plays (`plays`), oldest first: success rates steer new items. */
	private readonly played: Attempt[] = [];
	/** Items served hot in this session: the working set. */
	private readonly workingSet = new Set<CardKey>();
	/** Misses in a row, recoveries left out. */
	private missStreak = 0;
	/** The last miss calls for a solid item of this skill on the next prompt. */
	private pendingRecovery: SkillId | null = null;
	/** The item just served is a recovery: a miss on it calls for no other. */
	private servedRecovery = false;

	constructor(
		private readonly subject: LearningSubject,
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		levels: readonly LevelState[],
		private readonly sessionId: string,
		private readonly random: () => number,
		private readonly set: SetLearning
	) {
		this.cards = new Map(cards.map((card) => [card.key, card]));
		this.last = lastAttemptByCard(attempts);
		const sorted = [...attempts].sort((a, b) => a.promptedAt - b.promptedAt);
		for (const attempt of sorted) {
			const list = this.history.get(attempt.cardKey) ?? [];
			list.push(attempt);
			this.history.set(attempt.cardKey, list);
			if (attempt.sessionId === sessionId && this.plays(attempt)) this.played.push(attempt);
		}
		for (const level of levels) {
			if (level.scope === '') this.levels.set(levelKey(level.exerciseId, level.item), level);
		}
	}

	next(context: SelectorContext): PlannedItem | null {
		const recovery = context.fatigued ? null : this.recovery(context.now);
		this.pendingRecovery = null;
		this.servedRecovery = recovery !== null;
		const item = recovery ?? this.pick(context);
		if (!item) return null;
		const { planned, ref } = item;
		const key = this.keyOf(ref);
		if (planned.temperature === 'hot') this.workingSet.add(key);
		this.servedAt.set(key, this.served);
		this.servedCount.set(key, (this.servedCount.get(key) ?? 0) + 1);
		this.recent.push(key);
		if (this.recent.length > this.set.consolidationSkipRecent) this.recent.shift();
		this.served++;
		this.previous = ref;
		return planned;
	}

	/**
	 * An attempt moves its item's level (C1), learns it at the top's pass, spaces its next retest
	 * (the short gap after a miss, the long one after a success, whatever the level: decision 6 of
	 * issue #19) and may call a recovery. An attempt of a card the subject does not own: null.
	 */
	record(attempt: Attempt, now: number): RecordOutcome {
		if (!this.plays(attempt)) return null;
		this.last.set(attempt.cardKey, attempt.promptedAt);
		const list = this.history.get(attempt.cardKey) ?? [];
		list.push(attempt);
		this.history.set(attempt.cardKey, list);
		this.played.push(attempt);
		this.countMiss(attempt);
		const card = this.cards.get(attempt.cardKey);
		if (!card) return null;
		const ref = refOf(card);
		const ladder = this.ladderOf(ref);
		const state = ladderLevel(this.levelOf(ref), ladder);
		// A level that asks it counts only a direct recall.
		const success =
			ladder[state.level - levelRange(ladder).lowest].success === 'direct-recall'
				? this.subject.recall(ref.skill)(attempt)
				: attempt.success;
		const learned = attempt.phase === 'learning' && passesTop(state, ladder, success);
		const level = nextLevelState(state, ladder, { success }).state;
		this.setLevel(level);
		if (attempt.phase !== 'learning') return { level };

		const entry = this.learning.get(attempt.cardKey);
		if (learned) {
			this.learning.delete(attempt.cardKey);
			const marked = markLearned(card, now);
			this.cards.set(marked.key, marked);
			return { card: marked, level };
		}
		const servedAt = this.servedAt.get(attempt.cardKey);
		if (entry && servedAt !== undefined) {
			const [shortGap, longGap] = this.itemLearning(ref).retestGaps;
			entry.dueAt = retestDueAt(servedAt, success ? longGap : shortGap);
		}
		return { level };
	}

	/** An attempt of a card the subject owns, played in the exercise it plays that skill in. */
	private plays(attempt: Attempt): boolean {
		return (
			this.subject.owns({ skill: attempt.skill, key: attempt.cardKey }) &&
			attempt.exerciseId === this.subject.exerciseOf(attempt.skill)
		);
	}

	cardChanged(card: CardState): void {
		this.cards.set(card.key, card);
	}

	levelOf(card: CardRef): LevelState {
		const exerciseId = this.subject.exerciseOf(card.skill);
		const item = this.subject.itemKey(card);
		return (
			this.levels.get(levelKey(exerciseId, item)) ?? {
				exerciseId,
				scope: '',
				item,
				level: 0,
				successes: 0,
				failures: 0,
				resumeAfter: null
			}
		);
	}

	private setLevel(state: LevelState): LevelState {
		this.levels.set(levelKey(state.exerciseId, state.item), state);
		return state;
	}

	/** A miss (recoveries left out) calls for a solid item next; a success clears it. */
	private countMiss(attempt: Attempt): void {
		if (attempt.success) {
			this.missStreak = 0;
			this.pendingRecovery = null;
			return;
		}
		if (this.servedRecovery) return;
		this.missStreak++;
		if (this.missStreak < this.set.recoveryAfterMisses) return;
		this.missStreak = 0;
		this.pendingRecovery = attempt.skill;
	}

	/**
	 * After a miss: a solid item of the same skill (acquired, no miss in its last attempts, not
	 * waiting for its cold review), served hot as consolidation. Null when none qualifies.
	 */
	private recovery(now: number): { planned: PlannedItem; ref: CardRef } | null {
		const skill = this.pendingRecovery;
		if (skill === null) return null;
		const waiting = new Set(
			reviewableCards(this.owned(), this.last, now)
				.filter((card) => !this.servedAt.has(card.key))
				.map((card) => card.key)
		);
		const solid = this.owned().filter(
			(card) =>
				card.skill === skill &&
				card.acquiredAt !== null &&
				!waiting.has(card.key) &&
				(this.history.get(card.key) ?? [])
					.slice(-this.set.confusionLookback)
					.every((attempt) => attempt.success) &&
				this.fitsWorkingSet(card.key)
		);
		const card = this.draw(solid, refOf);
		return card ? this.serve(refOf(card), 'consolidation', 'hot') : null;
	}

	private keyOf(ref: CardRef): CardKey {
		return cardKey(ref.skill, this.subject.itemKey(ref));
	}

	private owned(): CardState[] {
		return [...this.cards.values()].filter((card) => this.subject.owns(card));
	}

	/** Never the card served last. */
	private allowedAfter(ref: CardRef): boolean {
		const previous = this.previous;
		return previous === null || this.keyOf(ref) !== this.keyOf(previous);
	}

	/** A random draw among the allowed candidates. */
	private draw<T>(candidates: readonly T[], refOfCandidate: (candidate: T) => CardRef): T | null {
		const allowed = candidates.filter((candidate) => this.allowedAfter(refOfCandidate(candidate)));
		if (allowed.length === 0) return null;
		return allowed[Math.min(allowed.length - 1, Math.floor(this.random() * allowed.length))];
	}

	/**
	 * Categories in the order the session sets (today: a due retest, a cold review, a resumed item,
	 * a new one, a consolidation); tired, retests only. Then the last resort: a retest early, a
	 * consolidation of a recent item, a new item past the thresholds (rested), and nothing rather
	 * than the previous.
	 */
	private pick(context: SelectorContext): { planned: PlannedItem; ref: CardRef } | null {
		for (const category of this.set.order) {
			if (context.fatigued && category !== 'retest') continue;
			const item = this.serveCategory(category, context.now);
			if (item) return item;
		}
		const early = this.earliestRetest();
		if (early) return this.retest(early);
		if (context.fatigued) return null;
		return this.consolidate(false) ?? this.introduce(context.now, false);
	}

	private serveCategory(
		category: LearningCategory,
		now: number
	): { planned: PlannedItem; ref: CardRef } | null {
		switch (category) {
			case 'retest': {
				const due = this.dueRetest();
				return due ? this.retest(due) : null;
			}
			case 'cold-review':
				return this.review(now);
			case 'resumed':
				return this.resume();
			case 'new':
				return this.introduce(now, true);
			case 'consolidation':
				return this.consolidate(true);
		}
	}

	/** A due retest. */
	private dueRetest(): LearningEntry | null {
		const due = [...this.learning.values()].filter((entry) => entry.dueAt <= this.served);
		return this.draw(due, (entry) => entry.ref);
	}

	/** The retest nearest to due, never the previous item. */
	private earliestRetest(): LearningEntry | null {
		let best: LearningEntry | null = null;
		for (const entry of this.learning.values()) {
			if (!this.allowedAfter(entry.ref)) continue;
			if (!best || entry.dueAt < best.dueAt) best = entry;
		}
		return best;
	}

	private retest(entry: LearningEntry): { planned: PlannedItem; ref: CardRef } {
		return this.serve(entry.ref, 'learning', 'hot');
	}

	/** Starts learning an item in this session; its first retest comes after the short gap. */
	private present(ref: CardRef): LearningEntry {
		const entry: LearningEntry = {
			ref,
			dueAt: retestDueAt(this.served, this.itemLearning(ref).retestGaps[0])
		};
		this.learning.set(this.keyOf(ref), entry);
		return entry;
	}

	/**
	 * A due card, once in the session: reviewed cold, within the cap, at a level that asks a direct
	 * recall; at another level caught up hot in place of its review, outside the cap and within the
	 * working set (decision 12 of issue #19).
	 */
	private review(now: number): { planned: PlannedItem; ref: CardRef } | null {
		const candidates = reviewableCards(this.owned(), this.last, now).filter((card) => {
			if (this.servedAt.has(card.key)) return false;
			return this.countsCold(refOf(card))
				? this.reviews < this.set.coldCap
				: this.fitsWorkingSet(card.key);
		});
		const card = this.draw(candidates, refOf);
		if (!card) return null;
		const ref = refOf(card);
		if (!this.countsCold(ref)) return this.serve(ref, 'consolidation', 'hot');
		this.reviews++;
		return this.serve(ref, 'review', 'cold');
	}

	/** The item's level, brought into today's ladder, asks a direct recall. */
	private countsCold(ref: CardRef): boolean {
		return asksDirectRecall(this.ladderOf(ref), this.ladderLevelOf(ref));
	}

	private resume(): { planned: PlannedItem; ref: CardRef } | null {
		const candidates = this.owned()
			.filter(
				(card) =>
					card.learnedAt === null &&
					!this.servedAt.has(card.key) &&
					!this.learning.has(card.key) &&
					this.fitsWorkingSet(card.key)
			)
			.sort((a, b) => a.introducedAt - b.introducedAt || a.key.localeCompare(b.key));
		const card = this.draw(candidates, refOf);
		return card ? this.retest(this.present(refOf(card))) : null;
	}

	/**
	 * A new item, served in learning at level 0, the first of its ladder (decision 5 of issue #19);
	 * its card stays in memory until the recorder makes it at its first attempt, so an item a pause
	 * cut comes again without being introduced twice. `gated` false: past the success thresholds,
	 * only when nothing else can be served.
	 */
	private introduce(now: number, gated: boolean): { planned: PlannedItem; ref: CardRef } | null {
		const owned = this.owned();
		const beingLearned = owned.filter((card) => card.learnedAt === null);
		const unconsolidated = owned.filter(
			(card) => card.learnedAt !== null && card.acquiredAt === null
		).length;
		if (
			beingLearned.length >= this.set.learningSlots ||
			unconsolidated >= this.set.maxUnconsolidated
		) {
			return null;
		}
		if (this.workingSet.size >= this.set.maxWorkingSet) return null;
		if (gated && !this.readyForNew(beingLearned)) return null;
		const ref = this.subject.nextNew(
			[...this.cards.values()],
			this.history,
			(candidate) => !this.allowedAfter(candidate)
		);
		if (!ref) return null;
		const key = this.keyOf(ref);
		if (!this.subject.owns({ skill: ref.skill, key }) || !this.allowedAfter(ref)) return null;
		const card = introduceCard({ key, skill: ref.skill, item: ref.item }, now, this.sessionId);
		this.cards.set(key, card);
		this.setLevel({ ...this.levelOf(ref), level: 0, successes: 0, failures: 0 });
		return this.retest(this.present(ref));
	}

	/**
	 * New items wait until every item being learned is mostly right lately and the session's
	 * rolling success is high enough.
	 */
	private readyForNew(beingLearned: readonly CardState[]): boolean {
		const { successWindow, newItemMinSessionSuccess, newItemCardWindow, newItemMinCardSuccess } =
			this.set;
		const session = successRate(this.played.slice(-successWindow));
		if (session !== null && session < newItemMinSessionSuccess) return false;
		return beingLearned.every(
			(card) =>
				(cardSuccessRate(this.played, card.key, newItemCardWindow) ?? 0) >= newItemMinCardSuccess
		);
	}

	/** `skipRecent` false: an item of the last prompts may come back, never the previous one. */
	private consolidate(skipRecent: boolean): { planned: PlannedItem; ref: CardRef } | null {
		const confused = (key: CardKey) =>
			(this.history.get(key) ?? [])
				.slice(-this.set.confusionLookback)
				.some((attempt) => this.subject.confused(attempt));
		const weakest = this.owned()
			.filter(
				(card) =>
					card.learnedAt !== null &&
					!(skipRecent && this.recent.includes(card.key)) &&
					this.fitsWorkingSet(card.key) &&
					this.allowedAfter(refOf(card))
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
			.slice(0, this.set.consolidationPool);
		const card = this.draw(weakest, refOf);
		return card ? this.serve(refOf(card), 'consolidation', 'hot') : null;
	}

	/** An item may be served hot: already in the working set, or the set has room. */
	private fitsWorkingSet(key: CardKey): boolean {
		return this.workingSet.has(key) || this.workingSet.size < this.set.maxWorkingSet;
	}

	/** What the item's exercise sets for it. */
	private itemLearning(ref: CardRef): ItemLearning {
		return this.subject.itemLearning(ref.skill);
	}

	private ladderOf(ref: CardRef): Ladder {
		return this.subject.ladder(ref.skill);
	}

	/** The item's level, brought into today's ladder. */
	private ladderLevelOf(ref: CardRef): number {
		return ladderLevel(this.levelOf(ref), this.ladderOf(ref)).level;
	}

	/** The params of level `level` of the item's ladder. */
	private paramsAt(ref: CardRef, level: number): LadderParams {
		const ladder = this.ladderOf(ref);
		return ladder[level - levelRange(ladder).lowest].params as LadderParams;
	}

	/** An item served at its level: what its prompt shows is its level's (`presentationOf`). */
	private serve(
		ref: CardRef,
		phase: ItemPhase,
		temperature: Temperature
	): { planned: PlannedItem; ref: CardRef } {
		const level = this.ladderLevelOf(ref);
		const planned: PlannedItem = {
			exerciseId: this.subject.exerciseOf(ref.skill),
			skill: ref.skill,
			item: this.subject.promptItem?.(ref, this.random, level) ?? ref.item,
			phase,
			temperature,
			leadBeats: this.paramsAt(ref, level).leadBeats,
			level,
			exerciseLevel: 0
		};
		return { planned, ref };
	}
}

/** Serves what an item needs next, whatever the exercise (spec 2026-10-14, amendment 2026-10-23 §3). */
export function createLearningProcedure(input: {
	subject: LearningSubject;
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	levels: readonly LevelState[];
	sessionId: string;
	random?: () => number;
	/** What the session sets for the whole set, over `DEFAULT_SET_LEARNING`. */
	set?: Partial<SetLearning>;
}): LearningProcedure {
	return new Procedure(
		input.subject,
		input.cards,
		input.attempts,
		input.levels,
		input.sessionId,
		input.random ?? Math.random,
		{ ...DEFAULT_SET_LEARNING, ...input.set }
	);
}
