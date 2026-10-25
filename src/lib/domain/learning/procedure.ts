import type { ExerciseId, MechanicId } from '../exercise/types';
import { DEFAULT_TEMPO_BPM } from '../exercise/tempo';
import { introduceCard, markLearned, probeCard } from '../progress/cards';
import {
	CONFUSION_LOOKBACK,
	CONSOLIDATION_POOL,
	CONSOLIDATION_SKIP_RECENT,
	LEARN_COLD_CAP,
	LEARN_RETEST_GAPS,
	LEARNING_SLOTS,
	MAX_UNCONSOLIDATED,
	MAX_WORKING_SET,
	NEW_NOTE_MIN_CARD_SUCCESS,
	NEW_NOTE_MIN_SESSION_SUCCESS,
	RECOVERY_AFTER_MISSES,
	STRING_AID_FADE_SUCCESSES,
	SUCCESS_WINDOW
} from '../progress/constants';
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
import { ladderLevel, passesTop } from './ladder';
import type { CardRef, Ladder, LadderParams, LearningSubject } from './subject';

/** The source of items of a learning session, whatever the exercise. */
export interface LearningProcedure extends ItemSource {
	/** The level an item holds now (as given, or as moved this session). */
	levelOf(card: CardRef): LevelState;
}

/** An item presented in this session and not learned yet. */
interface LearningEntry {
	ref: CardRef;
	/** Prompt count from which its next retest is due; -Infinity: before any other. */
	dueAt: number;
}

function retestDueAt(servedAt: number, gap: number): number {
	return servedAt + gap + 1;
}

function refOf(card: CardState): CardRef {
	return { mechanic: card.mechanic, item: card.item };
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
	/** Probe served and not recorded yet; still set at the next `next()`: abandoned (pause). */
	private unansweredProbe: CardKey | null = null;
	private reviews = 0;
	/** The item last served: the next one is never it, nor its neighbour. */
	private previous: CardRef | null = null;
	/** This session's attempts the procedure plays (`plays`), oldest first: success rates steer new items. */
	private readonly played: Attempt[] = [];
	/** Items served hot in this session: the working set. */
	private readonly workingSet = new Set<CardKey>();
	/** Items whose fading aid is drawn on their next hot prompts, with their successes since. */
	private readonly fadingAid = new Map<CardKey, number>();
	/** Misses in a row, probes and recoveries left out. */
	private missStreak = 0;
	/** The last miss calls for a solid item of this mechanic on the next prompt. */
	private pendingRecovery: MechanicId | null = null;
	/** The item just served is a recovery: a miss on it calls for no other. */
	private servedRecovery = false;

	constructor(
		private readonly subject: LearningSubject,
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		levels: readonly LevelState[],
		private readonly sessionId: string,
		private readonly tempos: Readonly<Record<ExerciseId, number>>,
		private readonly random: () => number
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
		this.dropAbandonedProbe();
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
		if (this.recent.length > CONSOLIDATION_SKIP_RECENT) this.recent.shift();
		this.served++;
		this.previous = ref;
		return planned;
	}

	/**
	 * A probe goes to review when recalled directly, or is presented aided next; any other attempt
	 * moves its item's level (C1), learns it at the top's pass, spaces its next retest, may call a
	 * recovery and draws or fades the aid. An attempt of a card the subject does not own: null.
	 */
	record(attempt: Attempt, now: number): RecordOutcome {
		if (!this.plays(attempt)) return null;
		this.last.set(attempt.cardKey, attempt.promptedAt);
		const list = this.history.get(attempt.cardKey) ?? [];
		list.push(attempt);
		this.history.set(attempt.cardKey, list);
		this.played.push(attempt);
		this.countMiss(attempt);
		this.fadeAid(attempt);
		const card = this.cards.get(attempt.cardKey);
		if (!card) return null;
		const ref = refOf(card);
		if (attempt.phase === 'probe') {
			if (attempt.cardKey === this.unansweredProbe) this.unansweredProbe = null;
			return this.recordProbe(card, attempt, now);
		}

		const ladder = this.ladderOf(ref);
		const held = this.levelOf(ref);
		const state = ladderLevel(held, ladder);
		const clamped = state !== held;
		const servedAided = this.levelParams(ref).aided;
		// At the top, only a direct recall is a success; the level's own aid is not « aided ».
		const success =
			state.level === levelRange(ladder).highest
				? this.subject.recall(ref.mechanic)(attempt)
				: attempt.success;
		const learned = attempt.phase === 'learning' && passesTop(state, ladder, success);
		const next = nextLevelState(state, ladder, { success, aided: false }).state;
		// A level a fast tempo only brought down to the top is kept as held (D7); a drop is written.
		const keep = clamped && next.level === state.level;
		const level = keep ? undefined : this.setLevel(next);
		const outcome = level ? { level } : {};
		if (attempt.phase !== 'learning') return outcome;

		const entry = this.learning.get(attempt.cardKey);
		if (learned) {
			this.learning.delete(attempt.cardKey);
			const marked = markLearned(card, now);
			this.cards.set(marked.key, marked);
			return { ...outcome, card: marked };
		}
		const servedAt = this.servedAt.get(attempt.cardKey);
		if (entry && servedAt !== undefined) {
			const [shortGap, longGap] = LEARN_RETEST_GAPS;
			entry.dueAt = retestDueAt(servedAt, servedAided || !success ? shortGap : longGap);
		}
		return outcome;
	}

	/** An attempt of a card the subject owns, played in the exercise it plays that mechanic in. */
	private plays(attempt: Attempt): boolean {
		return (
			this.subject.owns(attempt) && attempt.exerciseId === this.subject.exerciseOf(attempt.mechanic)
		);
	}

	cardChanged(card: CardState): void {
		this.cards.set(card.key, card);
	}

	levelOf(card: CardRef): LevelState {
		const exerciseId = this.subject.exerciseOf(card.mechanic);
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

	/** A passed probe goes to review at the level served; a missed one is presented aided next, at level 0. */
	private recordProbe(card: CardState, attempt: Attempt, now: number): RecordOutcome {
		const ref = refOf(card);
		const probed = probeCard(card, attempt, now, this.sessionId, this.subject.recall(ref.mechanic));
		if (probed) {
			this.cards.set(probed.key, probed);
			const level = this.setLevel({
				...this.levelOf(ref),
				level: levelRange(this.ladderOf(ref)).highest,
				successes: 0,
				failures: 0
			});
			return { card: probed, level };
		}
		const level = this.setLevel({ ...this.levelOf(ref), level: 0, successes: 0, failures: 0 });
		// Ahead of any other due retest: the aid must follow the miss directly.
		this.present(ref).dueAt = -Infinity;
		return { card, level };
	}

	private setLevel(state: LevelState): LevelState {
		this.levels.set(levelKey(state.exerciseId, state.item), state);
		return state;
	}

	/** A miss (probes and recoveries left out) calls for a solid item next; a success clears it. */
	private countMiss(attempt: Attempt): void {
		if (attempt.phase === 'probe') return;
		if (attempt.success) {
			this.missStreak = 0;
			this.pendingRecovery = null;
			return;
		}
		if (this.servedRecovery) return;
		this.missStreak++;
		if (this.missStreak < RECOVERY_AFTER_MISSES) return;
		this.missStreak = 0;
		this.pendingRecovery = attempt.mechanic;
	}

	/** A miss brings the fading aid back for its item; its successes since take it away. */
	private fadeAid(attempt: Attempt): void {
		if (!this.subject.fadingAid(attempt.mechanic)) return;
		const key = attempt.cardKey;
		if (!attempt.success) {
			this.fadingAid.set(key, 0);
			return;
		}
		const successes = this.fadingAid.get(key);
		if (successes === undefined) return;
		if (successes + 1 >= STRING_AID_FADE_SUCCESSES) this.fadingAid.delete(key);
		else this.fadingAid.set(key, successes + 1);
	}

	/**
	 * After a miss: a solid item of the same mechanic (acquired, no miss in its last attempts, not
	 * waiting for its cold review), served hot as consolidation. Null when none qualifies.
	 */
	private recovery(now: number): { planned: PlannedItem; ref: CardRef } | null {
		const mechanic = this.pendingRecovery;
		if (mechanic === null) return null;
		const waiting = new Set(
			reviewableCards(this.owned(), this.last, now)
				.filter((card) => !this.servedAt.has(card.key))
				.map((card) => card.key)
		);
		const solid = this.owned().filter(
			(card) =>
				card.mechanic === mechanic &&
				card.acquiredAt !== null &&
				!waiting.has(card.key) &&
				(this.history.get(card.key) ?? [])
					.slice(-CONFUSION_LOOKBACK)
					.every((attempt) => attempt.success) &&
				this.fitsWorkingSet(card.key)
		);
		const card = this.draw(solid, refOf);
		return card ? this.serve(refOf(card), 'consolidation', 'hot') : null;
	}

	private keyOf(ref: CardRef): CardKey {
		return cardKey(ref.mechanic, this.subject.itemKey(ref));
	}

	private owned(): CardState[] {
		return [...this.cards.values()].filter((card) => this.subject.owns(card));
	}

	/** Forgets the card of a probe nobody answered: never played, it is neither previous nor counted. */
	private dropAbandonedProbe(): void {
		const key = this.unansweredProbe;
		if (key === null) return;
		this.unansweredProbe = null;
		this.cards.delete(key);
		this.servedAt.delete(key);
		this.servedCount.delete(key);
		const index = this.recent.lastIndexOf(key);
		if (index >= 0) this.recent.splice(index, 1);
		this.served--;
		this.previous = null;
	}

	/** Never the previous item nor its neighbour. */
	private allowedAfter(ref: CardRef): boolean {
		const previous = this.previous;
		if (previous === null) return true;
		if (this.keyOf(ref) === this.keyOf(previous)) return false;
		return !this.subject.neighbours(ref, previous);
	}

	/** A random draw among the allowed candidates, those the subject prefers first. */
	private draw<T>(candidates: readonly T[], refOfCandidate: (candidate: T) => CardRef): T | null {
		const allowed = candidates.filter((candidate) => this.allowedAfter(refOfCandidate(candidate)));
		const previous = this.previous;
		const prefers = this.subject.prefers?.bind(this.subject);
		const preferred =
			previous === null || prefers === undefined
				? []
				: allowed.filter((candidate) => prefers(refOfCandidate(candidate), previous));
		const pool = preferred.length > 0 ? preferred : allowed;
		if (pool.length === 0) return null;
		return pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
	}

	/**
	 * Categories in their order: a due retest, a cold review, a resumed item, a new one, a
	 * consolidation; tired, retests only. Then the last resort: a retest early, a consolidation of
	 * a recent item, a new item past the thresholds (rested), and nothing rather than the previous.
	 */
	private pick(context: SelectorContext): { planned: PlannedItem; ref: CardRef } | null {
		const due = this.dueRetest();
		if (due) return this.retest(due);
		if (!context.fatigued) {
			const item =
				this.review(context.now) ??
				this.resume() ??
				this.introduce(context.now, true) ??
				this.consolidate(true);
			if (item) return item;
		}
		const early = this.earliestRetest();
		if (early) return this.retest(early);
		if (context.fatigued) return null;
		return this.consolidate(false) ?? this.introduce(context.now, false);
	}

	/** A due retest; the aided presentation after a missed probe comes first (see `presentsAtOnce`). */
	private dueRetest(): LearningEntry | null {
		const due = [...this.learning.values()].filter((entry) => entry.dueAt <= this.served);
		// The aided presentation after a missed probe comes first. With `presentsAtOnce` it follows
		// the miss directly, even after its neighbour (or itself, the probe being the previous
		// item); without, it waits for a prompt the neighbour rule allows.
		const afterProbe = due.find((entry) => entry.dueAt === -Infinity);
		if (afterProbe && (this.subject.presentsAtOnce || this.allowedAfter(afterProbe.ref))) {
			return afterProbe;
		}
		return this.draw(due, (entry) => entry.ref);
	}

	/** The retest nearest to due, never the previous item nor its neighbour. */
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
		const entry: LearningEntry = { ref, dueAt: retestDueAt(this.served, LEARN_RETEST_GAPS[0]) };
		const key = this.keyOf(ref);
		this.learning.set(key, entry);
		// The aided presentation draws the fading aid, until the item is played right.
		if (this.subject.fadingAid(ref.mechanic) && this.levelParams(ref).aided) {
			this.fadingAid.set(key, 0);
		}
		return entry;
	}

	private review(now: number): { planned: PlannedItem; ref: CardRef } | null {
		if (this.reviews >= LEARN_COLD_CAP) return null;
		const candidates = reviewableCards(this.owned(), this.last, now).filter(
			(card) => !this.servedAt.has(card.key)
		);
		const card = this.draw(candidates, refOf);
		if (!card) return null;
		this.reviews++;
		return this.serve(refOf(card), 'review', 'cold');
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

	/** `gated` false: past the success thresholds, only when nothing else can be served. */
	private introduce(now: number, gated: boolean): { planned: PlannedItem; ref: CardRef } | null {
		const owned = this.owned();
		const beingLearned = owned.filter((card) => card.learnedAt === null);
		const unconsolidated = owned.filter(
			(card) => card.learnedAt !== null && card.acquiredAt === null
		).length;
		if (beingLearned.length >= LEARNING_SLOTS || unconsolidated >= MAX_UNCONSOLIDATED) return null;
		if (this.workingSet.size >= MAX_WORKING_SET) return null;
		if (gated && !this.readyForNew(beingLearned)) return null;
		const ref = this.subject.nextNew(
			[...this.cards.values()],
			this.history,
			(candidate) => !this.allowedAfter(candidate)
		);
		if (!ref || !this.subject.owns(ref) || !this.allowedAfter(ref)) return null;
		const key = this.keyOf(ref);
		const card = introduceCard(
			{ key, mechanic: ref.mechanic, item: ref.item },
			now,
			this.sessionId
		);
		this.cards.set(key, card);
		this.unansweredProbe = key;
		return { planned: this.plan(ref, 'probe', 'cold', this.topParams(ref), false), ref };
	}

	/**
	 * New items wait until every item being learned is mostly right lately and the session's
	 * rolling success (probes left out) is high enough.
	 */
	private readyForNew(beingLearned: readonly CardState[]): boolean {
		const recent = this.played.filter((attempt) => attempt.phase !== 'probe');
		const session = successRate(recent.slice(-SUCCESS_WINDOW));
		if (session !== null && session < NEW_NOTE_MIN_SESSION_SUCCESS) return false;
		return beingLearned.every(
			(card) => (cardSuccessRate(this.played, card.key) ?? 0) >= NEW_NOTE_MIN_CARD_SUCCESS
		);
	}

	/** `skipRecent` false: an item of the last prompts may come back, never the previous one. */
	private consolidate(skipRecent: boolean): { planned: PlannedItem; ref: CardRef } | null {
		const confused = (key: CardKey) =>
			(this.history.get(key) ?? [])
				.slice(-CONFUSION_LOOKBACK)
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
			.slice(0, CONSOLIDATION_POOL);
		const card = this.draw(weakest, refOf);
		return card ? this.serve(refOf(card), 'consolidation', 'hot') : null;
	}

	/** An item may be served hot: already in the working set, or the set has room. */
	private fitsWorkingSet(key: CardKey): boolean {
		return this.workingSet.has(key) || this.workingSet.size < MAX_WORKING_SET;
	}

	private tempoOf(ref: CardRef): number {
		return this.tempos[this.subject.exerciseOf(ref.mechanic)] ?? DEFAULT_TEMPO_BPM;
	}

	private ladderOf(ref: CardRef): Ladder {
		return this.subject.ladder(ref.mechanic, this.tempoOf(ref));
	}

	/** The params of the item's level, brought into today's ladder. */
	private levelParams(ref: CardRef): LadderParams {
		const ladder = this.ladderOf(ref);
		const { lowest } = levelRange(ladder);
		const { level } = ladderLevel(this.levelOf(ref), ladder);
		return ladder[level - lowest].params as LadderParams;
	}

	private topParams(ref: CardRef): LadderParams {
		const ladder = this.ladderOf(ref);
		return ladder[ladder.length - 1].params as LadderParams;
	}

	/** An item served at its level; aided only while learning, at the aided level. */
	private serve(
		ref: CardRef,
		phase: ItemPhase,
		temperature: Temperature
	): { planned: PlannedItem; ref: CardRef } {
		const params = this.levelParams(ref);
		const fading = temperature === 'hot' && this.fadingAid.has(this.keyOf(ref));
		const planned = this.plan(ref, phase, temperature, params, fading);
		if (phase === 'learning' && params.aided) planned.aid = 'show-position';
		return { planned, ref };
	}

	private plan(
		ref: CardRef,
		phase: ItemPhase,
		temperature: Temperature,
		params: LadderParams,
		stringAid: boolean
	): PlannedItem {
		return {
			exerciseId: this.subject.exerciseOf(ref.mechanic),
			mechanic: ref.mechanic,
			item: this.subject.promptItem?.(ref, this.random) ?? ref.item,
			phase,
			temperature,
			aid: 'none',
			leadBeats: params.leadBeats,
			...(stringAid && { stringAid: true })
		};
	}
}

/** Serves what an item needs next, whatever the exercise (spec 2026-10-14, amendment 2026-10-23 §3). */
export function createLearningProcedure(input: {
	subject: LearningSubject;
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	levels: readonly LevelState[];
	sessionId: string;
	/** Tempo of each exercise's execution in this session. */
	tempos: Readonly<Record<ExerciseId, number>>;
	random?: () => number;
}): LearningProcedure {
	return new Procedure(
		input.subject,
		input.cards,
		input.attempts,
		input.levels,
		input.sessionId,
		input.tempos,
		input.random ?? Math.random
	);
}
