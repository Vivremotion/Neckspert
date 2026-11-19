import { compilePassageRound } from '$lib/domain/exercise/passage/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { familyNamed, passageDerivation, type Member } from '$lib/domain/families';
import { MEMBER_CONTENT, admittedMembers, type MemberContent } from '$lib/domain/judges';
import { itemSet } from '$lib/domain/sets';
import { Fraction, METER_4_4, type ResponseValue, type RoundPlan } from '$lib/domain/time';
import type { ChordDiagramStyle, Locale, PlannedItem, PlannedPassage } from '$lib/domain/types';
import type { StagePlace } from '$lib/application/sets/types';
import type { LaneEntry } from '$lib/application/session/contract';
import { membersPicture, roundMemberFields } from './contentViews';
import { CONTENT_PICTURES, type Picture } from './pictures';
import { isAided, presentPrompt, type PresentedPrompt } from './presentPrompt';
import { stageVerdict, type StageVerdict } from './promptStage';

/** A round of the passage on its line. */
export interface PassageRound {
	/** Beats from the passage's start. */
	at: number;
	length: number;
	/** The prompt's slot `target`, said for this round's item, else its `primary`. */
	label: string;
	/** From the round before to this one, on the `position` attribute of the family; null on the first and without position. */
	way: 'up' | 'down' | 'same' | null;
}

/** The screen model of a round of a passage, read by the views that draw a passage. */
export interface PassageStageModel {
	prompt: PresentedPrompt;
	rounds: readonly PassageRound[];
	/** The round on show: its rank in the passage. */
	index: number;
	beatsPerBar: number;
	anchorBeat: number | null;
	history: readonly LaneEntry[];
	/** The aid's picture, at an aided level; null otherwise. */
	aid: Picture | null;
	verdict: StageVerdict | null;
	chordDiagram: ChordDiagramStyle;
}

type Way = PassageRound['way'];

/** Where each round of a passage lies, and the way to it: what does not change while it plays. */
interface Line {
	definition: ExerciseDefinition;
	exerciseLevel: number;
	places: { at: number; length: number; way: Way }[];
	/**
	 * Each round's `target`, by the language and the content fields it was said with: said once
	 * per passage, so a note spelled at random keeps its spelling along the line.
	 */
	labels: Map<string, string[]>;
}

/**
 * The line of each passage, by the list of its items (one list per passage, the same for each of
 * its rounds as its source serves them): computed once per passage, forgotten with it.
 */
const LINES = new WeakMap<readonly unknown[], Line>();

/** The way from a position to the next. */
function wayBetween(before: number | null, after: number | null): Way {
	if (before === null || after === null) return null;
	return after > before ? 'up' : after < before ? 'down' : 'same';
}

/** The `position` of the member each item of the passage is; null without one. */
function positionsOf(definition: ExerciseDefinition, items: readonly unknown[]): (number | null)[] {
	const id = definition.passages?.members.family;
	const family = id === undefined ? null : familyNamed(id);
	const derivation = id === undefined ? null : passageDerivation(id);
	const position = family?.attributes.position;
	if (!family || !derivation || !position) return items.map(() => null);
	const set = itemSet(derivation.set);
	return items.map((item) => {
		const member = family.member(set.itemKey(item));
		const read = member === null ? null : position(member);
		return typeof read === 'number' ? read : null;
	});
}

/** The round of `rank` in the passage of `item`, `previous` heard before it. */
function roundAt(
	item: PlannedItem & { passage: PlannedPassage },
	items: readonly unknown[],
	rank: number,
	previous: string | null
): PlannedItem {
	return { ...item, item: items[rank], passage: { ...item.passage, rank, previous } };
}

/**
 * The places of the rounds of a passage: each as long as its round template makes it for its
 * item (its round compiled), one after the other; and the way from each to the next.
 */
function lineOf(
	definition: ExerciseDefinition,
	item: PlannedItem & { passage: PlannedPassage },
	items: readonly unknown[]
): Line {
	const kept = LINES.get(items);
	if (kept && kept.definition === definition && kept.exerciseLevel === item.exerciseLevel) {
		return kept;
	}
	const unit = (definition.meter ?? METER_4_4).unit;
	const cache = new Map<string, unknown>();
	const positions = positionsOf(definition, items);
	// Summed exactly, read as numbers at the end: a round never drifts off its beat.
	let at = Fraction.ZERO;
	const places = items.map((_, rank) => {
		const plan = compilePassageRound(definition, roundAt(item, items, rank, null), cache);
		const length = plan.length.div(unit);
		const place = {
			at: at.toNumber(),
			length: length.toNumber(),
			way: rank === 0 ? null : wayBetween(positions[rank - 1], positions[rank])
		};
		at = at.add(length);
		return place;
	});
	const line = { definition, exerciseLevel: item.exerciseLevel, places, labels: new Map() };
	LINES.set(items, line);
	return line;
}

/**
 * Each round's words on the line, said for its item with the content fields of the round on show:
 * its `target`, else its `primary`.
 */
function labelsOf(
	line: Line,
	item: PlannedItem,
	items: readonly unknown[],
	locale: Locale,
	random: () => number,
	contentFields: Readonly<Record<string, string>>
): string[] {
	const key = JSON.stringify([locale, contentFields]);
	let labels = line.labels.get(key);
	if (!labels) {
		const plain: PlannedItem = { ...item, aid: 'none', stringAid: false, exerciseLevel: 0 };
		labels = items.map((each) => {
			const said = presentPrompt(
				line.definition,
				{ ...plain, item: each },
				locale,
				random,
				contentFields
			);
			return said.target ?? said.primary;
		});
		line.labels.set(key, labels);
	}
	return labels;
}

/** The first member content of a plan, with the index of its expectation; null without one. */
function memberContentOf(plan: RoundPlan): { index: number; value: MemberContent } | null {
	const index = plan.expectations.findIndex(({ content }) => content?.kind === MEMBER_CONTENT);
	return index < 0
		? null
		: { index, value: plan.expectations[index].content!.value as MemberContent };
}

/** The member the answer to expectation `index` names, by its identity; null when none. */
function heardMember(
	family: string,
	settled: { value: ResponseValue } | null,
	index: number
): string | null {
	const result = settled?.value.expectations.find((each) => each.index === index);
	if (result?.answer == null) return null;
	return familyNamed(family)?.named(result.answer)?.id ?? null;
}

/**
 * The members admitted now and at the next round of the passage, drawn by their family's view:
 * the next compiled with the member the answer named once settled, else the round's own previous.
 */
function admittedPicture(
	definition: ExerciseDefinition,
	item: PlannedItem & { passage: PlannedPassage },
	items: readonly unknown[],
	plan: RoundPlan,
	settled: { value: ResponseValue } | null
): Picture | null {
	const content = memberContentOf(plan);
	if (content === null) return null;
	const { family } = content.value;
	const now = admittedMembers(content.value);
	const rank = item.passage.rank;
	let next: Member[] = [];
	if (rank + 1 < items.length) {
		const previous = heardMember(family, settled, content.index) ?? item.passage.previous;
		const coming = memberContentOf(
			compilePassageRound(definition, roundAt(item, items, rank + 1, previous))
		);
		next = coming === null ? [] : admittedMembers(coming.value);
	}
	return membersPicture(content.value, now, next);
}

/**
 * The screen model of a round of a passage, from its exercise's presentation and its round's plan:
 * the prompt of the round on show (the fields of its member contents among them), the line of the
 * passage (each round's place, its `target` said for its item, the way to it), and, at an aided
 * level (an aid level of the exercise, or the item served aided), the aid the presentation writes:
 * `presentPrompt` makes a line or an item's picture, the members admitted now and next are drawn
 * here. `random` spells a note: give every call for one item the same value.
 */
export function passageStage(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	plan: RoundPlan;
	settled: { value: ResponseValue; success: boolean } | null;
	place: StagePlace;
	beatsPerBar: number;
	chordDiagram: ChordDiagramStyle;
	locale: Locale;
	random: () => number;
}): PassageStageModel {
	const { definition, item, plan, settled, place, locale, random } = input;
	const passage = item.passage;
	// A source serves every round of a passage with its items: without them there is no line.
	if (!passage?.items || passage.items.length === 0) {
		throw new Error(`${definition.id}: a round of a passage came without the items of its passage`);
	}
	const items = passage.items;
	const round = item as PlannedItem & { passage: PlannedPassage };
	const members = plan.expectations.flatMap(({ content }) =>
		content?.kind === MEMBER_CONTENT ? [content.value] : []
	);
	const contentFields = roundMemberFields(members, locale);
	const aided = isAided(item);
	const picture = definition.presentation?.aided?.picture;
	const line = lineOf(definition, round, items);
	const labels = labelsOf(line, item, items, locale, random, contentFields);
	return {
		prompt: presentPrompt(definition, item, locale, random, contentFields),
		rounds: line.places.map((placed, rank) => ({
			at: placed.at,
			length: placed.length,
			label: labels[rank],
			way: placed.way
		})),
		index: passage.rank,
		beatsPerBar: input.beatsPerBar,
		anchorBeat: place.anchorBeat,
		history: place.history,
		aid:
			aided && picture !== undefined && CONTENT_PICTURES.includes(picture)
				? admittedPicture(definition, round, items, plan, settled)
				: null,
		verdict: settled && stageVerdict(plan, settled, locale, random),
		chordDiagram: input.chordDiagram
	};
}
