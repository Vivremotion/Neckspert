import type { MechanicRules } from '$lib/domain/mechanics';
import type {
	AidLevel,
	ChordDiagramStyle,
	Locale,
	PlannedItem,
	ResponseVerdict
} from '$lib/domain/types';
import type { ResponseValue } from '$lib/domain/time';
import type { Scene } from '$lib/domain/exercise/types';
import type {
	AnswerChoice,
	LaneEntry,
	PromptView,
	ShapeView
} from '$lib/application/session/contract';

// The scene lives in the domain (an exercise names it); re-exported for the screens.
export type { Scene };

/** Whether the click is heard on a scene: on the guitar, not while the player taps the screen. */
export const SCENE_CLICKS: Readonly<Record<Scene, boolean>> = { guitar: true, screen: false };

/** Names an observation source of the session: 'note' and 'chord' (played), 'tap' (on screen). */
export type SensorKind = string;

/** Where a prompt's view places it: the beats of its prompt and target, and the rounds played before it. */
export interface StagePlace {
	/** The beat of the target, in the tempo map's beats from the series' start; null before. */
	anchorBeat: number | null;
	/** The beat of the prompt, in the same beats; null while the item is not placed yet. */
	promptBeat: number | null;
	history: readonly LaneEntry[];
	/** The round's extended expectations, in the same beats; empty before it is placed. */
	bands: readonly { fromBeat: number; untilBeat: number }[];
}

/** How a mechanic shows on the play screen and which sensors answer it. */
export interface MechanicPresenter<I = any, A = any> {
	rules: MechanicRules<I, unknown, A, unknown>;
	scene: Scene;
	/** Every sensor whose observations answer it; the others are filed as another sensor's. */
	sensors: SensorKind[];
	/**
	 * Beats before its prompt that an item following without a counted bar is shown (D5), the
	 * settled round staying until then; absent: shown at its prompt.
	 */
	previewBeats?: number;
	/** The prompt of the old one-answer controller (the triads until H5). */
	prompt?(
		item: I,
		aids: { aid: AidLevel; stringAid: boolean },
		locale: Locale,
		random: () => number
	): PromptView;
	/** What was answered, localized, or null when the mechanic does not say. */
	answerLabel?(answer: A, item: I, locale: Locale, random: () => number): string | null;
	/** Shown once the round is settled. Today: the right answer after a miss. */
	reveal?(
		item: I,
		outcome: { correct: boolean; verdict: ResponseVerdict },
		locale: Locale
	): string | null;
	/**
	 * After a miss: the shape heard, the shape asked, and what tells them apart, drawn in the
	 * verdict. Null on a right answer; leave it out for a mechanic that draws no shape.
	 */
	feedback?(
		item: I,
		outcome: { answer: unknown; confusion: unknown; verdict: ResponseVerdict },
		locale: Locale
	): { heard: ShapeView | null; expected: ShapeView | null; gap: string | null } | null;
	/** Its misses may be contested during play (« Joué juste »): the judge may be wrong. */
	contestable?: boolean;
	/** The answer buttons of a screen mechanic. */
	answerChoices?(): AnswerChoice[];
	/** Detection log lines of this mechanic for one observation payload. */
	debugLines?(item: I, payload: unknown): string[];
	/**
	 * What each of its sensors should listen for in a round that opens at `opensAt` (audio s),
	 * after the session's `previous` prompt (null for the first). Opaque to the core. A sensor
	 * left out, or every sensor without it, is told null.
	 */
	expectation?(
		item: I,
		round: { opensAt: number; previous: PlannedItem | null }
	): Partial<Record<SensorKind, unknown>>;
	/**
	 * The screen model of a prompt, opaque to the core, shown by the view its exercise names:
	 * before its round (`settled` null) and once settled, with the round's answer and verdict;
	 * `aids`, the prompt's aid. Leave it out for a mechanic shown by the play screen's own lane.
	 */
	stage?(
		item: I,
		settled: { answer: unknown; verdict: ResponseVerdict } | null,
		locale: Locale,
		aids: { aid: AidLevel }
	): { model: unknown };
	/**
	 * The screen model of a prompt on the target model, for an exercise that writes no
	 * presentation (the series builds the others' with `promptStage`): before its round
	 * (`settled` null) and once settled, from the round's response value; `place` tells the view
	 * where it stands, and `drawing` how its chord shapes are drawn (the settings' style, default
	 * `DEFAULT_SETTINGS.chordDiagram`, unless the exercise imposes one). `random` spells a note:
	 * the series gives every call for one item the same value, so a note is written alike from
	 * its preview to its settlement.
	 * Beside `stage`, which the one-answer controller keeps until the migration.
	 */
	stageOf?(
		item: I,
		settled: { value: ResponseValue; success: boolean } | null,
		locale: Locale,
		aids: { aid: AidLevel; stringAid: boolean },
		place: StagePlace,
		drawing: { chordDiagram: ChordDiagramStyle } | undefined,
		random: () => number
	): { model: unknown };
	/** The mechanic's `Attempt.data` for a round answered with `value`. */
	attemptData?(item: I, value: ResponseValue): unknown;
}

/**
 * A presenter the old one-answer controller plays (the triads until H5; the gesture's own model):
 * it writes its prompt, its answer and its correction itself.
 */
export type OneAnswerPresenter<I = any, A = any> = MechanicPresenter<I, A> &
	Required<Pick<MechanicPresenter<I, A>, 'prompt' | 'answerLabel' | 'reveal'>>;
