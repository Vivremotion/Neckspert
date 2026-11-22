import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { StringNumber } from '$lib/domain/music/types';
import type { ResponseVerdict } from '$lib/domain/types';

/** The view that shows a presenter's screen model when its exercise names none. */
export const DEFAULT_PLAY_VIEW = 'grid-scroll';

/** The view of an exercise that writes its presentation and names none: the generic lane. */
export const DEFAULT_PROMPT_VIEW = 'lane';

/** The view that draws an exercise: its own, else the lane for a presentation, else the default. */
export function playViewOf(definition: Pick<ExerciseDefinition, 'view' | 'presentation'>): string {
	return (
		definition.view ??
		(definition.presentation !== undefined ? DEFAULT_PROMPT_VIEW : DEFAULT_PLAY_VIEW)
	);
}

export type PlayStatus = 'idle' | 'count-in' | 'awaiting' | 'verdict' | 'paused' | 'finished';

/** A chord shape to draw: the fret pressed on each of its strings (0: open). */
export interface ShapeView {
	notes: { string: StringNumber; fret: number }[];
}

/** Localized prompt, ready to display. */
export interface PromptView {
	/** Mode 1: the note ("F", "Gb"). Mode 2: the fret ("case 8"). */
	primary: string;
	/** The string ("corde de B"); for a triad, the string of its root or its position. */
	secondary: string;
	/** Small, under the prompt: the strings of a triad ("sol‑si‑mi"). */
	detail?: string;
	/** On the target tile, when it is not `primary`: the root of a triad anchor ("C" for "Cm"). */
	target?: string;
	/** On the band of a second gesture, when there is one: the chord of a triad anchor ("Cm"). */
	band?: string;
	/** A shape to draw as the aid (a triad anchor's, aided). */
	shape?: ShapeView;
	/** Mode 1 learning aid ("case 6"), or null. */
	aid: string | null;
	/** Mode 1, while a note is learned: the prompted string to draw, with its open note. Else null. */
	diagram: { string: StringNumber; label: string } | null;
}

export interface VerdictView {
	verdict: ResponseVerdict;
	/** Mode 1: onset minus target beat, ms. */
	offsetMs: number | null;
	reactionMs: number | null;
	/** What was answered, localized ("F#", "Gb"), or null without an answer. */
	answerLabel: string | null;
	/** After a miss: the right answer, the position in mode 1 ("corde de E grave, case 5"), the name in mode 2. */
	correction: string | null;
	/** After a miss of items drawn as shapes: the shape heard (null: none recognized). */
	heard?: ShapeView | null;
	/** …the shape asked, and what tells them apart ("autre renversement"). */
	expected?: ShapeView | null;
	gap?: string | null;
}

/** A played target on the lane, at the beat it was due. */
export interface LaneEntry {
	beatIndex: number;
	verdict: ResponseVerdict;
}

export interface AnswerChoice {
	/** What the tap sends to `answer` (mode 2: the pitch, "F#"). */
	value: string;
	/** "F", or "F# / Gb" for altered notes. */
	label: string;
}

/**
 * What a series announces: a level moved (up, down, to an aid level), a remedy of the
 * anti-blocking under way, or « On change d’air ».
 */
export type Announcement =
	'level-up' | 'level-down' | 'aid-level' | 'listen-remedy' | 'play-along' | 'change-of-air';

/**
 * A stage as a controller sets it: the view and its model, a value built whole and never changed
 * in place. A class instance on purpose: reactive state wraps plain objects, and a model wrapped
 * anew at every beat gives everything it holds a new identity, so a view could not tell that the
 * figure of a round is the one it has already engraved, and engraved it again on every beat.
 */
export class PlayStage {
	constructor(
		readonly view: string,
		readonly model: unknown
	) {}
}

export interface PlayView {
	status: PlayStatus;
	/** The tempo played; 0 while the series has not set it (before its first item), and not shown. */
	tempoBpm: number;
	fatigueDetected: boolean;
	/** Beats left before the next prompt during a counted bar (4 to 1), otherwise null. */
	countdown: number | null;
	/**
	 * After a miss of a contestable exercise, until the next prompt: 'available' offers « Joué
	 * juste », 'done' once pressed; null otherwise.
	 */
	contest: 'available' | 'done' | null;
	/**
	 * 'input': no audio input could be opened at start; 'bleed': the calibration heard the click
	 * on the playing input, so an exercise whose sensor it would fool asks for headphones. The
	 * screen says so.
	 */
	audioError: 'input' | 'bleed' | null;
	/**
	 * The screen model of the prompt waiting or on show, and the view its exercise names to show
	 * it; null before a prompt, and at the end. A controller that shows a model again on every
	 * beat sets a `PlayStage`, so that what two models share stays the same object for the view.
	 */
	stage: { view: string; model: unknown } | null;
	/**
	 * The instruction of the exercise about to start for the first time in the series: on the
	 * start screen (idle), or at a stop of its own (paused, `resume` goes on); null otherwise.
	 */
	briefing: { text: string } | null;
	/**
	 * What the series announces before the run it applies to, from its breath (or its listen-in,
	 * or its counted bar) until the player plays (its first bar, entry bars included), kept
	 * through a pause: the level reached (`level`: 0 for level 1, of the `of` regular levels) and
	 * the tempo it plays at; a remedy while it plays; null otherwise.
	 */
	announcement: {
		kind: Announcement;
		level: number;
		of: number;
		tempoBpm: number;
	} | null;
	/**
	 * The exercise that changed air and leaves the session (« On change d’air »), by its name, and
	 * its scope: from the boundary after the round that blocked until the next round opens, beside
	 * a level announcement; at the end, the one that ended the session, for a session that could
	 * leave an exercise out. Null otherwise.
	 */
	leaving: { title: PlayWords; scope?: string } | null;
}

export interface PlayTimeline {
	/** Fractional beat index at the current audio time; beat 0 starts the series. */
	nowBeat(): number;
}

/** Words in each language of the play screen. */
export interface PlayWords {
	readonly fr: string;
	readonly en: string;
}

/** What a session plays, as the play screen names it (D10); it never chooses the view's world. */
export interface PlayOrigin {
	/**
	 * The routine's title, or the exercise's own when played alone (else its skill's name, else
	 * its id).
	 */
	readonly title: PlayWords;
	/** Told on the start screen when the first exercise tells none: the routine's; null alone. */
	readonly howTo: PlayWords | null;
	/** Played freely, out of the learning procedure. */
	readonly free: boolean;
	/** One exercise played alone, not a routine. */
	readonly alone: boolean;
}

/** Runs one session. Implemented by the session orchestration, displayed by the play screen. */
export interface PlaySessionController {
	readonly sessionId: string;
	/** What it plays; absent from the screens' demonstrations, which name nothing. */
	readonly origin?: PlayOrigin;
	/** Deeply reactive ($state). Read-only for the UI. */
	readonly view: PlayView;
	readonly timeline: PlayTimeline;
	/**
	 * Prepares the series without audio, so the start screen can tell the first exercise's
	 * instruction (`PlayView.briefing`). Optional; `start` prepares it otherwise.
	 */
	ready?(): Promise<void>;
	/** Starts audio and the series. Call from a user gesture. */
	start(): Promise<void>;
	pause(): void;
	resume(): void;
	/** A tap on an answer choice (its `value`). Ignored on the guitar and outside `awaiting`. */
	answer(value: string): void;
	/** « Joué juste »: labels the attempt of the miss on show contested. Only while offered. */
	contest(): void;
	/**
	 * « Écouter la figure »: the next cycle is heard rather than played, then play goes on.
	 * Offered by the controllers that play figures; ignored where the level gives no listening.
	 */
	listen?(): void;
	/** « Réécouter »: plays the last run again with its click, from the breath or the pause. */
	replay?(): Promise<void>;
	/** Ends the session and stops audio. */
	quit(): void;
}
