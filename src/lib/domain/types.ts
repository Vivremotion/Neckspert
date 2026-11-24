import type { SeriesSummary } from './session/summary';
import type { PitchName, StringNumber } from './music/types';
import type { IgnoreReason } from './time/modes/types';
import type { Execution, ExerciseId } from './exercise/types';
import type { SkillId } from './skill/types';
import { RESPONSE_VERDICTS, type ResponseVerdict } from './time/modes/responseVerdict';
import type {
	CycleReport,
	CycleThresholds,
	CycleVerdict,
	Figure,
	LevelState,
	Measures,
	VerdictEnvelope
} from './time';

export type { Execution, ExerciseId, LevelState, Measures, SkillId, VerdictEnvelope };

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

/** What a session plays, as it records it: a routine, or one exercise, freely or not. */
export type SessionOrigin =
	{ routine: string; free?: true } | { exercise: ExerciseId; free?: true };

/** Where an item is served inside a session. */
export type ItemPhase = 'review' | 'learning' | 'consolidation' | 'free';

/**
 * Where an attempt happened, as it was recorded: a served phase, or `'probe'`, which attempts
 * stored before issue #19 keep (a new item was first asked once at the top of its ladder).
 */
export type RecordedPhase = ItemPhase | 'probe';

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
	phase: RecordedPhase;
	temperature: Temperature;
	/** Kept by the attempts stored before database 14; nothing reads it. */
	aids?: readonly string[];
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
	/** Epoch ms of the attempt that introduced the card (before issue #19, maybe a probe). */
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
	/** The id of the routine the session played; absent for a session of one exercise. */
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
	fatigueDetected: boolean;
	/** Earliest time a learned card can be reviewed cold. Informational. */
	nextReviewAt: number | null;
	grade: SessionGrade | null;
	/**
	 * Tempo the locate exercise (the anchor in a triads session) was played at in this session.
	 * Null when it did not run.
	 */
	tempoBpm: number | null;
	/**
	 * The session played chord voicings (its skills' item set is `voicing-on-strings`): it counts
	 * triads, not notes.
	 */
	chords: boolean;
	/**
	 * The session practised skills with cards, or nothing tells otherwise (a session whose
	 * exercises and skills are all gone): the screen shows the fields above, not `exercises`.
	 */
	memory: boolean;
	/** A line per exercise and scope played, in the order first played. */
	exercises: PlayedExercise[];
	/** The missed changes, oldest first: contestable (« Joué juste »). */
	misses: SummaryMiss[];
	/**
	 * The series as its trace tells it, for a session that is not of memory exercises; absent once
	 * the session is no longer in memory (a reload).
	 */
	series?: SeriesSummary;
	/** The runs whose take is still held, by the id of their segment: each can be heard again. */
	replayable?: number[];
	/**
	 * The last cycle played, in full, of an exercise played alone whose round writes a figure;
	 * shown in development builds. Absent without a cycle.
	 */
	lastCycle?: {
		report: CycleReport;
		verdict: CycleVerdict;
		/** The thresholds of the level it was played at. */
		thresholds: CycleThresholds;
		/** The cycle as played, to engrave it with its marks; absent when its plan cannot be read. */
		played?: { figure: Figure; cycleBars: number; tempoBpm: number };
	};
}

/** What a session did with one exercise and scope (its grid; none for most). */
export interface PlayedExercise {
	exerciseId: ExerciseId;
	scope?: string;
	/**
	 * Rounds played, and those that passed (`Attempt.success`). A round of an exercise that plays
	 * passages is one of their changes.
	 */
	rounds: number;
	passed: number;
	/**
	 * The level held at the end, as the screen numbers it (« niveau 3 sur 6 », or an aid level);
	 * null when the exercise writes no level, and for any exercise but one played alone whose
	 * round writes a figure (the changes' levels are their tempos, told by `tempo`).
	 */
	level: { shown: number; of: number; aid: boolean } | null;
	/** The tempo of its first and of its last round; null in free time. */
	tempo: { first: number; last: number } | null;
	/** Its rounds were played in passages: they are changes, told as right and in time. */
	inPassages: boolean;
	/**
	 * Passages played and passed, for rounds played in passages of an exercise a file still
	 * defines (its threshold is known); null otherwise.
	 */
	passages: { played: number; passed: number } | null;
}

/** A missed change; `heard` and `expected` are the frets of a shape ("7-7-5"). */
export interface SummaryMiss {
	attemptId: number;
	exerciseId: ExerciseId;
	symbol: string;
	heard: string | null;
	expected: string | null;
	contested: boolean;
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
