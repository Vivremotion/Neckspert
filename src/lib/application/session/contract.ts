import type { StringNumber } from '$lib/domain/music/types';
import type { LeadBeats, Verdict } from '$lib/domain/types';
import type { Scene } from '$lib/application/mechanics/types';

export type { Scene };

export type PlayStatus = 'idle' | 'count-in' | 'awaiting' | 'verdict' | 'paused' | 'finished';

/** Localized prompt, ready to display. */
export interface PromptView {
	/** Mode 1: the note ("F", "Gb"). Mode 2: the fret ("case 8"). */
	primary: string;
	/** The string ("corde de B"); for a triad, the string of its root or its position. */
	secondary: string;
	/** Small, under the prompt: the strings of a triad ("sol‑si‑mi"). */
	detail?: string;
	/** Mode 1 learning aid ("case 6"), or null. */
	aid: string | null;
	/** Mode 1, while a note is learned: the prompted string to draw, with its open note. Else null. */
	diagram: { string: StringNumber; label: string } | null;
}

export interface VerdictView {
	verdict: Verdict;
	/** Mode 1: onset minus target beat, ms. */
	offsetMs: number | null;
	reactionMs: number | null;
	/** What was answered, localized ("F#", "Gb"), or null without an answer. */
	answerLabel: string | null;
	/** After a miss: the right answer, the position in mode 1 ("corde de E grave, case 5"), the name in mode 2. */
	correction: string | null;
}

/** A played target on the lane, at the beat it was due. */
export interface LaneEntry {
	beatIndex: number;
	verdict: Verdict;
}

export interface AnswerChoice {
	/** What the tap sends to `answer` (mode 2: the pitch, "F#"). */
	value: string;
	/** "F", or "F# / Gb" for altered notes. */
	label: string;
}

export interface PlayView {
	status: PlayStatus;
	prompt: PromptView | null;
	lastVerdict: VerdictView | null;
	tempoBpm: number;
	beatsPerBar: 4;
	/** Mode 1: beat on which the prompt appeared. */
	promptBeatIndex: number | null;
	/** Mode 1: beat on which the note is due. */
	targetBeatIndex: number | null;
	leadBeats: LeadBeats | null;
	/** Targets already played in this series, oldest first. */
	history: LaneEntry[];
	/** Mode 2: the twelve answer buttons. */
	answerChoices: AnswerChoice[] | null;
	fatigueDetected: boolean;
	/** What the stage shows: the lane for the guitar, the answer pad for the screen. */
	scene: Scene;
	/** Beats left before the next prompt during a counted bar (4 to 1), otherwise null. */
	countdown: number | null;
	/** Mode 1: the next prompt, shown string first before its note appears. Only its string shows. */
	preview: PromptView | null;
	/** 'input': no audio input could be opened at start; the screen says so. */
	audioError: 'input' | null;
}

export interface PlayTimeline {
	/** Fractional beat index at the current audio time; beat 0 starts the series. */
	nowBeat(): number;
}

/** Runs one session. Implemented by the session orchestration, displayed by the play screen. */
export interface PlaySessionController {
	readonly sessionId: string;
	/** Deeply reactive ($state). Read-only for the UI. */
	readonly view: PlayView;
	readonly timeline: PlayTimeline;
	/** Starts audio and the series. Call from a user gesture. */
	start(): Promise<void>;
	pause(): void;
	resume(): void;
	/** A tap on an answer choice (its `value`). Ignored on the guitar and outside `awaiting`. */
	answer(value: string): void;
	/** Ends the session and stops audio. */
	quit(): void;
}
