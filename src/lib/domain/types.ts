import type { SeriesSummary } from './session/summary';
import type { PitchName, StringNumber } from './music/types';
import type { IgnoreReason } from './time/modes/types';
import type { Execution, ExerciseId } from './exercise/types';
import type { SkillId } from './skill/types';
import { RESPONSE_VERDICTS, type ResponseVerdict } from './time/modes/responseVerdict';
import {
	ROUTINE_CHANGES_ID,
	ROUTINE_CHORDS_ID,
	ROUTINE_CHORDS_ZONE_ID,
	ROUTINE_NOTES_ID
} from './exercise/catalogIds';
import type {
	Aid,
	CycleReport,
	CycleThresholds,
	CycleVerdict,
	Figure,
	LevelState,
	Measures,
	VerdictEnvelope
} from './time';

export type { Aid, Execution, ExerciseId, LevelState, Measures, SkillId, VerdictEnvelope };

export type Locale = 'fr' | 'en';

/** `${skill}:${itemKey}`: `locate-note-string:6:F`, `identify-note:6:3`. */
export type CardKey = string;

export function cardKey(skill: SkillId, itemKey: string): CardKey {
	return `${skill}:${itemKey}`;
}

/** Splits at the first `:`; throws without one or with an empty side. */
export function parseCardKey(key: CardKey): { skill: SkillId; itemKey: string } {
	const colon = key.indexOf(':');
	const skill = colon < 0 ? '' : key.slice(0, colon);
	const itemKey = colon < 0 ? '' : key.slice(colon + 1);
	if (skill === '' || itemKey === '') {
		throw new Error(`Invalid card key: ${key}`);
	}
	return { skill, itemKey };
}

// The one-answer verdict lives with the response verdict mode; re-exported for its readers.
export { RESPONSE_VERDICTS, type ResponseVerdict };

/** The time relations whose rounds take one answer and judge it with a `ResponseVerdict`. */
export const RESPONSE_RELATIONS: readonly string[] = [
	'beat',
	'free',
	'anchor',
	'grid-change',
	'response'
];

/**
 * The response verdict of an attempt of a response relation, else null. The relations of the
 * one-answer path store the verdict itself; the `response` verdict mode stores it in its value.
 */
export function responseVerdictOf(attempt: Pick<Attempt, 'verdict'>): ResponseVerdict | null {
	const { relation, value } = attempt.verdict;
	if (!RESPONSE_RELATIONS.includes(relation)) return null;
	const verdict =
		typeof value === 'object' && value !== null ? (value as { verdict?: unknown }).verdict : value;
	return (RESPONSE_VERDICTS as readonly unknown[]).includes(verdict)
		? (verdict as ResponseVerdict)
		: null;
}

/** Locate: a correct answer whose lead fits in this duration is direct recall. To calibrate. */
export const RECALL_THRESHOLD_MS = 1500;

/** Identify: a correct name within this duration is direct recall. To calibrate. */
export const IDENTIFY_RECALL_THRESHOLD_MS = 3000;

export type Temperature = 'cold' | 'hot';

/**
 * Notes: learn and free play. The memory track of the triads (spec 2026-10-08), one exercise per
 * session: `triads` the anchor (sessions before 2026-10-09 mixed in the zone), `triads-zone`.
 * The gesture track (spec 2026-10-10): `gesture`, every open gesture exercise in turn.
 */
export type SessionKind =
	| 'learn'
	| 'free'
	| 'triads'
	| 'triads-zone'
	| 'gesture'
	/** Free play of one exercise (`SessionRecord.exercise`): the rhythm exercises. */
	| 'exercise';

/** A session of the triads' memory track. */
export function isTriadsKind(kind: SessionKind): boolean {
	return kind === 'triads' || kind === 'triads-zone';
}

/** What a stored session says it played: a routine, or one exercise. */
export type SessionOrigin = Pick<SessionRecord, 'routine' | 'exercise' | 'free'>;

/** The routine each kind of session but `exercise` plays (until plan 5). */
const ROUTINE_OF_KIND: Readonly<Record<Exclude<SessionKind, 'exercise'>, SessionOrigin>> = {
	learn: { routine: ROUTINE_NOTES_ID },
	free: { routine: ROUTINE_NOTES_ID, free: true },
	triads: { routine: ROUTINE_CHORDS_ID },
	'triads-zone': { routine: ROUTINE_CHORDS_ZONE_ID },
	gesture: { routine: ROUTINE_CHANGES_ID }
};

/** What a session of `kind` records it played; an exercise session names its exercise. */
export function sessionOriginOf(kind: SessionKind, exercise?: ExerciseId): SessionOrigin {
	if (kind === 'exercise') return exercise === undefined ? {} : { exercise };
	return { ...ROUTINE_OF_KIND[kind] };
}

/** The kind of session a record came from: learn, free, triads, triads-zone, gesture, exercise. */
export function sessionKindOf(record: SessionOrigin): SessionKind {
	for (const [kind, origin] of Object.entries(ROUTINE_OF_KIND)) {
		if (origin.routine === record.routine && origin.free === record.free) {
			return kind as SessionKind;
		}
	}
	return 'exercise';
}

/** Where an attempt happened inside a session. */
export type ItemPhase = 'probe' | 'review' | 'learning' | 'consolidation' | 'free';

/** Help shown with a mode 1 prompt: the fret, or nothing. */
export type AidLevel = 'show-position' | 'none';

/** A lead in beats of the meter: any positive number. */
export type LeadBeats = number;

/** Lead stored on an attempt: attempts recorded before 2026-10-04 can hold the old 1-beat step. */
export type RecordedLeadBeats = LeadBeats | 1;

export interface Attempt<D = unknown> {
	id?: number;
	sessionId: string;
	exerciseId: ExerciseId;
	/** The skill its exercise practises. */
	skill: SkillId;
	cardKey: CardKey;
	phase: ItemPhase;
	temperature: Temperature;
	/** What the round showed or played for the player (`AidLevel` is the planned aid). */
	aids: Aid[];
	/** Epoch ms when the prompt appeared. */
	promptedAt: number;
	/** Tempo of the execution; it enters the judgement (direct recall). Null without a tempo. */
	tempoBpm: number | null;
	/** The scope of the exercise level it was played at (`PlannedItem.scope`); absent without one. */
	scope?: string;
	/** Time relation: null when answering at one's own pace. */
	leadBeats: RecordedLeadBeats | null;
	/** Latency-corrected onset minus target beat time, in ms. Null off the beat or unanswered. */
	timingOffsetMs: number | null;
	/** Prompt to answer, in ms. Null without an answer. */
	reactionMs: number | null;
	/** The judge's word on the content played, whatever the timing; null when nothing was judged. */
	correct: boolean | null;
	/** The relation's word on whether the round passed: what stats, grades and pacing read. */
	success: boolean;
	/** The relation's own verdict (`responseVerdictOf` for a one-answer relation). */
	verdict: VerdictEnvelope;
	/** Measures of the round; {} for the one-answer relations. */
	measures: Measures;
	/** The round's resolved plan; null before plans and for the one-answer relations. */
	plan: unknown | null;
	/** Specific to its skill's items: item, answer and confusion. */
	data: D;
	/** Raw observations heard during the prompt. Null when not recorded (older attempts). */
	observations: RecordedObservation[] | null;
	/**
	 * The player said a refused chord was played right ("Joué juste"): a label for the judge's
	 * analysis, never read by FSRS. Absent until then.
	 */
	contested?: boolean;
	/** Why it was contested, when the judge gave reasons (a cycle's `CycleFailure`). */
	contestReason?: string;
}

/** What became of an observation heard during a prompt: the answer, or why it was not. */
export type ObservationFate = 'answer' | IgnoreReason | 'other-sensor' | 'unreadable';

/** One raw observation of a prompt, kept with its attempt. */
export interface RecordedObservation<P = unknown> {
	/** Ms since the prompt (the round's audio time), latency removed; negative when before. */
	atMs: number;
	sensor: string;
	fate: ObservationFate;
	/** Whether the observation matched the expected answer; null when it cannot say. */
	correct: boolean | null;
	/** Sensor-specific content (note, level...). */
	payload: P;
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

export interface CardState<I = unknown> {
	key: CardKey;
	skill: SkillId;
	item: I;
	/** Epoch ms of the learning (or probe) that introduced the card. */
	introducedAt: number;
	introducedInSession: string;
	scheduling: SchedulingState;
	/** Epoch ms when in-session learning completed. Null while the card is being learned. */
	learnedAt: number | null;
	acquiredAt: number | null;
	masteredAt: number | null;
}

export interface PlannedItem<I = unknown> {
	exerciseId: ExerciseId;
	/** The skill its exercise practises (`ExerciseDefinition.practices`). */
	skill: SkillId;
	item: I;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	/** Time relation "beat" only. */
	leadBeats: LeadBeats | null;
	/** Its level on its exercise's ladder, when a source served it from one (`ladderOf`). */
	level?: number;
	/**
	 * Its exercise's level (`exerciseLevelsOf`): a source writes 0, the series the level its
	 * exercise plays at when the round is placed (`ExerciseLevels.played`).
	 */
	exerciseLevel: number;
	/** Starts a sequence at another lead: the session counts a bar down before it. */
	countIn?: boolean;
	/** With `countIn`: bars of silence before the counted bar, a break heard without looking. */
	restBars?: number;
	/**
	 * The scope of its exercise's level (`Execution.scope`): the prompt plays at, and moves, the
	 * level of its exercise in that scope, and so its tempo. Absent: the exercise's own level.
	 */
	scope?: string;
	/** Locate removable aid: the string may be drawn. Hot prompts of a card not acquired only. */
	stringAid?: boolean;
	/** The passage it is a round of, for an exercise that writes passages (`createPassageSource`). */
	passage?: PlannedPassage;
}

/** A round's place in the passage it belongs to. */
export interface PlannedPassage {
	/** This passage in the series. */
	id: string;
	/** Its index's key and values. */
	index: string;
	of: Readonly<Record<string, unknown>>;
	/** Its rank in the passage, and the passage's length. */
	rank: number;
	length: number;
	/**
	 * The item of every round of the passage, in order, as its source serves them (a view draws
	 * the whole passage); absent when the source does not tell them.
	 */
	items?: readonly unknown[];
	/** The values of the passage params, as this round reads them. */
	each: Readonly<Record<string, unknown>>;
	/** The identity of the last member heard in the passage; null before any. */
	previous: string | null;
}

/**
 * What an attempt of a passage's round keeps of it in its `data.passage`: the passage, its
 * index's key, the round's rank, and the passage params as the round read them.
 */
export interface AttemptPassage {
	id: string;
	index: string;
	rank: number;
	each: Readonly<Record<string, unknown>>;
}

export interface SessionRecord {
	id: string;
	/** The routine the session played (`ROUTINE_*_ID`); absent for a session of one exercise. */
	routine?: string;
	/** The exercise played, for a session of one exercise. */
	exercise?: ExerciseId;
	/** A routine played freely, out of the learning procedure (the notes' free play). */
	free?: true;
	startedAt: number;
	endedAt: number | null;
	fatigueDetected: boolean;
	/** The exercises run in the session, each with its tempo frozen at the start. */
	executions: Execution[];
	/**
	 * The level the exercise was held at when the series ended (0 = level 1, aid levels negative),
	 * for a session of one exercise; absent from sessions stored before it was kept.
	 */
	levelReached?: number;
	/** Calibrated detection latency in ms applied to the session's onsets. Null when unknown (older sessions). */
	latencyMs: number | null;
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

/** Budgets offered for the diagnostic journal, in MB. */
export const DIAGNOSTIC_BUDGETS_MB: readonly number[] = [100, 300, 1000];

/** The diagnostic journal: sound and detector details, kept apart from learning data. */
export interface DiagnosticsSettings {
	/** Null: the build decides (on in development, off in a published build). */
	enabled: boolean | null;
	budgetMb: number;
	/**
	 * Development option: keep the sound at the input's own rate rather than 16 kHz, to replay
	 * attack transients above 8 kHz. Absent = false.
	 */
	nativeRate?: boolean;
}

/** The journal is on when the player turned it on, or by the build's default until they choose. */
export function resolveDiagnosticsEnabled(
	settings: DiagnosticsSettings,
	buildDefault: boolean
): boolean {
	return settings.enabled ?? buildDefault;
}

/** How a chord shape is drawn: on six horizontal strings, or on a chord grid. */
export type ChordDiagramStyle = 'strings' | 'grid';

export const CHORD_DIAGRAM_STYLES: readonly ChordDiagramStyle[] = ['strings', 'grid'];

/**
 * How a latency was measured: `system` without the player's gesture (the sound heard through two
 * inputs), `player` from the player's own attacks on the click.
 */
export type LatencyProvenance = 'system' | 'player';

/** The latency of a sensor, in ms, subtracted from the time it reports an attack at. */
export interface SensorLatency {
	ms: number;
	provenance: LatencyProvenance;
}

export const LATENCY_PROVENANCES: readonly LatencyProvenance[] = ['system', 'player'];

export interface Settings {
	locale: Locale;
	/** Calibrated latency by sensor (`note`, `chord`, `attack`…); a sensor without one is uncalibrated. */
	latency: Partial<Record<string, SensorLatency>>;
	/** The click was heard on the playing input at calibration: the player needs headphones. */
	clickBleed: boolean;
	inputDeviceId: string | null;
	/** Multiplier for the computer's built-in mic. External interfaces stay at unity. */
	builtInInputGain: number;
	diagnostics: DiagnosticsSettings;
	/** How chord shapes are drawn, unless the exercise says. */
	chordDiagram: ChordDiagramStyle;
}

export const DEFAULT_SETTINGS: Settings = {
	locale: 'fr',
	latency: {},
	clickBleed: false,
	inputDeviceId: null,
	builtInInputGain: DEFAULT_BUILT_IN_INPUT_GAIN,
	diagnostics: { enabled: null, budgetMb: 300 },
	chordDiagram: 'strings'
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
	/**
	 * Tempo the locate exercise (the anchor in a triads session) was played at in this session.
	 * Null when it did not run.
	 */
	tempoBpm: number | null;
	/** Which session it was: a triads session counts triads, not notes. */
	kind: SessionKind;
	/** A gesture session, by exercise: the rest of the summary is not shown for it. */
	gesture?: GestureSummary;
	/** A rhythm exercise session: the rest of the summary is not shown for it. */
	exercise?: ExerciseSummary;
}

/** What a rhythm exercise session did: the level it ended on and its cycles. */
export interface ExerciseSummary {
	exerciseId: ExerciseId;
	/** The level held at the end, as the screen numbers it (« niveau 3 sur 6 », or an aid level). */
	levelReached: { shown: number; of: number; aid: boolean };
	/** Cycles played. */
	cycles: number;
	/** Cycles that succeeded (`Attempt.success`). */
	successes: number;
	/** Of the successes, those played with an aid the level does not give (they do not count towards moving up). */
	aided: number;
	/** The series as its trace tells it; absent once the session is no longer in memory (a reload). */
	series?: SeriesSummary;
	/** The runs whose take is still held, by the id of their segment: each can be heard again. */
	replayable?: number[];
	/** The last cycle played, in full; shown in development builds. Absent without a cycle. */
	lastCycle?: {
		report: CycleReport;
		verdict: CycleVerdict;
		/** The thresholds of the level it was played at. */
		thresholds: CycleThresholds;
		/** The cycle as played, to engrave it with its marks; absent when its plan cannot be read. */
		played?: { figure: Figure; cycleBars: number; tempoBpm: number };
	};
}

/** What a gesture session did, exercise by exercise, and the changes it missed. */
export interface GestureSummary {
	/** One line per exercise and scope (its grid; none for the link). */
	exercises: {
		exerciseId: ExerciseId;
		scope?: string;
		passagesPlayed: number;
		passagesSucceeded: number;
		/** Share of its changes right and in time (`Attempt.success`). */
		changeSuccessRate: number;
		/** The tempo of its first round. */
		tempoBpm: number;
		/** The tempo of its last round: a level reached and not played yet does not show. */
		lastTempoBpm: number;
	}[];
	/**
	 * The exercise and scope that rest after « On change d’air »; present only while the session's
	 * series is in memory and ended so. Computed, never stored.
	 */
	changeOfAir?: { exerciseId: ExerciseId; scope?: string };
	/** Missed changes, oldest first; `heard` and `expected` are the frets of a shape ("7-7-5"). */
	misses: {
		attemptId: number;
		exerciseId: ExerciseId;
		symbol: string;
		heard: string | null;
		expected: string | null;
		contested: boolean;
	}[];
}

/** A triad attempt whose chord was judged wrong, as the summary lists it. */
/** One cell of the neck map: a position and what is known about it. */
export interface NeckMapCell {
	string: StringNumber;
	fret: number;
	pitch: PitchName;
	locate: CardStatus;
	identify: CardStatus;
	/**
	 * Proven recall: lead of the latest cold success of the locate card (passed probes included,
	 * off beat excluded), in ms at the tempo of that attempt. A later miss leaves it.
	 * Null without such a success at a known tempo.
	 */
	locateRecallMs: number | null;
	/** Median tap time for cold identify attempts at this fret. */
	identifyMedianReactionMs: number | null;
	coldAccuracy: number | null;
}

/** A definition file the player imported, kept as the text it was read from, by its name. */
export interface DefinitionFileRecord {
	name: string;
	text: string;
	importedAt: number;
}

export interface BackupFile {
	app: 'neckspert-play';
	version: 9;
	exportedAt: number;
	settings: Settings;
	cards: CardState[];
	attempts: Attempt[];
	sessions: SessionRecord[];
	levelStates: LevelState[];
	definitionFiles: DefinitionFileRecord[];
}
