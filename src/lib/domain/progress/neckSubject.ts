import { pacingOf } from '$lib/domain/exercise/pacing';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import type { ExerciseDefinition, ExerciseId, MechanicId } from '$lib/domain/exercise/types';
import { aidLadder, leadLadder } from '$lib/domain/learning/ladder';
import { directRecallOf, type DirectRecall } from '$lib/domain/learning/recall';
import type { CardRef, LearningSubject } from '$lib/domain/learning/subject';
import type { IdentifyData, LocateData } from '$lib/domain/mechanics';
import {
	asNeckCard,
	identifyItemKey,
	isMirrorPair,
	locateItemKey,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import { nextNewCard } from './introduction';
import { isNeck } from './neck';

/** Throws on a mechanic outside the neck. */
function neckMechanic(mechanic: MechanicId): NeckCard['mechanic'] {
	if (mechanic === 'locate' || mechanic === 'identify') return mechanic;
	throw new Error(`Not a neck mechanic: ${mechanic}`);
}

/** The exercise's recall threshold; the neck's exercises must declare one. */
function thresholdOf(definition: ExerciseDefinition, name: NeckCard['mechanic']): number {
	const threshold = recallThresholdOf(definition);
	if (threshold === null) throw new Error(`the ${name} exercise must declare its recall threshold`);
	return threshold;
}

function itemKeyOf(card: NeckCard): string {
	return card.mechanic === 'locate' ? locateItemKey(card.item) : identifyItemKey(card.item);
}

/**
 * The neck's notes as a subject of the learning procedure: locate and identify, introduced in the
 * neck's order (`priority`, the triads' notes, first), a note never right after itself nor its
 * mirror, another string preferred. Locate climbs its leads, identify drops the name shown; each
 * judges direct recall by the threshold its exercise declares.
 */
export function neckSubject(input: {
	definitions: { locate: ExerciseDefinition; identify: ExerciseDefinition };
	priority?: readonly LocateItem[];
}): LearningSubject {
	const { definitions } = input;
	const priority = input.priority ?? [];
	const locateThresholdMs = thresholdOf(definitions.locate, 'locate');
	const recalls: Record<NeckCard['mechanic'], DirectRecall> = {
		locate: directRecallOf(locateThresholdMs),
		identify: directRecallOf(thresholdOf(definitions.identify, 'identify'))
	};
	const locatePacing = pacingOf(definitions.locate);
	const identifyPacing = pacingOf(definitions.identify);

	return {
		owns: isNeck,
		itemKey: (card) => itemKeyOf(asNeckCard(card)),
		exerciseOf: (mechanic): ExerciseId => definitions[neckMechanic(mechanic)].id,
		nextNew(cards, _history, blocked) {
			const next = nextNewCard(cards.filter(isNeck), priority);
			if (next === null || blocked(next)) return null;
			return next;
		},
		presentsAtOnce: true,
		neighbours(a: CardRef, b: CardRef) {
			const x = asNeckCard(a);
			const y = asNeckCard(b);
			return (x.mechanic === y.mechanic && itemKeyOf(x) === itemKeyOf(y)) || isMirrorPair(x, y);
		},
		prefers: (candidate, previous) =>
			asNeckCard(candidate).item.string !== asNeckCard(previous).item.string,
		ladder: (mechanic, tempoBpm) =>
			neckMechanic(mechanic) === 'locate'
				? leadLadder({
						steps: locatePacing.leadSteps,
						tempoBpm,
						recallThresholdMs: locateThresholdMs,
						learnedAfter: locatePacing.learnedAfter
					})
				: aidLadder(identifyPacing.learnedAfter),
		recall: (mechanic) => recalls[neckMechanic(mechanic)],
		confused: (attempt) => {
			const data = attempt.data as LocateData | IdentifyData | null;
			return data !== null && data.confusion !== null;
		},
		fadingAid: (mechanic) => mechanic === 'locate'
	};
}
