import type { MechanicId } from '$lib/domain/exercise/types';
import {
	identifyRules,
	locateRules,
	type IdentifyData,
	type LocateData
} from '$lib/domain/mechanics';
import { asNeckCard, neckCardKey, type LocateItem, type NeckCard } from '$lib/domain/music';
import {
	LEAD_STEPS,
	type Attempt,
	type CardKey,
	type CardState,
	type LeadBeats,
	type PlannedItem
} from '$lib/domain/types';
import { advance, announcesLead, fits, isOpen, type Sequence } from './sequence';
import { cardSuccessRate, sessionSuccessRate } from './success';
import { allowedAfter, pickAtRandom } from './order';
import { cardLeadAfter, introduceCard, markLearned, probeCard } from './cards';
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
	MAX_UNCONSOLIDATED,
	MAX_WORKING_SET,
	NEW_NOTE_MIN_CARD_SUCCESS,
	NEW_NOTE_MIN_SESSION_SUCCESS,
	RECOVERY_AFTER_MISSES,
	SEQUENCE_MAX_DELAY,
	SEQUENCES_ENABLED,
	STRING_AID_FADE_SUCCESSES
} from './constants';
import { nextNewCard } from './introduction';
import { keyed, neckTiming, plannedFor } from './neck';
import { lastAttemptByCard, reviewableCards } from './review';
import type { RecordOutcome, SelectorContext, SessionSelector } from './selector';

/** A note presented in this session and not learned yet. */
interface LearningEntry {
	card: NeckCard;
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

/** Whether a prompt of this mechanic (its scene), at this lead, may be served now (sequences). */
type Fit = (mechanic: MechanicId, lead: LeadBeats | null) => boolean;

/** Both neck mechanics record their confusion in their attempt data. */
function wasConfused(attempt: Attempt): boolean {
	return (attempt.data as LocateData | IdentifyData).confusion !== null;
}

const ANY: Fit = () => true;

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
	/** Card of the last prompt served: the next one is never it, nor its mirror. */
	private previous: NeckCard | null = null;
	/** Last prompt served, for the counted bar that announces a lead change. */
	private previousItem: PlannedItem | null = null;
	/** Open sequence (trial, `sequence.ts`); null before the first prompt or once closed early. */
	private sequence: Sequence | null = null;
	/** This session's attempts, oldest first: success rates steer new notes. */
	private readonly played: Attempt[] = [];
	/** Cards served hot in this session (learning, consolidation, recovery): the working set. */
	private readonly workingSet = new Set<CardKey>();
	/**
	 * Mode 1 cards whose string is drawn on their next hot prompt, with their successes since
	 * the aid came back: set by the aided presentation or a miss, gone after
	 * STRING_AID_FADE_SUCCESSES successes.
	 */
	private readonly stringAid = new Map<CardKey, number>();
	/** Misses in a row, probes and recovery prompts left out. */
	private missStreak = 0;
	/** The last miss calls for a solid card next, in its scene, at this lead ('own': the card's). */
	private pendingRecovery: { mechanic: MechanicId; lead: LeadBeats | 'own' } | null = null;
	/** The prompt just served is a recovery: a miss on it calls for no other. */
	private servedRecovery = false;

	constructor(
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		private readonly sessionId: string,
		private readonly tempoBpm: number,
		private readonly random: () => number,
		private readonly sequences: boolean,
		private readonly priority: readonly LocateItem[]
	) {
		this.cards = new Map(cards.map((card) => [card.key, card]));
		this.last = lastAttemptByCard(attempts);
		const sorted = [...attempts].sort((a, b) => a.promptedAt - b.promptedAt);
		for (const attempt of sorted) this.remember(attempt);
	}

	next(context: SelectorContext): PlannedItem | null {
		if (context.elapsedMs >= LEARN_SESSION_MS) return null;
		this.dropAbandonedProbe();
		const recovery = context.fatigued ? null : this.recovery(context.now);
		this.pendingRecovery = null;
		const item = recovery ?? this.pick(context);
		this.servedRecovery = recovery !== null;
		if (!item) return null;
		const card = asNeckCard(item);
		const key = neckCardKey(card);
		if (item.phase === 'learning' || item.phase === 'consolidation') this.workingSet.add(key);
		this.servedAt.set(key, this.served);
		this.servedCount.set(key, (this.servedCount.get(key) ?? 0) + 1);
		this.recent.push(key);
		if (this.recent.length > CONSOLIDATION_SKIP_RECENT) this.recent.shift();
		this.served++;
		this.previous = card;
		this.enterSequence(item);
		this.previousItem = item;
		return item;
	}

	record(attempt: Attempt, now: number): RecordOutcome {
		this.last.set(attempt.cardKey, attempt.promptedAt);
		this.remember(attempt);
		this.played.push(attempt);
		this.countMiss(attempt);
		this.fadeStringAid(attempt);
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
			entry.card.mechanic === 'locate'
				? this.climbLead(entry, attempt.success)
				: this.climbIdentify(entry, attempt);
		if (step === 'learned') {
			this.learning.delete(attempt.cardKey);
			const card = this.cards.get(attempt.cardKey);
			if (!card) return null;
			const marked = markLearned(card, now);
			const timing = neckTiming(entry.card.mechanic);
			const leadBeats = cardLeadAfter(marked, timing, { learned: this.tempoBpm });
			const learned = { ...marked, leadBeats };
			this.cards.set(learned.key, learned);
			return { card: learned };
		}
		entry.dueAt = retestDueAt(servedAt, step === 'short' ? shortGap : longGap);
		return null;
	}

	/** A miss brings the drawn string back for the card; successes since then take it away. */
	private fadeStringAid(attempt: Attempt): void {
		if (attempt.mechanic !== 'locate') return;
		const key = attempt.cardKey;
		if (!attempt.success) {
			this.stringAid.set(key, 0);
			return;
		}
		const successes = this.stringAid.get(key);
		if (successes === undefined) return;
		if (successes + 1 >= STRING_AID_FADE_SUCCESSES) this.stringAid.delete(key);
		else this.stringAid.set(key, successes + 1);
	}

	/** Whether the next hot prompt of this card draws its string. */
	private drawsString(card: NeckCard): boolean {
		return card.mechanic === 'locate' && this.stringAid.has(neckCardKey(card));
	}

	/** A miss (probes and recovery prompts left out) calls for a solid card on the next prompt. */
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
		// Same scene, and the lead of the sequence the miss belongs to.
		const lead = attempt.leadBeats;
		this.pendingRecovery = {
			mechanic: attempt.mechanic,
			lead: this.sequences && lead !== null && lead !== 1 ? lead : 'own'
		};
	}

	/**
	 * After a miss: a solid card (acquired, no miss in its recent attempts, not waiting for a cold
	 * review), served hot as consolidation. Null when none qualifies.
	 */
	private recovery(now: number): PlannedItem | null {
		const pending = this.pendingRecovery;
		if (pending === null) return null;
		const reviewable = new Set(
			reviewableCards([...this.cards.values()], this.last, now)
				.filter((card) => !this.servedAt.has(card.key))
				.map((card) => card.key)
		);
		const solid = [...this.cards.values()].filter(
			(card) =>
				card.acquiredAt !== null &&
				card.mechanic === pending.mechanic &&
				!reviewable.has(card.key) &&
				(this.history.get(card.key) ?? []).every((attempt) => attempt.success) &&
				this.fitsWorkingSet(card.key)
		);
		const card = pickAtRandom(solid, this.previous, this.random);
		if (!card) return null;
		return plannedFor(asNeckCard(card), {
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: pending.lead === 'own' ? this.cardLead(card) : pending.lead
		});
	}

	/** A card may be served hot: already in the working set, or the set has room. */
	private fitsWorkingSet(key: CardKey): boolean {
		return this.workingSet.has(key) || this.workingSet.size < MAX_WORKING_SET;
	}

	/**
	 * New notes wait until every note being learned is mostly right lately, the session's
	 * rolling success is high enough, and the working set has room for a missed probe.
	 */
	private readyForNewNote(cards: readonly CardState[]): boolean {
		if (this.workingSet.size >= MAX_WORKING_SET) return false;
		const session = sessionSuccessRate(this.played);
		if (session !== null && session < NEW_NOTE_MIN_SESSION_SUCCESS) return false;
		return cards
			.filter((card) => card.learnedAt === null)
			.every((card) => (cardSuccessRate(this.played, card.key) ?? 0) >= NEW_NOTE_MIN_CARD_SUCCESS);
	}

	/** Forgets the in-memory card of a probe nobody answered, so the note can be probed again. */
	private dropAbandonedProbe(): void {
		if (this.unansweredProbe === null) return;
		this.cards.delete(this.unansweredProbe);
		this.servedAt.delete(this.unansweredProbe);
		this.unansweredProbe = null;
		// Never played: it does not count as the previous note, nor in its sequence.
		this.previous = null;
		this.previousItem = null;
		if (this.sequence !== null) {
			this.sequence =
				this.sequence.count > 1 ? { ...this.sequence, count: this.sequence.count - 1 } : null;
		}
	}

	/** A passed probe goes to review; a missed one is presented with the aid on the next prompt. */
	private recordProbe(attempt: Attempt, now: number): RecordOutcome {
		const card = this.cards.get(attempt.cardKey);
		if (!card) return null;
		const timing = neckTiming(card.mechanic);
		const probed = probeCard(card, attempt, now, this.sessionId, (a) => timing.isDirectRecall(a));
		const known = probed && {
			...probed,
			leadBeats: cardLeadAfter(probed, timing, { probe: attempt })
		};
		if (known) {
			this.cards.set(known.key, known);
			return { card: known };
		}
		// Ahead of any other due retest: the aid must follow the miss directly.
		this.present(asNeckCard(card)).dueAt = -Infinity;
		return { card };
	}

	/**
	 * Mode 1 ladder: a success halves the lead (8, 4, then the direct-recall lead), a miss
	 * doubles it up to 8. LEARN_SUCCESSES successes at the direct-recall lead make it learned.
	 */
	private climbLead(entry: LearningEntry, correct: boolean): 'short' | 'long' | 'learned' {
		const final = locateRules.timing.learnedLead(this.tempoBpm);
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
			entry.aided = attempt.correct !== true;
			entry.successes = 0;
			return 'short';
		}
		// Direct recall is judged on reaction time by identify's time relation; tempo plays no part.
		if (!identifyRules.timing.isDirectRecall(attempt)) {
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
		if (!this.sequences) return this.pickWith(context, ANY);
		// A retest kept waiting too long by the open sequence ends it.
		if (isOpen(this.sequence) && this.retestOverdue()) this.sequence = null;
		const fit: Fit = (mechanic, lead) => fits(this.sequence, mechanic, lead);
		// Inside an open sequence, no last resort: it never repeats a card to fill itself.
		const item = this.pickWith(context, fit, !isOpen(this.sequence));
		if (item || !isOpen(this.sequence)) return item;
		// Nothing fits the open sequence: it ends early rather than repeat a card.
		this.sequence = null;
		return this.pickWith(context, ANY);
	}

	/** Counts the prompt in its sequence; a new mode 1 sequence at another lead is counted in. */
	private enterSequence(item: PlannedItem): void {
		if (!this.sequences) return;
		const { mechanic } = item;
		if (!isOpen(this.sequence) || !fits(this.sequence, mechanic, item.leadBeats)) {
			const previous = this.previousItem
				? { mechanic: this.previousItem.mechanic, lead: this.previousItem.leadBeats }
				: null;
			if (announcesLead(previous, mechanic, item.leadBeats)) item.countIn = true;
		}
		this.sequence = advance(this.sequence, mechanic, item.leadBeats);
	}

	/** A retest that does not fit the open sequence and is SEQUENCE_MAX_DELAY prompts past its gap. */
	private retestOverdue(): boolean {
		for (const entry of this.learning.values()) {
			if (this.served - entry.dueAt <= SEQUENCE_MAX_DELAY) continue;
			if (!fits(this.sequence, entry.card.mechanic, this.retestLead(entry))) return true;
		}
		return false;
	}

	/**
	 * Category priority is fixed: retests, cold reviews, resumed notes, new notes, consolidation.
	 * Inside a category the draw is random, never the previous card nor its mirror, and another
	 * string when possible (`pickAtRandom`). `fit` keeps to the open sequence.
	 */
	private pickWith(context: SelectorContext, fit: Fit, lastResort = true): PlannedItem | null {
		const dueRetest = this.dueRetest(fit);
		if (dueRetest) return this.retest(dueRetest);
		if (!context.fatigued) {
			const item =
				this.review(context.now, fit) ??
				this.resume(fit) ??
				this.introduce(context.now, fit, true) ??
				this.consolidate(fit, true);
			if (item) return item;
		}
		if (!lastResort) return null;
		// Nothing else. Rather than end the session or hammer one note: a retest early, then
		// a recent note again, then a new note past the success gate, and the previous card
		// only when nothing at all is left.
		const fitting = (entry: LearningEntry) => fit(entry.card.mechanic, this.retestLead(entry));
		const early = this.earliestRetest(
			(entry) => fitting(entry) && allowedAfter(entry.card, this.previous)
		);
		if (early) return this.retest(early);
		if (!context.fatigued) {
			const item = this.consolidate(fit, false) ?? this.introduce(context.now, fit, false);
			if (item) return item;
		}
		const any = this.earliestRetest(fitting);
		return any ? this.retest(any) : null;
	}

	/** A due retest; the aided presentation after a missed probe always comes first. */
	private dueRetest(fit: Fit): LearningEntry | null {
		const due = [...this.learning.values()].filter(
			(entry) => entry.dueAt <= this.served && fit(entry.card.mechanic, this.retestLead(entry))
		);
		const afterProbe = due.find((entry) => entry.dueAt === -Infinity);
		if (afterProbe) return afterProbe;
		const picked = pickAtRandom(
			due.map((entry) => ({ ...entry.card, entry })),
			this.previous,
			this.random
		);
		return picked?.entry ?? null;
	}

	private retestLead(entry: LearningEntry): LeadBeats | null {
		return entry.card.mechanic === 'locate' ? entry.lead : null;
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
		const locate = entry.card.mechanic === 'locate';
		const aided = locate ? entry.lead === LEARN_PRESENT_LEAD_BEATS : entry.aided;
		return plannedFor(entry.card, {
			phase: 'learning',
			temperature: 'hot',
			aid: aided ? 'show-position' : 'none',
			leadBeats: locate ? entry.lead : null,
			stringAid: this.drawsString(entry.card)
		});
	}

	/** Starts aided learning; the first retest comes after the short gap unless the caller moves it. */
	private present(card: NeckCard): LearningEntry {
		const entry: LearningEntry = {
			card,
			dueAt: retestDueAt(this.served, LEARN_RETEST_GAPS[0]),
			successes: 0,
			aided: true,
			lead: LEARN_PRESENT_LEAD_BEATS
		};
		this.learning.set(neckCardKey(card), entry);
		// The aided presentation draws the string, until the note is played right.
		if (card.mechanic === 'locate') this.stringAid.set(neckCardKey(card), 0);
		return entry;
	}

	private review(now: number, fit: Fit): PlannedItem | null {
		if (this.reviews >= LEARN_COLD_CAP) return null;
		const candidates = reviewableCards([...this.cards.values()], this.last, now).filter(
			(candidate) =>
				!this.servedAt.has(candidate.key) && fit(candidate.mechanic, this.cardLead(candidate))
		);
		const card = pickAtRandom(candidates, this.previous, this.random);
		if (!card) return null;
		this.reviews++;
		return plannedFor(asNeckCard(card), {
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: card.mechanic === 'locate' ? card.leadBeats : null
		});
	}

	private resume(fit: Fit): PlannedItem | null {
		const presentationLead = (mechanic: MechanicId) =>
			mechanic === 'locate' ? LEARN_PRESENT_LEAD_BEATS : null;
		const candidates = [...this.cards.values()]
			.filter(
				(candidate) =>
					candidate.learnedAt === null &&
					!this.servedAt.has(candidate.key) &&
					this.fitsWorkingSet(candidate.key) &&
					fit(candidate.mechanic, presentationLead(candidate.mechanic))
			)
			.sort((a, b) => a.introducedAt - b.introducedAt || a.key.localeCompare(b.key));
		const card = pickAtRandom(candidates, this.previous, this.random);
		return card ? this.retest(this.present(asNeckCard(card))) : null;
	}

	/** `gated` false: past the success gate, only when nothing else can be served. */
	private introduce(now: number, fit: Fit, gated: boolean): PlannedItem | null {
		const cards = [...this.cards.values()];
		const beingLearned = cards.filter((card) => card.learnedAt === null).length;
		const unconsolidated = cards.filter(
			(card) => card.learnedAt !== null && card.acquiredAt === null
		).length;
		if (beingLearned >= LEARNING_SLOTS || unconsolidated >= MAX_UNCONSOLIDATED) return null;
		if (gated && !this.readyForNewNote(cards)) return null;
		if (this.workingSet.size >= MAX_WORKING_SET) return null;
		const next = nextNewCard(cards, this.priority);
		if (!next || !allowedAfter(next, this.previous)) return null;
		const lead = next.mechanic === 'locate' ? locateRules.timing.learnedLead(this.tempoBpm) : null;
		if (!fit(next.mechanic, lead)) return null;
		const introduced = introduceCard(keyed(next), now, this.sessionId);
		const leadBeats = cardLeadAfter(introduced, neckTiming(next.mechanic), 'introduced');
		const card = { ...introduced, leadBeats };
		this.cards.set(card.key, card);
		this.unansweredProbe = card.key;
		return plannedFor(next, { phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: lead });
	}

	/** Lead of a card served as it is (review, consolidation); null in mode 2. */
	private cardLead(card: CardState): LeadBeats | null {
		return card.mechanic === 'locate' ? card.leadBeats : null;
	}

	/**
	 * Consolidation lead: the card's own, or the open sequence's when the card is acquired and
	 * the sequence gives it at least as long.
	 */
	private consolidationLead(card: CardState): LeadBeats | null {
		const own = this.cardLead(card);
		const sequence = this.sequence;
		if (own === null || !this.sequences || !isOpen(sequence) || sequence.lead === null) return own;
		return card.acquiredAt !== null && sequence.lead >= own ? sequence.lead : own;
	}

	/** `skipRecent` false: a note of the last prompts may come back, never the previous one. */
	private consolidate(fit: Fit, skipRecent: boolean): PlannedItem | null {
		const confused = (key: CardKey) => (this.history.get(key) ?? []).some(wasConfused);
		const weakest = [...this.cards.values()]
			.filter(
				(candidate) =>
					candidate.learnedAt !== null &&
					!(skipRecent && this.recent.includes(candidate.key)) &&
					this.fitsWorkingSet(candidate.key) &&
					allowedAfter(asNeckCard(candidate), this.previous) &&
					fit(candidate.mechanic, this.consolidationLead(candidate))
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
		return plannedFor(asNeckCard(card), {
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: this.consolidationLead(card),
			stringAid: this.drawsString(asNeckCard(card))
		});
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
	/** Sequences trial; defaults to SEQUENCES_ENABLED. */
	sequences?: boolean;
	/** Notes introduced first: those of the triads being learned (spec 2026-10-08, section 2). */
	priority?: readonly LocateItem[];
}): SessionSelector {
	return new LearnSelector(
		input.cards,
		input.attempts,
		input.sessionId,
		input.tempoBpm,
		input.random ?? Math.random,
		input.sequences ?? SEQUENCES_ENABLED,
		input.priority ?? []
	);
}
