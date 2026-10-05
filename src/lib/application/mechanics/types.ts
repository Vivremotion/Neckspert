import type { MechanicRules } from '$lib/domain/mechanics';
import type { AidLevel, Locale, Verdict } from '$lib/domain/types';
import type { AnswerChoice, PromptView } from '$lib/application/session/contract';

/** Lane and clicks for the guitar; answer pad and silence for the screen. */
export type Scene = 'guitar' | 'screen';

/** Names an observation source of the session: 'note' (played) and 'tap' (on screen) today. */
export type SensorKind = string;

/** How a mechanic shows on the play screen and which sensor answers it. */
export interface MechanicPresenter<I = any, A = any> {
	rules: MechanicRules<I, unknown, A, unknown>;
	scene: Scene;
	sensor: SensorKind;
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
	/** The answer buttons of a screen mechanic. */
	answerChoices?(): AnswerChoice[];
	/** Detection log lines of this mechanic for one observation payload. */
	debugLines?(item: I, payload: unknown): string[];
}
