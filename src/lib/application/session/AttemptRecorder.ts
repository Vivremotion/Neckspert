import type { PitchName } from '$lib/domain/music/types';
import {
	applyColdAttempt,
	classifyTemperature,
	introduceCard,
	probeTemperature,
	type SessionSelector
} from '$lib/domain/progress';
import type {
	Answer,
	Attempt,
	CardState,
	Confusion,
	PlannedItem,
	Temperature
} from '$lib/domain/types';
import { cardKey } from '$lib/domain/types';
import type { RoundOutcome } from '$lib/domain/timing';
import type { AudioClockPort } from '$lib/application/ports';
import type {
	AttemptRepositoryPort,
	CardStateRepositoryPort
} from '$lib/application/ports/repositories';

/** What the mechanic's judge said of the answer; null without an answer. */
export type JudgedAnswer = { answer: unknown; confusion: Confusion | null } | null;

/**
 * Provisional, until attempts store the mechanic's own answer: the judge's answer
 * ({ midi } / { pitch }) in the stored shape. The only cast of an opaque answer.
 */
function storedAnswer(planned: PlannedItem, judged: JudgedAnswer): Answer | null {
	if (judged === null) return null;
	return planned.target.direction === 'locate'
		? { kind: 'note', midi: (judged.answer as { midi: number }).midi }
		: { kind: 'name', pitch: (judged.answer as { pitch: PitchName }).pitch };
}

export interface AttemptRecorderDeps {
	attempts: AttemptRepositoryPort;
	cards: CardStateRepositoryPort;
	clock: AudioClockPort;
	now: () => number;
	selector: SessionSelector;
	sessionId: string;
	/** Tempo the series runs at, for probe temperature and cold-attempt scheduling. */
	tempoBpm: number;
}

/** Turns settled rounds into stored attempts and card updates, for one series. */
export class AttemptRecorder {
	private readonly deps: AttemptRecorderDeps;
	private readonly attempts: Attempt[] = [];

	constructor(deps: AttemptRecorderDeps) {
		this.deps = deps;
	}

	/** This series' attempts, oldest first. */
	get sessionAttempts(): readonly Attempt[] {
		return this.attempts;
	}

	/**
	 * Synchronous part done on return (attempt pushed, selector told), so fatigue and the next
	 * beat see it; `stored` settles once card and attempt are written.
	 */
	record(
		planned: PlannedItem,
		outcome: RoundOutcome,
		promptTime: number,
		judged: JudgedAnswer
	): { attempt: Attempt; stored: Promise<void> } {
		const { selector, sessionId, clock } = this.deps;
		const key = cardKey(planned.target);
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

		const attempt: Attempt = {
			sessionId,
			cardKey: key,
			target: planned.target,
			phase: planned.phase,
			temperature: provisionalTemperature,
			aid: planned.aid,
			leadBeats: planned.leadBeats,
			promptedAt,
			answer: storedAnswer(planned, judged),
			correct: outcome.correct,
			verdict: outcome.verdict,
			timingOffsetMs: outcome.timingOffsetMs,
			reactionMs: outcome.reactionMs,
			confusion: judged?.confusion ?? null
		};

		// Fatigue and the selector must see the attempt before any await, so the next onBeat
		// cannot pick a prompt from stale state.
		this.attempts.push(attempt);
		const recorded = selector.record(attempt, this.deps.now());

		const stored = this.store(planned, attempt, recorded, attemptedInSession);
		return { attempt, stored };
	}

	private async store(
		item: PlannedItem,
		attempt: Attempt,
		outcome: ReturnType<SessionSelector['record']>,
		attemptedInSession: boolean
	): Promise<void> {
		const { attempts, cards, tempoBpm } = this.deps;
		const key = attempt.cardKey;
		const history = await attempts.listByCard(key);
		const existing = await cards.get(key);
		const lastAttemptAt = history.length > 0 ? history[history.length - 1].promptedAt : null;
		// A missed probe is hot: it measures no forgetting (spec 2026-10-03, section 1).
		const temperature =
			item.phase === 'probe'
				? probeTemperature(attempt, tempoBpm)
				: this.temperatureFor(item, existing, {
						lastAttemptAt,
						attemptedInSession,
						now: attempt.promptedAt
					});
		attempt.temperature = temperature;

		await attempts.add(attempt);

		const now = this.deps.now();
		if ((item.phase === 'review' || item.phase === 'free') && temperature === 'cold') {
			if (existing) {
				const fullHistory = [...history, attempt];
				await this.storeCard(applyColdAttempt(existing, attempt, fullHistory, now, tempoBpm));
			}
		} else if (item.phase === 'probe') {
			if (outcome) await this.storeCard(outcome.card);
		} else if (item.phase === 'learning') {
			if (outcome) await this.storeCard(outcome.card);
			else if (!existing) {
				await this.storeCard(introduceCard(item.target, now, this.deps.sessionId));
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
