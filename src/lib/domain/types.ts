import {
	CHROMATIC_NOTES,
	MAX_PROMPT_FRET,
	type Midi,
	type PitchName,
	type StringNumber
} from './music/types';

export type Locale = 'fr' | 'en';

export type Direction = 'locate' | 'identify';

/** Mode 1: play `pitch` on `string`, any octave playable on that string. */
export interface LocateTarget {
	direction: 'locate';
	string: StringNumber;
	pitch: PitchName;
}

/** Mode 2: name the note at `string`, `fret` (0 to MAX_PROMPT_FRET). */
export interface IdentifyTarget {
	direction: 'identify';
	string: StringNumber;
	fret: number;
}

export type Target = LocateTarget | IdentifyTarget;

export type CardKey = string;

export function cardKey(target: Target): CardKey {
	return target.direction === 'locate'
		? `locate:${target.string}:${target.pitch}`
		: `identify:${target.string}:${target.fret}`;
}

export function parseCardKey(key: CardKey): Target {
	const parts = key.split(':');
	if (parts.length !== 3) {
		throw new Error(`Invalid card key: ${key}`);
	}
	const [direction, rawString, value] = parts;
	if (value === '') {
		throw new Error(`Invalid card key: ${key}`);
	}
	const string = Number(rawString);
	if (!Number.isInteger(string) || string < 1 || string > 6) {
		throw new Error(`Invalid string in card key: ${key}`);
	}
	if (direction === 'locate') {
		if (!(CHROMATIC_NOTES as readonly string[]).includes(value)) {
			throw new Error(`Invalid pitch in card key: ${key}`);
		}
		return { direction, string: string as StringNumber, pitch: value as PitchName };
	}
	if (direction === 'identify') {
		const fret = Number(value);
		if (!Number.isInteger(fret) || fret < 0 || fret > MAX_PROMPT_FRET) {
			throw new Error(`Invalid fret in card key: ${key}`);
		}
		return { direction, string: string as StringNumber, fret };
	}
	throw new Error(`Invalid direction in card key: ${key}`);
}

export type Verdict = 'perfect' | 'early' | 'late' | 'wrong';

/** Locate: a correct answer whose lead fits in this duration is direct recall. To calibrate. */
export const RECALL_THRESHOLD_MS = 1500;

/** Identify: a correct name within this duration is direct recall. To calibrate. */
export const IDENTIFY_RECALL_THRESHOLD_MS = 3000;

export type Temperature = 'cold' | 'hot';

export type SessionKind = 'learn' | 'free';

/** Where an attempt happened inside a session. */
export type ItemPhase = 'probe' | 'review' | 'learning' | 'consolidation' | 'free';

/** Help shown with a mode 1 prompt: the fret, or nothing. */
export type AidLevel = 'show-position' | 'none';

/** Lead time steps, in beats, between the prompt and the target beat (mode 1). */
export const LEAD_STEPS = [8, 4, 2, 1] as const;
export type LeadBeats = (typeof LEAD_STEPS)[number];

/** What the guitarist answered: a played note (mode 1) or a tapped name (mode 2). */
export type Answer = { kind: 'note'; midi: Midi } | { kind: 'name'; pitch: PitchName };

/** How a wrong answer relates to the expected one. */
export type Confusion =
	| { kind: 'semitone'; delta: -2 | -1 | 1 | 2 }
	| { kind: 'octave' }
	| { kind: 'other'; semitones: number };

export interface Attempt {
	id?: number;
	sessionId: string;
	cardKey: CardKey;
	target: Target;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	/** Mode 1 only. */
	leadBeats: LeadBeats | null;
	/** Epoch ms when the prompt appeared. */
	promptedAt: number;
	/** Null when nothing was answered before the window closed. */
	answer: Answer | null;
	/** Pitch (mode 1) or name (mode 2) is right, whatever the timing. */
	correct: boolean;
	verdict: Verdict;
	/** Mode 1 only: latency-corrected onset minus target beat time, in ms. */
	timingOffsetMs: number | null;
	/** Prompt to answer, in ms. Null without an answer. */
	reactionMs: number | null;
	confusion: Confusion | null;
}

/** Serializable mirror of a ts-fsrs Card; dates are epoch ms. */
export interface SchedulingState {
	due: number;
	stability: number;
	difficulty: number;
	elapsedDays: number;
	scheduledDays: number;
	learningSteps: number;
	reps: number;
	lapses: number;
	/** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
	state: 0 | 1 | 2 | 3;
	lastReview: number | null;
}

export interface CardState {
	key: CardKey;
	target: Target;
	/** Epoch ms of the learning (or probe) that introduced the card. */
	introducedAt: number;
	introducedInSession: string;
	/** Current lead step, mode 1 only; identify cards keep 1. */
	leadBeats: LeadBeats;
	scheduling: SchedulingState;
	/** Epoch ms when in-session learning completed. Null while the card is being learned. */
	learnedAt: number | null;
	acquiredAt: number | null;
	masteredAt: number | null;
}

export interface PlannedItem {
	target: Target;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	/** Mode 1 only. */
	leadBeats: LeadBeats | null;
}

export interface SessionRecord {
	id: string;
	kind: SessionKind;
	startedAt: number;
	endedAt: number | null;
	fatigueDetected: boolean;
	/** Tempo copied from settings when the session started. Null on older records. */
	tempoBpm: number | null;
}

/** Linear gain applied only to a built-in computer mic, before level and pitch. */
export const MIN_BUILT_IN_INPUT_GAIN = 1;
export const MAX_BUILT_IN_INPUT_GAIN = 16;
export const DEFAULT_BUILT_IN_INPUT_GAIN = 8;

export function clampBuiltInInputGain(gain: number): number {
	const rounded = Math.round(gain);
	if (!Number.isFinite(rounded) || rounded < MIN_BUILT_IN_INPUT_GAIN)
		return MIN_BUILT_IN_INPUT_GAIN;
	if (rounded > MAX_BUILT_IN_INPUT_GAIN) return MAX_BUILT_IN_INPUT_GAIN;
	return rounded;
}

export interface Settings {
	locale: Locale;
	tempoBpm: number;
	/** Detection latency in ms, subtracted from onset times. Null until calibrated. */
	calibrationOffsetMs: number | null;
	inputDeviceId: string | null;
	/** Multiplier for the computer's built-in mic. External interfaces stay at unity. */
	builtInInputGain: number;
}

export const DEFAULT_SETTINGS: Settings = {
	locale: 'fr',
	tempoBpm: 80,
	calibrationOffsetMs: null,
	inputDeviceId: null,
	builtInInputGain: DEFAULT_BUILT_IN_INPUT_GAIN
};

export type CardStatus = 'unseen' | 'learning' | 'acquired' | 'mastered';

export interface HomeStats {
	/** Cards a learn session would review cold right now. */
	dueCount: number;
	/** Earliest time a learned card can be reviewed cold. Null without a learned card. */
	nextReviewAt: number | null;
	/** Median |onset − beat| in ms, cold correct locate attempts. The home number. */
	medianColdOffsetMs: number | null;
	trend: 'improving' | 'stable' | 'worsening' | null;
}

export type SessionGrade = 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D+' | 'D' | 'F+';

export interface SessionSummary {
	sessionId: string;
	pool: 'cold' | 'all';
	attemptCount: number;
	correctCount: number;
	/** Median |onset − beat| in ms for this session's counted correct locate attempts. */
	medianOffsetMs: number | null;
	/** Median tap time in ms for this session's counted identify attempts. */
	identifyMedianReactionMs: number | null;
	/** Cards whose in-session learning completed during this session. */
	learnedCount: number;
	/** Cards presented in this session and still being learned. */
	pendingCount: number;
	/** Probes passed in this session. */
	knownCount: number;
	fatigueDetected: boolean;
	/** Earliest time a learned card can be reviewed cold. Informational. */
	nextReviewAt: number | null;
	grade: SessionGrade | null;
}

/** One cell of the neck map: a position and what is known about it. */
export interface NeckMapCell {
	string: StringNumber;
	fret: number;
	pitch: PitchName;
	locate: CardStatus;
	identify: CardStatus;
	/** Announcement the locate card has earned. Null when that sense has no card. */
	locateLeadBeats: LeadBeats | null;
	/** Duration of locateLeadBeats at the tempo of the session that set it. Null when unknown. */
	locateLeadMs: number | null;
	/** Median tap time for cold identify attempts at this fret. */
	identifyMedianReactionMs: number | null;
	coldAccuracy: number | null;
}

export interface BackupFile {
	app: 'neckspert-play';
	version: 1;
	exportedAt: number;
	settings: Settings;
	cards: CardState[];
	attempts: Attempt[];
	sessions: SessionRecord[];
}
