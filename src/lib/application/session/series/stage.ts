import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { LiveReading, ResponseValue, RoundPlan } from '$lib/domain/time';
import type { ChordDiagramStyle, Locale, PlannedItem } from '$lib/domain/types';
import type { MechanicPresenter, StagePlace } from '$lib/application/mechanics/types';
import { FIGURE_VIEW } from '$lib/application/presentation/playViews';
import { promptStage } from '$lib/application/presentation/promptStage';
import { playViewOf } from '../contract';
import { figureStage, type CycleMoment, type SettledRound } from './figureStage';

/** Where the series stands at a beat: what it plays, the bar of the round played and the beat. */
export interface SeriesMoment {
	phase: CycleMoment;
	/** The bar of the round from its start, whole; negative before it in its run. */
	barInRound: number;
	beat: number;
	/** Whole bars from the run's first bar to the round's start; null when not known. */
	fromRunStart: number | null;
	/** The click is silent in this bar: one of the round's muted bars. */
	muted: boolean;
}

/** The exercise is drawn by the figure view: its screen is its round's figure (`figureStage`). */
function showsFigure(definition: ExerciseDefinition): boolean {
	return playViewOf(definition) === FIGURE_VIEW;
}

/**
 * The screen model follows the beat: the series shows it again on every beat, not only at a
 * round's opening and settlement (a figure's cursor, its muted bars).
 */
export function followsBeats(definition: ExerciseDefinition): boolean {
	return showsFigure(definition);
}

/**
 * The stage dispatch: the screen model of `item` in the view its exercise names. An exercise
 * drawn by the figure view has its model built from the series' events (`figureStage`, its
 * prompt above the figure when it writes a presentation); any other that writes its presentation
 * shares `promptStage`; any other takes its presenter's own (`stageOf`). Undefined when none
 * draws it.
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
	runRounds: readonly SettledRound[];
	/** Sessions of the exercise ended before this series. */
	endedSessions: number;
	/** The run's last round and its plan, shown at the breath with its marks; null when none was played. */
	played: { item: PlannedItem; plan: RoundPlan; startBar?: number } | null;
	/** What the round under way can already tell, when its level asks for it. */
	live: LiveReading | null;
}): unknown {
	const { definition, item, presenter, plan, settled, place, locale, random, moment } = input;
	if (showsFigure(definition)) {
		return figureStage({
			definition,
			item,
			plan,
			moment: moment.phase,
			barInRound: moment.barInRound,
			beat: moment.beat,
			startBar: moment.fromRunStart ?? 0,
			muted: moment.muted,
			settled: input.runRounds,
			played: input.played,
			locale,
			random,
			chordDiagram: input.chordDiagram,
			endedSessions: input.endedSessions,
			live: input.live
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
