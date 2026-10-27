import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { RhythmItem } from '$lib/domain/mechanics';
import type { ResponseValue, RoundOutcome, RoundPlan } from '$lib/domain/time';
import type { ChordDiagramStyle, Locale, PlannedItem } from '$lib/domain/types';
import type { MechanicPresenter, StagePlace } from '$lib/application/mechanics/types';
import { promptStage } from '$lib/application/presentation/promptStage';
import { cycleStage, type CycleMoment } from '../cycle/rhythmStage';
import { playsCycles } from './compilePlan';

/** Where the series stands at a beat: what it plays, the bar of the round played and the beat. */
export interface SeriesMoment {
	phase: CycleMoment;
	/** The bar of the round from its start, whole; negative before it in its run. */
	barInRound: number;
	beat: number;
	/** Whole bars from the run's first bar to the round's start; null when not known. */
	fromRunStart: number | null;
}

/**
 * The screen model follows the beat: the series shows it again on every beat, not only at a
 * round's opening and settlement (a cycle's cursor, its muted bars).
 */
export function followsBeats(definition: ExerciseDefinition): boolean {
	return playsCycles(definition);
}

/**
 * The stage dispatch: the screen model of `item` in the view its exercise names. A cycle's is
 * built from the series' events (`cycleStage`); an exercise that writes its presentation shares
 * `promptStage`; any other takes its presenter's own (`stageOf`). Undefined when none draws it.
 */
export function stageModel(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	presenter: MechanicPresenter;
	plan: RoundPlan;
	settled: { value: ResponseValue; success: boolean } | null;
	place: StagePlace;
	beatsPerBar: number;
	chordDiagram: ChordDiagramStyle;
	locale: Locale;
	random: () => number;
	moment: SeriesMoment;
	/** The rounds of the run settled so far, oldest first. */
	runOutcomes: readonly RoundOutcome[];
	/** Sessions of the exercise ended before this series. */
	endedSessions: number;
}): unknown {
	const { definition, item, presenter, plan, settled, place, locale, random, moment } = input;
	if (playsCycles(definition)) {
		return cycleStage({
			definition,
			item: item as PlannedItem<RhythmItem>,
			moment: moment.phase,
			barInRound: moment.barInRound,
			beat: moment.beat,
			startBar: moment.fromRunStart ?? 0,
			mutedBars: plan.mutedBars,
			settled: input.runOutcomes,
			locale,
			endedSessions: input.endedSessions
		});
	}
	if (definition.presentation) {
		return promptStage({
			definition,
			item,
			plan,
			settled,
			place,
			beatsPerBar: input.beatsPerBar,
			chordDiagram: input.chordDiagram,
			choices: presenter.answerChoices?.() ?? [],
			locale,
			random
		});
	}
	return presenter.stageOf?.(
		item.item,
		settled,
		locale,
		{ aid: item.aid, stringAid: item.stringAid ?? false },
		place,
		{ chordDiagram: input.chordDiagram },
		random
	)?.model;
}
