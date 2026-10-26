import type {
	Attempt,
	CardKey,
	CardState,
	LeadBeats,
	PlannedItem,
	SchedulingState
} from '../../types';
import { graduateToReview, introScheduling } from '../../progress/scheduling';
import { cardKey } from '../../types';
import type { ExerciseId, MechanicId } from '../../exercise/types';
import {
	RESPONSE_VERDICT_VERSION,
	type ResponseValue,
	type ResponseVerdict
} from '../../time/modes/responseVerdict';
import { directRecallOf } from '../recall';
import type { Level } from '../../time/levels';
import { DEFAULT_ITEM_LEARNING, type ItemLearning } from '../params';
import type { CardRef, Ladder, LadderParams, LearningSubject } from '../subject';

const FAKE_MECHANIC = 'fake' as MechanicId;
const FAKE_TEMPO_BPM = 80;

/** A written level of a ladder: `pass` and `drop` 1 unless said otherwise, unaided, any success. */
export function rung(
	leadBeats: LeadBeats | null,
	options: { aided?: boolean; pass?: number; drop?: number; success?: Level['success'] } = {}
): Level<LadderParams> {
	return {
		params: { leadBeats, aided: options.aided ?? false },
		pass: { successes: options.pass ?? 1 },
		drop: { failures: options.drop ?? 1 },
		...(options.success && { success: options.success })
	};
}

/** The fake's default ladder, today's at 80 bpm: 8 beats aided, 4, then 2 (direct recall, pass 2). */
const FAKE_LADDER: Ladder = [
	rung(8, { aided: true }),
	rung(4),
	rung(2, { pass: 2, success: 'direct-recall' })
];

/**
 * A subject of numbered items `0..items-1`, introduced in order, for the specs of the procedure.
 * Its items are numbers; a neighbour is the same item unless `neighbours` says otherwise.
 */
export function fakeSubject(
	input: {
		items?: number;
		mechanics?: readonly MechanicId[];
		neighbours?: (a: number, b: number) => boolean;
		/** The ladder of every mechanic; default `FAKE_LADDER`. */
		ladder?: Ladder;
		/** Prerequisite: an item not ready is skipped by `nextNew`. */
		ready?: (item: number, cards: readonly CardState[]) => boolean;
		prefers?: (candidate: number, previous: number) => boolean;
		/** Default true: the aided presentation follows its missed probe at once. */
		presentsAtOnce?: boolean;
		/** What each mechanic's exercise writes of its items' settings; the defaults otherwise. */
		learning?: Readonly<Record<string, Partial<ItemLearning>>>;
	} = {}
): LearningSubject {
	const items = input.items ?? 12;
	const mechanics = input.mechanics ?? [FAKE_MECHANIC];
	const neighbours = input.neighbours ?? ((a: number, b: number) => a === b);
	const ladder = input.ladder ?? FAKE_LADDER;
	const recall = directRecallOf(1500);
	const { ready, prefers } = input;

	return {
		owns: (card) => mechanics.includes(card.mechanic),
		itemKey: (card) => String(card.item),
		exerciseOf: (mechanic) => `exercise-${mechanic}` as ExerciseId,
		nextNew(cards, _history, blocked) {
			for (let item = 0; item < items; item += 1) {
				for (const mechanic of mechanics) {
					const ref: CardRef = { mechanic, item };
					const exists = cards.some((c) => c.mechanic === mechanic && c.item === item);
					if (!exists && (ready?.(item, cards) ?? true) && !blocked(ref)) return ref;
				}
			}
			return null;
		},
		presentsAtOnce: input.presentsAtOnce ?? true,
		neighbours: (a, b) => neighbours(a.item as number, b.item as number),
		ladder: () => ladder,
		itemLearning: (mechanic) => ({ ...DEFAULT_ITEM_LEARNING, ...input.learning?.[mechanic] }),
		recall: () => recall,
		confused: (attempt) => (attempt.data as { confused?: boolean } | null)?.confused === true,
		fadingAid: (mechanic) => mechanic === FAKE_MECHANIC,
		...(prefers && {
			prefers: (candidate: CardRef, previous: CardRef) =>
				prefers(candidate.item as number, previous.item as number)
		})
	};
}

/** A complete, valid attempt for a planned item; `overrides` sets what a spec cares about. */
export function attemptOf(
	planned: Pick<PlannedItem, 'exerciseId' | 'mechanic' | 'item' | 'phase' | 'temperature'> &
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
		mechanic: planned.mechanic,
		cardKey: cardKey(planned.mechanic, String(planned.item)) as CardKey,
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
 * a review scheduling (`graduateToReview`). `scheduling` overrides fields of that state.
 */
export function fakeCard(
	item: number,
	overrides: Partial<Omit<CardState, 'scheduling'>> & {
		scheduling?: Partial<SchedulingState>;
		mechanic?: MechanicId;
	} = {}
): CardState {
	const { scheduling, mechanic = FAKE_MECHANIC, ...fields } = overrides;
	const learned = fields.learnedAt !== undefined && fields.learnedAt !== null;
	const base = learned ? graduateToReview(fields.learnedAt as number) : introScheduling(0);
	return {
		key: cardKey(mechanic, String(item)),
		mechanic,
		item,
		introducedAt: 0,
		introducedInSession: 'session',
		leadBeats: 2,
		learnedAt: null,
		acquiredAt: null,
		masteredAt: null,
		...fields,
		scheduling: { ...base, ...scheduling }
	};
}
