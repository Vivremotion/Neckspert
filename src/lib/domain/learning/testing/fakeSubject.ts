import type { Attempt, CardKey, CardState, LeadBeats, PlannedItem } from '../../types';
import { cardKey } from '../../types';
import type { ExerciseId, MechanicId } from '../../exercise/types';
import { RESPONSE_VERDICT_VERSION, type ResponseValue } from '../../time/modes/responseVerdict';
import { leadLadder } from '../ladder';
import { directRecallOf } from '../recall';
import type { CardRef, LearningSubject } from '../subject';

const FAKE_MECHANIC = 'fake' as MechanicId;
const FAKE_TEMPO_BPM = 80;

/**
 * A subject of numbered items `0..items-1`, introduced in order, for the specs of the procedure.
 * Its items are numbers; a neighbour is the same item unless `neighbours` says otherwise.
 */
export function fakeSubject(
	input: {
		items?: number;
		mechanics?: readonly MechanicId[];
		neighbours?: (a: number, b: number) => boolean;
		ladderSteps?: readonly LeadBeats[];
		learnedAfter?: number;
	} = {}
): LearningSubject {
	const items = input.items ?? 12;
	const mechanics = input.mechanics ?? [FAKE_MECHANIC];
	const neighbours = input.neighbours ?? ((a: number, b: number) => a === b);
	const steps = input.ladderSteps ?? [8, 4, 2];
	const learnedAfter = input.learnedAfter ?? 2;
	const recall = directRecallOf(1500);

	return {
		owns: (card) => mechanics.includes(card.mechanic),
		itemKey: (card) => String(card.item),
		exerciseOf: (mechanic) => `exercise-${mechanic}` as ExerciseId,
		nextNew(cards, _history, blocked) {
			for (let item = 0; item < items; item += 1) {
				for (const mechanic of mechanics) {
					const ref: CardRef = { mechanic, item };
					const exists = cards.some((c) => c.mechanic === mechanic && c.item === item);
					if (!exists && !blocked(ref)) return ref;
				}
			}
			return null;
		},
		neighbours: (a, b) => neighbours(a.item as number, b.item as number),
		ladder: (_mechanic, tempoBpm) =>
			leadLadder({ steps, tempoBpm, recallThresholdMs: 1500, learnedAfter }),
		recall: () => recall,
		confused: (attempt) => (attempt.data as { confused?: boolean } | null)?.confused === true,
		fadingAid: (mechanic) => mechanic === FAKE_MECHANIC
	};
}

/** A complete, valid attempt for a planned item; `overrides` sets what a spec cares about. */
export function attemptOf(
	planned: Pick<PlannedItem, 'exerciseId' | 'mechanic' | 'item' | 'phase' | 'temperature'> &
		Partial<Pick<PlannedItem, 'leadBeats'>>,
	overrides: {
		success?: boolean;
		/** Epoch ms of the prompt. */
		at?: number;
		sessionId?: string;
		tempoBpm?: number | null;
		leadMs?: number | null;
		reactionMs?: number | null;
		confused?: boolean;
	} = {}
): Attempt {
	const success = overrides.success ?? true;
	const tempoBpm = overrides.tempoBpm === undefined ? FAKE_TEMPO_BPM : overrides.tempoBpm;
	const leadBeats = planned.leadBeats ?? null;
	const leadMs =
		overrides.leadMs !== undefined
			? overrides.leadMs
			: leadBeats !== null && tempoBpm !== null
				? (leadBeats * 60_000) / tempoBpm
				: null;
	const reactionMs =
		overrides.reactionMs !== undefined ? overrides.reactionMs : success ? 800 : null;
	const value: ResponseValue = {
		verdict: success ? 'perfect' : 'wrong',
		timingOffsetMs: null,
		reactionMs,
		leadMs,
		expectations: []
	};
	return {
		sessionId: overrides.sessionId ?? 'session',
		exerciseId: planned.exerciseId,
		mechanic: planned.mechanic,
		cardKey: cardKey(planned.mechanic, String(planned.item)) as CardKey,
		phase: planned.phase,
		temperature: planned.temperature,
		aids: [],
		promptedAt: overrides.at ?? 0,
		tempoBpm,
		leadBeats: leadBeats,
		timingOffsetMs: null,
		reactionMs,
		correct: success,
		success,
		verdict: { relation: 'response', version: RESPONSE_VERDICT_VERSION, value },
		measures: {},
		plan: null,
		data: { confused: overrides.confused ?? false },
		observations: []
	};
}

/** A card of the fake subject, for specs that hand the procedure a store. */
export function fakeCard(item: number, mechanic: MechanicId = FAKE_MECHANIC): CardState {
	return {
		key: cardKey(mechanic, String(item)),
		mechanic,
		item,
		introducedAt: 0,
		introducedInSession: 'session',
		leadBeats: 2,
		scheduling: {} as CardState['scheduling'],
		learnedAt: null,
		acquiredAt: null,
		masteredAt: null
	};
}
