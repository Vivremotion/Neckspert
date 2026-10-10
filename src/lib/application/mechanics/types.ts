import type { MechanicRules } from '$lib/domain/mechanics';
import type { AidLevel, Locale, PlannedItem, Verdict } from '$lib/domain/types';
import type { AnswerChoice, PromptView, ShapeView } from '$lib/application/session/contract';

/** Lane and clicks for the guitar; answer pad and silence for the screen. */
export type Scene = 'guitar' | 'screen';

/** Names an observation source of the session: 'note' and 'chord' (played), 'tap' (on screen). */
export type SensorKind = string;

/** How a mechanic shows on the play screen and which sensors answer it. */
export interface MechanicPresenter<I = any, A = any> {
	rules: MechanicRules<I, unknown, A, unknown>;
	scene: Scene;
	/** Every sensor whose observations answer it; the others are filed as another sensor's. */
	sensors: SensorKind[];
	prompt(
		item: I,
		aids: { aid: AidLevel; stringAid: boolean },
		locale: Locale,
		random: () => number
	): PromptView;
	/** What was answered, localized, or null when the mechanic does not say. */
	answerLabel(answer: A, item: I, locale: Locale, random: () => number): string | null;
	/** Shown once the round is settled. Today: the right answer after a miss. */
	reveal(item: I, outcome: { correct: boolean; verdict: Verdict }, locale: Locale): string | null;
	/**
	 * After a miss: the shape heard, the shape asked, and what tells them apart, drawn in the
	 * verdict. Null on a right answer; leave it out for a mechanic that draws no shape.
	 */
	feedback?(
		item: I,
		outcome: { answer: unknown; confusion: unknown; verdict: Verdict },
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
	 * before its round (`settled` null) and once settled, with the round's answer and verdict.
	 * Leave it out for a mechanic shown by the play screen's own lane.
	 */
	stage?(
		item: I,
		settled: { answer: unknown; verdict: Verdict } | null,
		locale: Locale
	): { model: unknown };
}
