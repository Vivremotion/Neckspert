import { DEFAULT_TEMPO_BPM, pacingOf } from '$lib/domain/exercise';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import { triadAnchorRules, triadZoneRules, type TriadZoneItem } from '$lib/domain/mechanics';
import { parseVoicingKey, voicingKey, voicingOccurrences } from '$lib/domain/music';
import type { TimingRelation } from '$lib/domain/timing';
import {
	cueFrets,
	occurrencePosition,
	triadIntroductionOrder,
	triadParams
} from '$lib/domain/triads';
import {
	cardKey,
	isSuccess,
	type Attempt,
	type CardKey,
	type CardState,
	type LeadBeats,
	type PlannedItem
} from '$lib/domain/types';
import { introduceCard, isAcquired, markLearned, probeCard } from './cards';
import {
	CONFUSION_LOOKBACK,
	CONSOLIDATION_POOL,
	CONSOLIDATION_SKIP_RECENT,
	LEARN_COLD_CAP,
	LEARN_RETEST_GAPS,
	LEARN_SESSION_MS,
	LEARNING_SLOTS,
	MAX_UNCONSOLIDATED,
	MAX_WORKING_SET,
	NEW_NOTE_MIN_CARD_SUCCESS,
	NEW_NOTE_MIN_SESSION_SUCCESS,
	RECOVERY_AFTER_MISSES,
	SEQUENCE_LENGTH,
	SEQUENCE_MAX_DELAY,
	SUCCESS_WINDOW
} from './constants';
import { lastAttemptByCard, reviewableCards } from './review';
import type { RecordOutcome, SelectorContext, SessionSelector } from './selector';
import { cardSuccessRate, successRate } from './success';

type TriadMechanic = 'triad-anchor' | 'triad-zone';

const ANCHOR = 'triad-anchor' satisfies TriadMechanic;
const ZONE = 'triad-zone' satisfies TriadMechanic;

/** What the session knows of one of its two mechanics, from its exercise. */
interface Track {
	definition: ExerciseDefinition;
	timing: TimingRelation;
	/** Lead ladder of the exercise, longest first. */
	steps: readonly LeadBeats[];
	learnedAfter: number;
	tempoBpm: number;
}

/** A triad presented in this session and not learned yet, in one mechanic. */
interface LearningEntry {
	key: CardKey;
	mechanic: TriadMechanic;
	voicingKey: string;
	/** Prompt count from which its next retest is due; -Infinity right after a missed probe. */
	dueAt: number;
	/** Successes at the shortest lead. */
	successes: number;
	lead: LeadBeats;
}

/** A run of prompts of one mechanic. */
interface Sequence {
	mechanic: TriadMechanic;
	count: number;
}

type Fit = (mechanic: TriadMechanic) => boolean;

const ANY: Fit = () => true;

function retestDueAt(servedAt: number, gap: number): number {
	return servedAt + gap + 1;
}

function isOpen(sequence: Sequence | null): sequence is Sequence {
	return sequence !== null && sequence.count < SEQUENCE_LENGTH;
}

function asTriadMechanic(mechanic: string): TriadMechanic | null {
	return mechanic === ANCHOR || mechanic === ZONE ? mechanic : null;
}

function voicingOfCard(card: CardState): string {
	return (card.item as { voicingKey: string }).voicingKey;
}

/** The triads session: the learn session's rules over the two triad mechanics (spec 2026-10-08, §2). */
class TriadSelector implements SessionSelector {
	private readonly cards: Map<CardKey, CardState>;
	private readonly last: Map<CardKey, number>;
	/** Every attempt of each card, oldest first: acquisition reads them. */
	private readonly allByCard = new Map<CardKey, Attempt[]>();
	private readonly learning = new Map<CardKey, LearningEntry>();
	private readonly servedAt = new Map<CardKey, number>();
	private readonly servedCount = new Map<CardKey, number>();
	private readonly recent: CardKey[] = [];
	/** Last position asked of each zone card, so that the next one differs. */
	private readonly lastPosition = new Map<CardKey, number | 'open'>();
	private readonly played: Attempt[] = [];
	private readonly workingSet = new Set<CardKey>();
	private readonly order: string[];
	private served = 0;
	private reviews = 0;
	private unansweredProbe: CardKey | null = null;
	/** Voicing of the last prompt: still ringing, never the next one. */
	private previous: string | null = null;
	private sequence: Sequence | null = null;
	private missStreak = 0;
	private pendingRecovery: TriadMechanic | null = null;
	private servedRecovery = false;

	constructor(
		cards: readonly CardState[],
		attempts: readonly Attempt[],
		private readonly sessionId: string,
		private readonly tracks: Record<TriadMechanic, Track>,
		acquiredPositions: ReadonlySet<string>,
		private readonly random: () => number
	) {
		this.cards = new Map(
			cards.filter((card) => asTriadMechanic(card.mechanic)).map((card) => [card.key, card])
		);
		const own = attempts.filter((attempt) => asTriadMechanic(attempt.mechanic));
		this.last = lastAttemptByCard(own);
		for (const attempt of [...own].sort((a, b) => a.promptedAt - b.promptedAt)) {
			this.remember(attempt);
		}
		this.order = triadIntroductionOrder(
			triadParams(tracks[ANCHOR].definition),
			acquiredPositions
		).map(voicingKey);
	}

	next(context: SelectorContext): PlannedItem | null {
		if (context.elapsedMs >= LEARN_SESSION_MS) return null;
		this.dropAbandonedProbe();
		const recovery = context.fatigued ? null : this.recovery(context.now);
		this.pendingRecovery = null;
		const item = recovery ?? this.pick(context);
		this.servedRecovery = recovery !== null;
		if (!item) return null;
		const mechanic = item.mechanic as TriadMechanic;
		const { voicingKey: voicing } = item.item as { voicingKey: string };
		const key = cardKey(mechanic, voicing);
		if (item.phase === 'learning' || item.phase === 'consolidation') this.workingSet.add(key);
		this.servedAt.set(key, this.served);
		this.servedCount.set(key, (this.servedCount.get(key) ?? 0) + 1);
		this.recent.push(key);
		if (this.recent.length > CONSOLIDATION_SKIP_RECENT) this.recent.shift();
		this.served++;
		this.previous = voicing;
		this.sequence =
			isOpen(this.sequence) && this.sequence.mechanic === mechanic
				? { mechanic, count: this.sequence.count + 1 }
				: { mechanic, count: 1 };
		return item;
	}

	record(attempt: Attempt, now: number): RecordOutcome {
		const mechanic = asTriadMechanic(attempt.mechanic);
		if (!mechanic) return null;
		this.last.set(attempt.cardKey, attempt.promptedAt);
		this.remember(attempt);
		this.played.push(attempt);
		this.countMiss(attempt);
		if (attempt.phase === 'probe') {
			if (attempt.cardKey === this.unansweredProbe) this.unansweredProbe = null;
			return this.recordProbe(attempt, mechanic, now);
		}
		if (attempt.phase !== 'learning') return null;
		const entry = this.learning.get(attempt.cardKey);
		const servedAt = this.servedAt.get(attempt.cardKey);
		if (!entry || servedAt === undefined) return null;
		const step = this.climb(entry, isSuccess(attempt));
		if (step === 'learned') {
			this.learning.delete(attempt.cardKey);
			const card = this.cards.get(attempt.cardKey);
			if (!card) return null;
			const track = this.tracks[mechanic];
			const learned = markLearned(card, now, track.timing, track.tempoBpm);
			this.cards.set(learned.key, learned);
			return { card: learned };
		}
		const [shortGap, longGap] = LEARN_RETEST_GAPS;
		entry.dueAt = retestDueAt(servedAt, step === 'short' ? shortGap : longGap);
		return null;
	}

	cardChanged(card: CardState): void {
		if (asTriadMechanic(card.mechanic)) this.cards.set(card.key, card);
	}

	private remember(attempt: Attempt): void {
		const list = this.allByCard.get(attempt.cardKey) ?? [];
		list.push(attempt);
		this.allByCard.set(attempt.cardKey, list);
		const item = attempt.data as { item?: { position?: number | 'open' } } | null;
		const position = item?.item?.position;
		if (attempt.mechanic === ZONE && position !== undefined) {
			this.lastPosition.set(attempt.cardKey, position);
		}
	}

	private recentAttempts(key: CardKey): Attempt[] {
		return (this.allByCard.get(key) ?? []).slice(-CONFUSION_LOOKBACK);
	}

	/** The previous chord still rings: never the same voicing, whatever the mechanic. */
	private allowed(voicing: string): boolean {
		return voicing !== this.previous;
	}

	/**
	 * Climbs the exercise's lead ladder: a success one step shorter, a miss one step longer;
	 * `learnedAfter` successes at the shortest step make the triad learned.
	 */
	private climb(entry: LearningEntry, success: boolean): 'short' | 'long' | 'learned' {
		const { steps, learnedAfter } = this.tracks[entry.mechanic];
		const shortest = steps[steps.length - 1];
		const index = Math.max(steps.indexOf(entry.lead), 0);
		if (!success) {
			entry.lead = steps[Math.max(index - 1, 0)];
			entry.successes = 0;
			return 'short';
		}
		if (entry.lead > shortest) {
			const fromPresentation = index === 0;
			entry.lead = steps[index + 1];
			return fromPresentation ? 'short' : 'long';
		}
		entry.successes++;
		return entry.successes >= learnedAfter ? 'learned' : 'long';
	}

	private countMiss(attempt: Attempt): void {
		if (attempt.phase === 'probe') return;
		if (isSuccess(attempt)) {
			this.missStreak = 0;
			this.pendingRecovery = null;
			return;
		}
		if (this.servedRecovery) return;
		this.missStreak++;
		if (this.missStreak < RECOVERY_AFTER_MISSES) return;
		this.missStreak = 0;
		this.pendingRecovery = attempt.mechanic as TriadMechanic;
	}

	/** After a miss: a solid triad of the same mechanic, served hot as consolidation. */
	private recovery(now: number): PlannedItem | null {
		const mechanic = this.pendingRecovery;
		if (mechanic === null) return null;
		const reviewable = new Set(
			reviewableCards([...this.cards.values()], this.last, now)
				.filter((card) => !this.servedAt.has(card.key))
				.map((card) => card.key)
		);
		const solid = [...this.cards.values()].filter(
			(card) =>
				card.mechanic === mechanic &&
				card.acquiredAt !== null &&
				!reviewable.has(card.key) &&
				this.recentAttempts(card.key).every(isSuccess) &&
				this.fitsWorkingSet(card.key) &&
				this.allowed(voicingOfCard(card))
		);
		const card = this.pickAtRandom(solid);
		if (!card) return null;
		return this.planned(mechanic, voicingOfCard(card), {
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: card.leadBeats
		});
	}

	private fitsWorkingSet(key: CardKey): boolean {
		return this.workingSet.has(key) || this.workingSet.size < MAX_WORKING_SET;
	}

	/** Rolling success over the session's last triad prompts, probes left out. */
	private sessionSuccess(): number | null {
		const counted = this.played.filter((attempt) => attempt.phase !== 'probe');
		return successRate(counted.slice(-SUCCESS_WINDOW));
	}

	private readyForNewTriad(cards: readonly CardState[]): boolean {
		if (this.workingSet.size >= MAX_WORKING_SET) return false;
		const session = this.sessionSuccess();
		if (session !== null && session < NEW_NOTE_MIN_SESSION_SUCCESS) return false;
		return cards
			.filter((card) => card.learnedAt === null)
			.every((card) => (cardSuccessRate(this.played, card.key) ?? 0) >= NEW_NOTE_MIN_CARD_SUCCESS);
	}

	private dropAbandonedProbe(): void {
		if (this.unansweredProbe === null) return;
		this.cards.delete(this.unansweredProbe);
		this.servedAt.delete(this.unansweredProbe);
		this.unansweredProbe = null;
		this.previous = null;
		if (this.sequence !== null) {
			this.sequence =
				this.sequence.count > 1 ? { ...this.sequence, count: this.sequence.count - 1 } : null;
		}
	}

	/** A passed probe goes to review; a missed one is presented with its aid as soon as it may. */
	private recordProbe(attempt: Attempt, mechanic: TriadMechanic, now: number): RecordOutcome {
		const card = this.cards.get(attempt.cardKey);
		if (!card) return null;
		const known = probeCard(card, attempt, now, this.sessionId, this.tracks[mechanic].timing);
		if (known) {
			this.cards.set(known.key, known);
			return { card: known };
		}
		this.present(mechanic, voicingOfCard(card)).dueAt = -Infinity;
		return { card };
	}

	private present(mechanic: TriadMechanic, voicing: string): LearningEntry {
		const entry: LearningEntry = {
			key: cardKey(mechanic, voicing),
			mechanic,
			voicingKey: voicing,
			dueAt: retestDueAt(this.served, LEARN_RETEST_GAPS[0]),
			successes: 0,
			lead: this.tracks[mechanic].steps[0]
		};
		this.learning.set(entry.key, entry);
		return entry;
	}

	private fits(mechanic: TriadMechanic): boolean {
		return !isOpen(this.sequence) || this.sequence.mechanic === mechanic;
	}

	/**
	 * Category priority is fixed: retests, cold reviews, resumed triads, new triads, consolidation;
	 * in sequences of one mechanic, closed early rather than repeat a triad.
	 */
	private pick(context: SelectorContext): PlannedItem | null {
		if (isOpen(this.sequence) && this.retestOverdue()) this.sequence = null;
		const fit: Fit = (mechanic) => this.fits(mechanic);
		const item = this.pickWith(context, fit, !isOpen(this.sequence));
		if (item || !isOpen(this.sequence)) return item;
		this.sequence = null;
		return this.pickWith(context, ANY);
	}

	/** A retest of the other mechanic kept waiting past SEQUENCE_MAX_DELAY ends the sequence. */
	private retestOverdue(): boolean {
		for (const entry of this.learning.values()) {
			if (this.served - entry.dueAt <= SEQUENCE_MAX_DELAY) continue;
			if (!this.fits(entry.mechanic)) return true;
		}
		return false;
	}

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
		// Nothing else: a retest early, then a recent triad again, then a new one past the gate.
		const early = this.earliestRetest(
			(entry) => fit(entry.mechanic) && this.allowed(entry.voicingKey)
		);
		if (early) return this.retest(early);
		if (!context.fatigued) {
			return this.consolidate(fit, false) ?? this.introduce(context.now, fit, false);
		}
		return null;
	}

	private dueRetest(fit: Fit): LearningEntry | null {
		const due = [...this.learning.values()].filter(
			(entry) => entry.dueAt <= this.served && fit(entry.mechanic) && this.allowed(entry.voicingKey)
		);
		const afterProbe = due.find((entry) => entry.dueAt === -Infinity);
		if (afterProbe) return afterProbe;
		return this.pickAtRandom(due);
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
		const aided = entry.lead === this.tracks[entry.mechanic].steps[0];
		return this.planned(entry.mechanic, entry.voicingKey, {
			phase: 'learning',
			temperature: 'hot',
			aid: aided ? 'show-position' : 'none',
			leadBeats: entry.lead
		});
	}

	private review(now: number, fit: Fit): PlannedItem | null {
		if (this.reviews >= LEARN_COLD_CAP) return null;
		const candidates = reviewableCards([...this.cards.values()], this.last, now).filter(
			(card) =>
				!this.servedAt.has(card.key) &&
				fit(card.mechanic as TriadMechanic) &&
				this.allowed(voicingOfCard(card))
		);
		const card = this.pickAtRandom(candidates);
		if (!card) return null;
		this.reviews++;
		return this.planned(card.mechanic as TriadMechanic, voicingOfCard(card), {
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: card.leadBeats
		});
	}

	private resume(fit: Fit): PlannedItem | null {
		const candidates = [...this.cards.values()]
			.filter(
				(card) =>
					card.learnedAt === null &&
					!this.servedAt.has(card.key) &&
					this.fitsWorkingSet(card.key) &&
					fit(card.mechanic as TriadMechanic) &&
					this.allowed(voicingOfCard(card))
			)
			.sort((a, b) => a.introducedAt - b.introducedAt || a.key.localeCompare(b.key));
		const card = this.pickAtRandom(candidates);
		if (!card) return null;
		return this.retest(this.present(card.mechanic as TriadMechanic, voicingOfCard(card)));
	}

	/**
	 * A new triad, probed first: in position, a triad acquired in anchor; in anchor, the next one
	 * of the queue. `gated` false: past the success gate, only when nothing else can be served.
	 */
	private introduce(now: number, fit: Fit, gated: boolean): PlannedItem | null {
		const cards = [...this.cards.values()];
		const beingLearned = cards.filter((card) => card.learnedAt === null).length;
		const unconsolidated = cards.filter(
			(card) => card.learnedAt !== null && card.acquiredAt === null
		).length;
		if (beingLearned >= LEARNING_SLOTS || unconsolidated >= MAX_UNCONSOLIDATED) return null;
		if (gated && !this.readyForNewTriad(cards)) return null;
		if (this.workingSet.size >= MAX_WORKING_SET) return null;
		const next = this.nextNew(fit);
		if (!next) return null;
		const track = this.tracks[next.mechanic];
		const key = cardKey(next.mechanic, next.voicing);
		const card = introduceCard(
			{ key, mechanic: next.mechanic, item: { voicingKey: next.voicing } },
			now,
			this.sessionId,
			track.timing
		);
		this.cards.set(card.key, card);
		this.unansweredProbe = card.key;
		return this.planned(next.mechanic, next.voicing, {
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			leadBeats: track.steps[track.steps.length - 1]
		});
	}

	private nextNew(fit: Fit): { mechanic: TriadMechanic; voicing: string } | null {
		if (fit(ZONE)) {
			for (const voicing of this.order) {
				if (!this.allowed(voicing) || this.cards.has(cardKey(ZONE, voicing))) continue;
				const anchor = this.cards.get(cardKey(ANCHOR, voicing));
				const history = this.allByCard.get(cardKey(ANCHOR, voicing)) ?? [];
				if (anchor && isAcquired(anchor, history, this.tracks[ANCHOR].timing)) {
					return { mechanic: ZONE, voicing };
				}
			}
		}
		if (fit(ANCHOR)) {
			// The queue's head when it is not still ringing, else the one after it.
			const voicing = this.order.find(
				(v) => !this.cards.has(cardKey(ANCHOR, v)) && this.allowed(v)
			);
			if (voicing) return { mechanic: ANCHOR, voicing };
		}
		return null;
	}

	private consolidate(fit: Fit, skipRecent: boolean): PlannedItem | null {
		const confused = (key: CardKey) =>
			this.recentAttempts(key).some(
				(attempt) => (attempt.data as { confusion?: unknown } | null)?.confusion != null
			);
		const weakest = [...this.cards.values()]
			.filter(
				(card) =>
					card.learnedAt !== null &&
					!(skipRecent && this.recent.includes(card.key)) &&
					this.fitsWorkingSet(card.key) &&
					this.allowed(voicingOfCard(card)) &&
					fit(card.mechanic as TriadMechanic)
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
		const card = this.pickAtRandom(weakest);
		if (!card) return null;
		return this.planned(card.mechanic as TriadMechanic, voicingOfCard(card), {
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: card.leadBeats
		});
	}

	private pickAtRandom<T>(candidates: readonly T[]): T | null {
		if (candidates.length === 0) return null;
		return candidates[
			Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))
		];
	}

	/** A prompt of a triad card; in position, with a position drawn for it. */
	private planned(
		mechanic: TriadMechanic,
		voicing: string,
		fields: Omit<PlannedItem, 'exerciseId' | 'mechanic' | 'item'>
	): PlannedItem {
		const key = cardKey(mechanic, voicing);
		const item = mechanic === ZONE ? this.zoneItem(key, voicing) : { voicingKey: voicing };
		return { exerciseId: this.tracks[mechanic].definition.id, mechanic, item, ...fields };
	}

	/** A shape of the voicing, and a fret it covers for the prompt to name. */
	private zoneItem(key: CardKey, voicing: string): TriadZoneItem {
		const position = this.drawPosition(key, voicing);
		this.lastPosition.set(key, position);
		const shape = voicingOccurrences(parseVoicingKey(voicing)).find(
			(occurrence) => occurrencePosition(occurrence) === position
		);
		const fret = shape ? this.pickAtRandom(cueFrets(shape)) : null;
		return fret === null
			? { voicingKey: voicing, position }
			: { voicingKey: voicing, position, fret };
	}

	/** A position among the voicing's shapes, another than the last one asked of this card. */
	private drawPosition(key: CardKey, voicing: string): number | 'open' {
		const positions = voicingOccurrences(parseVoicingKey(voicing)).map(occurrencePosition);
		const last = this.lastPosition.get(key);
		const others = positions.filter((position) => position !== last);
		return this.pickAtRandom(others.length > 0 ? others : positions) ?? positions[0];
	}
}

function track(definition: ExerciseDefinition, timing: TimingRelation, tempoBpm: number): Track {
	const pacing = pacingOf(definition);
	return {
		definition,
		timing,
		steps: pacing.leadSteps,
		learnedAfter: pacing.learnedAfter,
		tempoBpm
	};
}

/** Chooses each prompt of a triads session (spec 2026-10-08, section 2). */
export function createTriadSelector(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
	definitions: { anchor: ExerciseDefinition; zone: ExerciseDefinition };
	/** Locate positions (`string:pitch`) already acquired: their triads come first. */
	acquiredPositions: ReadonlySet<string>;
	/** Tempo of each exercise's execution in this session. */
	tempos: Readonly<Record<ExerciseId, number | null>>;
	random?: () => number;
}): SessionSelector {
	const { anchor, zone } = input.definitions;
	const tempoOf = (definition: ExerciseDefinition) =>
		input.tempos[definition.id] ?? DEFAULT_TEMPO_BPM;
	const anchorTiming = triadAnchorRules.timingFor?.(pacingOf(anchor)) ?? triadAnchorRules.timing;
	const zoneTiming = triadZoneRules.timingFor?.(pacingOf(zone)) ?? triadZoneRules.timing;
	return new TriadSelector(
		input.cards,
		input.attempts,
		input.sessionId,
		{
			[ANCHOR]: track(anchor, anchorTiming, tempoOf(anchor)),
			[ZONE]: track(zone, zoneTiming, tempoOf(zone))
		},
		input.acquiredPositions,
		input.random ?? Math.random
	);
}
