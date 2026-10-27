import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { ResponseValue, RoundPlan } from '$lib/domain/time';
import type { ChordDiagramStyle, Locale, PlannedItem, ResponseVerdict } from '$lib/domain/types';
import type { StagePlace } from '$lib/application/mechanics/types';
import type { AnswerChoice, LaneEntry } from '$lib/application/session/contract';
import { CONTENT_VIEWS, type ContentView, type MissView } from './contentViews';
import { presentPrompt, type PresentedPrompt } from './presentPrompt';

/** What a settled round tells. */
export interface StageVerdict {
	verdict: ResponseVerdict;
	offsetMs: number | null;
	/** Each answer heard, in the order of the expectations, joined by « · »; null: none. */
	answerLabel: string | null;
	/** One per expectation the round missed, in order; empty on a success. */
	misses: MissView[];
}

/** The screen model of a prompt of any response exercise that writes its presentation. */
export interface PromptStageModel {
	prompt: PresentedPrompt;
	anchorBeat: number | null;
	promptBeat: number | null;
	history: readonly LaneEntry[];
	/** The extended expectations, in lane beats. */
	bands: readonly { fromBeat: number; untilBeat: number }[];
	beatsPerBar: number;
	verdict: StageVerdict | null;
	chordDiagram: ChordDiagramStyle;
	/** The answer keys of a screen mechanic (`presenter.answerChoices`); empty otherwise. */
	choices: readonly AnswerChoice[];
}

/** Between the answers of a round's expectations. */
const ANSWER_SEPARATOR = ' · ';

const NOTHING_TOLD: MissView = { correction: null, heard: null, expected: null, gap: null };

/** The view of a content kind, none for a kind no view covers. */
function viewOf(kind: string): ContentView | null {
	return Object.hasOwn(CONTENT_VIEWS, kind) ? CONTENT_VIEWS[kind] : null;
}

/** What a settled round tells: each answer by its content, and each expectation it missed. */
function stageVerdict(
	plan: RoundPlan,
	settled: { value: ResponseValue; success: boolean },
	locale: Locale,
	random: () => number
): StageVerdict {
	const { value, success } = settled;
	const results = [...value.expectations].sort((a, b) => a.index - b.index);
	const contentOf = (index: number) => plan.expectations[index]?.content ?? null;
	const labels = results.flatMap((result) => {
		const content = contentOf(result.index);
		if (result.answer == null || content === null) return [];
		const label = viewOf(content.kind)?.answerLabel(content.value, result.answer, locale, random);
		return label == null ? [] : [label];
	});
	// A missed expectation: not right, or right only after a wrong first answer (`corrected`).
	const missed = success
		? []
		: results.filter((result) => result.correct !== true || result.confusion != null);
	return {
		verdict: value.verdict,
		offsetMs: value.timingOffsetMs,
		answerLabel: labels.length === 0 ? null : labels.join(ANSWER_SEPARATOR),
		misses: missed.map((result) => {
			const content = contentOf(result.index);
			const view = content && viewOf(content.kind);
			return content && view
				? view.miss(
						content.value,
						{ answer: result.answer, confusion: result.confusion },
						locale,
						random
					)
				: NOTHING_TOLD;
		})
	};
}

/**
 * The screen model of `item`'s prompt, from its exercise's presentation and its round's plan:
 * before its round (`settled` null) and once settled. `place` tells where it stands on the lane;
 * `random` spells a note: give every call for one item the same value.
 */
export function promptStage(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	plan: RoundPlan;
	settled: { value: ResponseValue; success: boolean } | null;
	place: StagePlace;
	beatsPerBar: number;
	chordDiagram: ChordDiagramStyle;
	choices: readonly AnswerChoice[];
	locale: Locale;
	random: () => number;
}): PromptStageModel {
	const { definition, item, plan, settled, place, locale, random } = input;
	return {
		prompt: presentPrompt(definition, item, locale, random),
		anchorBeat: place.anchorBeat,
		promptBeat: place.promptBeat,
		history: place.history,
		bands: place.bands,
		beatsPerBar: input.beatsPerBar,
		verdict: settled && stageVerdict(plan, settled, locale, random),
		chordDiagram: input.chordDiagram,
		choices: input.choices
	};
}
