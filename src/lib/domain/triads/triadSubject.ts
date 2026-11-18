import { ladderOf } from '$lib/domain/exercise/ladder';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { CHORD_ANCHOR_SKILL_ID, CHORD_ZONE_SKILL_ID } from '$lib/domain/exercise/catalogIds';
import type { ExerciseDefinition, ExerciseId } from '$lib/domain/exercise/types';
import { mechanicOfSkill } from '$lib/domain/skill/bridge';
import type { SkillId } from '$lib/domain/skill/types';
import {
	directRecallOf,
	itemLearningOf,
	type CardRef,
	type DirectRecall,
	type LearningSubject
} from '$lib/domain/learning';
import type { TriadZoneItem } from '$lib/domain/mechanics';
import { parseVoicingKey, voicingKey, voicingOccurrences } from '$lib/domain/music';
import { isAcquired } from '$lib/domain/progress/cards';
import { cardKey, type Attempt } from '$lib/domain/types';
import { triadIntroductionOrder } from './introduction';
import { triadParams } from './items';
import { cueFrets, occurrencePosition } from './position';

export type TriadSkill = typeof CHORD_ANCHOR_SKILL_ID | typeof CHORD_ZONE_SKILL_ID;

const ANCHOR = CHORD_ANCHOR_SKILL_ID;
const ZONE = CHORD_ZONE_SKILL_ID;

type Position = number | 'open';

/** Throws on a skill outside the triads. */
function triadSkill(skill: SkillId): TriadSkill {
	if (skill === ANCHOR || skill === ZONE) return skill;
	throw new Error(`Not a triad skill: ${skill}`);
}

function voicingOf(card: CardRef): string {
	return (card.item as { voicingKey: string }).voicingKey;
}

function draw<T>(candidates: readonly T[], random: () => number): T | null {
	if (candidates.length === 0) return null;
	return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/** The exercise's recall threshold; the triads must declare one. */
function thresholdOf(definition: ExerciseDefinition): number {
	const threshold = recallThresholdOf(definition);
	if (threshold === null) {
		throw new Error(`the ${definition.id} exercise must declare its recall threshold`);
	}
	return threshold;
}

/**
 * The triads as a subject of the learning procedure, for one session's exercise: the anchor
 * introduces its queue's head (the acquired notes' triads first), the zone a triad acquired in
 * anchor (read from the whole store's anchor cards and history). The chord just asked still rings:
 * the same voicing is never asked next. Both climb the ladder their exercise writes; a zone prompt asks a
 * shape other than the last one asked of its card, and a fret it covers. One instance per session:
 * it keeps each zone card's last position, read from `attempts` and updated as prompts are drawn.
 */
export function triadSubject(input: {
	skill: TriadSkill;
	definitions: { anchor: ExerciseDefinition; zone: ExerciseDefinition };
	/** Locate positions (`string:pitch`) already acquired: their triads come first. */
	acquiredPositions: ReadonlySet<string>;
	/** Stored attempts: the last position asked of each zone card. */
	attempts: readonly Attempt[];
}): LearningSubject {
	const { skill, definitions } = input;
	const definitionOf: Record<TriadSkill, ExerciseDefinition> = {
		[ANCHOR]: definitions.anchor,
		[ZONE]: definitions.zone
	};
	const recalls: Record<TriadSkill, DirectRecall> = {
		[ANCHOR]: directRecallOf(thresholdOf(definitions.anchor)),
		[ZONE]: directRecallOf(thresholdOf(definitions.zone))
	};
	const ladders = {
		[ANCHOR]: ladderOf(definitions.anchor, mechanicOfSkill(ANCHOR)),
		[ZONE]: ladderOf(definitions.zone, mechanicOfSkill(ZONE))
	};
	const order = triadIntroductionOrder(
		triadParams(definitions.anchor),
		input.acquiredPositions
	).map(voicingKey);

	const lastPosition = new Map<string, Position>();
	const zoneAttempts = input.attempts
		.filter((attempt) => attempt.skill === ZONE)
		.sort((a, b) => a.promptedAt - b.promptedAt);
	for (const attempt of zoneAttempts) {
		const data = attempt.data as { item?: { voicingKey?: string; position?: Position } } | null;
		const voicing = data?.item?.voicingKey;
		const position = data?.item?.position;
		if (voicing !== undefined && position !== undefined) lastPosition.set(voicing, position);
	}

	/** A shape of the voicing other than the last one asked, and a fret it covers. */
	function zoneItem(voicing: string, random: () => number): TriadZoneItem {
		const shapes = voicingOccurrences(parseVoicingKey(voicing));
		const positions = shapes.map(occurrencePosition);
		const last = lastPosition.get(voicing);
		const others = positions.filter((position) => position !== last);
		const position = draw(others.length > 0 ? others : positions, random) ?? positions[0];
		lastPosition.set(voicing, position);
		const shape = shapes.find((occurrence) => occurrencePosition(occurrence) === position);
		const fret = shape ? draw(cueFrets(shape), random) : null;
		return fret === null
			? { voicingKey: voicing, position }
			: { voicingKey: voicing, position, fret };
	}

	return {
		owns: (card) => card.skill === skill,
		itemKey: voicingOf,
		exerciseOf: (of): ExerciseId => definitionOf[triadSkill(of)].id,
		nextNew(cards, history, blocked) {
			const has = (of: TriadSkill, voicing: string) =>
				cards.some((card) => card.skill === of && voicingOf(card) === voicing);
			for (const voicing of order) {
				const ref: CardRef = { skill, item: { voicingKey: voicing } };
				if (has(skill, voicing) || blocked(ref)) continue;
				if (skill === ANCHOR) return ref;
				const anchor = cards.find((card) => card.skill === ANCHOR && voicingOf(card) === voicing);
				const anchorHistory = history.get(cardKey(ANCHOR, voicing)) ?? [];
				if (anchor && isAcquired(anchor, anchorHistory, recalls[ANCHOR])) return ref;
			}
			return null;
		},
		// The chord just asked still rings: its presentation waits a prompt.
		presentsAtOnce: false,
		neighbours: (a, b) => voicingOf(a) === voicingOf(b),
		ladder: (of) => ladders[triadSkill(of)],
		itemLearning: (of) => itemLearningOf(definitionOf[triadSkill(of)]),
		recall: (of) => recalls[triadSkill(of)],
		confused: (attempt) => {
			const data = attempt.data as { confusion?: unknown } | null;
			return data?.confusion != null;
		},
		fadingAid: () => false,
		...(skill === ZONE && {
			promptItem: (card: CardRef, random: () => number) => zoneItem(voicingOf(card), random)
		})
	};
}
