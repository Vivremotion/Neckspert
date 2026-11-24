import type {
	Attempt,
	CardKey,
	CardState,
	LeadBeats,
	PlannedItem,
	SchedulingState
} from '../../types';
import { Rating, introScheduling, reviewScheduling } from '../../progress/scheduling';
import { cardKey } from '../../types';
import type { ExerciseId } from '../../exercise/types';
import type { SkillId } from '../../types';
import {
	RESPONSE_VERDICT_VERSION,
	type ResponseValue,
	type ResponseVerdict
} from '../../time/modes/responseVerdict';
import { directRecallWithin } from '../recall';
import type { Level } from '../../time/levels';
import { DEFAULT_ITEM_LEARNING, type ItemLearning } from '../params';
import type { CardRef, Ladder, LearningSubject } from '../subject';

const FAKE_SKILL = 'fake' as SkillId;
const FAKE_TEMPO_BPM = 80;

/**
 * A written level of a ladder: `pass` and `drop` 1 unless said otherwise, any success; `params`
 * adds what else the level writes (a `presentation.*` path…).
 */
export function rung(
	leadBeats: LeadBeats | null,
	options: {
		params?: Record<string, unknown>;
		pass?: number;
		drop?: number;
		success?: Level['success'];
	} = {}
): Ladder[number] {
	return {
		params: { ...options.params, leadBeats },
		pass: { successes: options.pass ?? 1 },
		drop: { failures: options.drop ?? 1 },
		...(options.success && { success: options.success })
	};
}

/** The fake's default ladder, today's at 80 bpm: 8 beats, 4, then 2 (direct recall, pass 2). */
const FAKE_LADDER: Ladder = [rung(8), rung(4), rung(2, { pass: 2, success: 'direct-recall' })];

/**
 * A subject of numbered items `0..items-1`, introduced in order, for the specs of the procedure.
 * Its items are numbers.
 */
export function fakeSubject(
	input: {
		items?: number;
		skills?: readonly SkillId[];
		/** The ladder of every skill; default `FAKE_LADDER`. */
		ladder?: Ladder;
		/** Prerequisite: an item not ready is skipped by `nextNew`. */
		ready?: (item: number, cards: readonly CardState[]) => boolean;
		/** What each skill's exercise writes of its items' settings; the defaults otherwise. */
		learning?: Readonly<Record<string, Partial<ItemLearning>>>;
	} = {}
): LearningSubject {
	const items = input.items ?? 12;
	const skills = input.skills ?? [FAKE_SKILL];
	const ladder = input.ladder ?? FAKE_LADDER;
	const recall = directRecallWithin(1500);
	const { ready } = input;

	return {
		owns: (card) => skills.includes(card.skill),
		itemKey: (card) => String(card.item),
		exerciseOf: (skill) => `exercise-${skill}` as ExerciseId,
		nextNew(cards, _history, blocked) {
			for (let item = 0; item < items; item += 1) {
				for (const skill of skills) {
					const ref: CardRef = { skill, item };
					const exists = cards.some((c) => c.skill === skill && c.item === item);
					if (!exists && (ready?.(item, cards) ?? true) && !blocked(ref)) return ref;
				}
			}
			return null;
		},
		ladder: () => ladder,
		itemLearning: (skill) => ({ ...DEFAULT_ITEM_LEARNING, ...input.learning?.[skill] }),
		recall: () => recall,
		confused: (attempt) => (attempt.data as { confused?: boolean } | null)?.confused === true
	};
}

/** A complete, valid attempt for a planned item; `overrides` sets what a spec cares about. */
export function attemptOf(
	planned: Pick<PlannedItem, 'exerciseId' | 'skill' | 'item' | 'phase' | 'temperature'> &
		Partial<Pick<PlannedItem, 'leadBeats'>>,
	overrides: Partial<Attempt> & {
		/** Epoch ms of the prompt (`promptedAt`). */
		at?: number;
		leadMs?: number | null;
		/** The response verdict (`offbeat`, `corrected`, `late`...); default `perfect` or `wrong`. */
		responseVerdict?: ResponseVerdict;
		confused?: boolean;
	} = {}
): Attempt {
	const { at, leadMs: leadMsOverride, responseVerdict, confused, ...fields } = overrides;
	const success =
		fields.success ?? (responseVerdict === undefined || responseVerdict === 'perfect');
	const tempoBpm = fields.tempoBpm === undefined ? FAKE_TEMPO_BPM : fields.tempoBpm;
	const leadBeats = planned.leadBeats ?? null;
	const leadMs =
		leadMsOverride !== undefined
			? leadMsOverride
			: leadBeats !== null && tempoBpm !== null
				? (leadBeats * 60_000) / tempoBpm
				: null;
	const reactionMs = fields.reactionMs !== undefined ? fields.reactionMs : success ? 800 : null;
	const verdict: ResponseVerdict = responseVerdict ?? (success ? 'perfect' : 'wrong');
	const value: ResponseValue = {
		verdict,
		timingOffsetMs: null,
		reactionMs,
		leadMs,
		expectations: []
	};
	return {
		sessionId: 'session',
		exerciseId: planned.exerciseId,
		skill: planned.skill,
		cardKey: cardKey(planned.skill, String(planned.item)) as CardKey,
		phase: planned.phase,
		temperature: planned.temperature,
		aids: [],
		promptedAt: at ?? 0,
		tempoBpm,
		leadBeats,
		timingOffsetMs: null,
		reactionMs,
		correct: verdict !== 'wrong' && verdict !== 'corrected',
		success,
		verdict: { relation: 'response', version: RESPONSE_VERDICT_VERSION, value },
		measures: {},
		plan: null,
		data: { confused: confused ?? false },
		observations: [],
		...fields
	};
}

/**
 * A card of the fake subject. Default: being learned (`introScheduling`); `learnedAt` set gives it
 * a review scheduling (one Easy grade from new). `scheduling` overrides fields of that state.
 */
export function fakeCard(
	item: number,
	overrides: Partial<Omit<CardState, 'scheduling'>> & {
		scheduling?: Partial<SchedulingState>;
		skill?: SkillId;
	} = {}
): CardState {
	const { scheduling, skill = FAKE_SKILL, ...fields } = overrides;
	const learned = fields.learnedAt !== undefined && fields.learnedAt !== null;
	const learnedAt = fields.learnedAt as number;
	const base = learned
		? reviewScheduling(introScheduling(learnedAt), Rating.Easy, learnedAt)
		: introScheduling(0);
	return {
		key: cardKey(skill, String(item)),
		skill,
		item,
		introducedAt: 0,
		introducedInSession: 'session',
		learnedAt: null,
		acquiredAt: null,
		masteredAt: null,
		...fields,
		scheduling: { ...base, ...scheduling }
	};
}
