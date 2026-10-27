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
import type { AnswerChoice, LaneEntry, ShapeView } from '$lib/application/session/contract';

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
	/**
	 * After a miss: the shape heard, the shape asked, and what tells them apart, drawn by its own
	 * screen model (the gesture's, D9). Null on a right answer; leave it out for a mechanic that
	 * draws no shape.
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
	 * The screen model of a prompt on the target model, for an exercise that writes no
	 * presentation (the series builds the others' with `promptStage`): before its round
	 * (`settled` null) and once settled, from the round's response value; `place` tells the view
	 * where it stands, and `drawing` how its chord shapes are drawn (the settings' style, default
	 * `DEFAULT_SETTINGS.chordDiagram`, unless the exercise imposes one). `random` spells a note:
	 * the series gives every call for one item the same value, so a note is written alike from
	 * its preview to its settlement.
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
