import { MECHANIC_RULES, type MechanicRules } from '$lib/domain/mechanics';
import {
	CHORD_DIAGRAM_STYLES,
	LEAD_STEPS,
	MAX_BUILT_IN_INPUT_GAIN,
	MIN_BUILT_IN_INPUT_GAIN,
	VERDICTS,
	cardKey,
	parseCardKey,
	type BackupFile,
	type ItemPhase,
	type Locale,
	type SessionKind,
	type Temperature
} from '$lib/domain/types';
import { V1_EXERCISE_IDS, convertV1, type V1Backup } from './legacy/v1';
import { fromV2 } from './legacy/v2';

type Fields = Record<string, unknown>;
type Check = (entry: Fields) => string | null;

const LOCALES: readonly Locale[] = ['fr', 'en'];

const TEMPERATURES: readonly Temperature[] = ['cold', 'hot'];
const ITEM_PHASES: readonly ItemPhase[] = ['probe', 'review', 'learning', 'consolidation', 'free'];
const SESSION_KINDS: readonly SessionKind[] = ['learn', 'free', 'triads', 'triads-zone', 'gesture'];
const SCHEDULING_STATES: readonly number[] = [0, 1, 2, 3];
/** Exports made before 2026-10-04 can hold the dropped 1-beat step; the import moves it to 2. */
const CARD_LEADS: readonly number[] = [...LEAD_STEPS, 1];
/** Notes (locate, identify, a triad's root), chords (a triad's chord, a grid's change). */
const CONFUSION_KINDS: readonly string[] = [
	'semitone',
	'octave',
	'string-name',
	'other',
	'other-octave',
	'other-inversion',
	'other-quality',
	'none',
	'no-chord',
	'other-chord',
	'other-set',
	'other-shape',
	'not-higher',
	'not-lower',
	'out-of-zone'
];
const OBSERVATION_FATES: readonly string[] = [
	'answer',
	'settled',
	'before-window',
	'after-capture',
	'other-sensor',
	'unreadable'
];
const MECHANIC_IDS: readonly string[] = MECHANIC_RULES.map((rules) => rules.id);

function isFields(value: unknown): value is Fields {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): boolean {
	return value === null || isFiniteNumber(value);
}

function isPositiveNumber(value: unknown): boolean {
	return isFiniteNumber(value) && value > 0;
}

function isNonEmptyString(value: unknown): boolean {
	return typeof value === 'string' && value !== '';
}

function isOneOf(value: unknown, allowed: readonly unknown[]): boolean {
	return allowed.includes(value);
}

/** Same JSON value: items are compared field by field, whatever the key order. */
function sameValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (Array.isArray(a) || Array.isArray(b)) {
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((value, index) => sameValue(value, b[index]))
		);
	}
	if (!isFields(a) || !isFields(b)) return false;
	const keys = Object.keys(a);
	return (
		keys.length === Object.keys(b).length &&
		keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
	);
}

function rulesOf(mechanic: unknown): MechanicRules | null {
	return MECHANIC_RULES.find((rules) => rules.id === mechanic) ?? null;
}

function checkSettings(settings: Fields): string | null {
	if (!isOneOf(settings.locale, LOCALES)) return 'locale must be "fr" or "en"';
	if (!isNullableNumber(settings.calibrationOffsetMs)) {
		return 'calibrationOffsetMs must be a number or null';
	}
	if (settings.inputDeviceId !== null && typeof settings.inputDeviceId !== 'string') {
		return 'inputDeviceId must be a string or null';
	}
	if (
		settings.builtInInputGain !== undefined &&
		(!isFiniteNumber(settings.builtInInputGain) ||
			settings.builtInInputGain < MIN_BUILT_IN_INPUT_GAIN ||
			settings.builtInInputGain > MAX_BUILT_IN_INPUT_GAIN)
	) {
		return `builtInInputGain must be a number from ${MIN_BUILT_IN_INPUT_GAIN} to ${MAX_BUILT_IN_INPUT_GAIN}`;
	}
	// Optional: files exported before it have none, and read as drawn on strings.
	if (
		settings.chordDiagram !== undefined &&
		!isOneOf(settings.chordDiagram, CHORD_DIAGRAM_STYLES)
	) {
		return 'chordDiagram must be "strings" or "grid"';
	}
	return checkDiagnosticsSettings(settings.diagnostics);
}

/** Optional: files exported before the diagnostic journal have none. */
function checkDiagnosticsSettings(diagnostics: unknown): string | null {
	if (diagnostics === undefined) return null;
	if (!isFields(diagnostics)) return 'diagnostics must be an object';
	if (diagnostics.enabled !== null && typeof diagnostics.enabled !== 'boolean') {
		return 'diagnostics.enabled must be true, false or null';
	}
	if (!isPositiveNumber(diagnostics.budgetMb)) {
		return 'diagnostics.budgetMb must be a positive number';
	}
	return null;
}

function checkSchedulingAndDates(card: Fields): string | null {
	if (!isFiniteNumber(card.introducedAt)) return 'introducedAt must be a number';
	if (typeof card.introducedInSession !== 'string') return 'introducedInSession must be a string';
	if (!isOneOf(card.leadBeats, CARD_LEADS)) return 'leadBeats must be 8, 4, 2 or 1';
	const scheduling = card.scheduling;
	if (!isFields(scheduling) || !isFiniteNumber(scheduling.due)) {
		return 'scheduling.due must be a number';
	}
	if (!isOneOf(scheduling.state, SCHEDULING_STATES)) return 'scheduling.state must be 0, 1, 2 or 3';
	if (!isNullableNumber(card.learnedAt)) return 'learnedAt must be a number or null';
	if (!isNullableNumber(card.acquiredAt)) return 'acquiredAt must be a number or null';
	if (!isNullableNumber(card.masteredAt)) return 'masteredAt must be a number or null';
	return null;
}

function checkConfusion(confusion: unknown, field: string): string | null {
	if (confusion === null || confusion === undefined) return null;
	if (!isFields(confusion) || !isOneOf(confusion.kind, CONFUSION_KINDS)) {
		return `${field} must be null or a semitone, octave, string-name or other confusion`;
	}
	return null;
}

function checkAttemptFields(attempt: Fields): string | null {
	if (!isOneOf(attempt.phase, ITEM_PHASES))
		return 'phase must be probe, review, learning, consolidation or free';
	if (!isOneOf(attempt.temperature, TEMPERATURES)) return 'temperature must be cold or hot';
	if (!isFiniteNumber(attempt.promptedAt)) return 'promptedAt must be a number';
	if (typeof attempt.correct !== 'boolean') return 'correct must be a boolean';
	if (!isOneOf(attempt.verdict, VERDICTS))
		return 'verdict must be perfect, early, late, offbeat, corrected or wrong';
	if (!isNullableNumber(attempt.reactionMs)) return 'reactionMs must be a number or null';
	return null;
}

function checkAttemptHeader(attempt: Fields): string | null {
	if (attempt.id !== undefined && !(Number.isInteger(attempt.id) && Number(attempt.id) > 0)) {
		return 'id must be a positive integer';
	}
	if (typeof attempt.sessionId !== 'string') return 'sessionId must be a string';
	return null;
}

function checkSessionFields(session: Fields): string | null {
	if (typeof session.id !== 'string' || session.id === '') return 'id must be a non-empty string';
	if (!isOneOf(session.kind, SESSION_KINDS)) return 'kind must be learn, free or triads';
	if (!isFiniteNumber(session.startedAt)) return 'startedAt must be a number';
	if (!isNullableNumber(session.endedAt)) return 'endedAt must be a number or null';
	if (typeof session.fatigueDetected !== 'boolean') return 'fatigueDetected must be a boolean';
	return null;
}

function checkEntries(value: unknown, field: string, check: Check): void {
	if (!Array.isArray(value)) throw new Error(`Backup field "${field}" must be an array`);
	value.forEach((entry: unknown, index) => {
		const problem = isFields(entry) ? check(entry) : 'not an object';
		if (problem) throw new Error(`Invalid ${field} entry at index ${index}: ${problem}`);
	});
}

function checkHeader(file: unknown, version: number): Fields {
	if (!isFields(file)) throw new Error('Backup file is not a JSON object');
	if (file.app !== 'neckspert-play') throw new Error('Not a Neckspert Play backup');
	if (file.version !== version) {
		throw new Error(`Unsupported backup version: ${String(file.version)}`);
	}
	if (!isFiniteNumber(file.exportedAt)) throw new Error('Backup exportedAt must be a number');
	if (!isFields(file.settings)) throw new Error('Backup settings must be an object');
	return file;
}

// Version 1: cards and attempts carry a `target`; sessions and settings a tempo.

/** Parses a v1 key as the v1 model did: `locate:string:pitch` or `identify:string:fret`. */
function parseV1Key(key: unknown): Fields | null {
	if (typeof key !== 'string') return null;
	try {
		const { mechanic, itemKey } = parseCardKey(key);
		if (!Object.hasOwn(V1_EXERCISE_IDS, mechanic)) return null;
		const rules = rulesOf(mechanic);
		return rules && { direction: mechanic, ...(rules.parseItem(itemKey) as Fields) };
	} catch {
		return null;
	}
}

function sameV1Target(expected: Fields, target: Fields): boolean {
	return Object.keys(expected).every((field) => target[field] === expected[field]);
}

function checkV1Target(key: unknown, target: unknown, keyField: string): string | null {
	const expected = parseV1Key(key);
	if (!expected) return `${keyField} is not a valid card key`;
	if (!isFields(target) || !sameV1Target(expected, target)) {
		return `target does not match ${keyField}`;
	}
	return null;
}

function checkV1Settings(settings: Fields): string | null {
	if (!isOneOf(settings.locale, LOCALES)) return 'locale must be "fr" or "en"';
	if (!isPositiveNumber(settings.tempoBpm)) return 'tempoBpm must be a positive number';
	return checkSettings(settings);
}

function checkV1Card(card: Fields): string | null {
	return checkV1Target(card.key, card.target, 'key') ?? checkSchedulingAndDates(card);
}

function checkV1Attempt(attempt: Fields): string | null {
	return (
		checkAttemptHeader(attempt) ??
		checkV1Target(attempt.cardKey, attempt.target, 'cardKey') ??
		checkAttemptFields(attempt) ??
		checkConfusion(attempt.confusion, 'confusion')
	);
}

function checkV1Session(session: Fields): string | null {
	const problem = checkSessionFields(session);
	if (problem) return problem;
	const tempoBpm = session.tempoBpm;
	if (tempoBpm !== undefined && tempoBpm !== null && !isPositiveNumber(tempoBpm)) {
		return 'tempoBpm must be a positive number or null';
	}
	return null;
}

/** Checks a version 1 file, as exported before 2026-10-05. */
export function validateBackupV1(file: unknown): V1Backup {
	const backup = checkHeader(file, 1);
	const settingsProblem = checkV1Settings(backup.settings as Fields);
	if (settingsProblem) throw new Error(`Invalid backup settings: ${settingsProblem}`);
	checkEntries(backup.cards, 'cards', checkV1Card);
	checkEntries(backup.attempts, 'attempts', checkV1Attempt);
	checkEntries(backup.sessions, 'sessions', checkV1Session);
	return backup as unknown as V1Backup;
}

// Version 2: mechanic cards and attempts, executions, progressions.

const MECHANIC_PROBLEM = `mechanic must be one of ${MECHANIC_IDS.join(', ')}`;

/** The key must be the one the mechanic writes for this item: `cardKey(mechanic, itemKey(item))`. */
function checkItem(
	mechanic: unknown,
	key: unknown,
	item: unknown,
	keyField: string,
	itemField: string,
	prompted = false
): string | null {
	const rules = rulesOf(mechanic);
	if (!rules) return MECHANIC_PROBLEM;
	if (typeof key !== 'string') return `${keyField} is not a valid card key`;
	let parsed: unknown;
	try {
		const split = parseCardKey(key);
		if (split.mechanic !== rules.id) return `${keyField} does not match mechanic`;
		parsed = rules.parseItem(split.itemKey);
	} catch {
		return `${keyField} is not a valid card key`;
	}
	if (cardKey(rules.id, rules.itemKey(parsed)) !== key)
		return `${keyField} is not a valid card key`;
	// A prompted item may add to its card's (a position drawn for one prompt).
	const kept = prompted && rules.cardItem ? rules.cardItem(item) : item;
	if (!sameValue(kept, parsed)) return `${itemField} does not match ${keyField}`;
	return null;
}

function checkCard(card: Fields): string | null {
	return (
		checkItem(card.mechanic, card.key, card.item, 'key', 'item') ?? checkSchedulingAndDates(card)
	);
}

function checkAttempt(attempt: Fields): string | null {
	const header = checkAttemptHeader(attempt);
	if (header) return header;
	if (!isNonEmptyString(attempt.exerciseId)) return 'exerciseId must be a non-empty string';
	if (!rulesOf(attempt.mechanic)) return MECHANIC_PROBLEM;
	const data = attempt.data;
	if (!isFields(data) || !Object.hasOwn(data, 'item')) {
		return 'data must be an object with an item';
	}
	if (attempt.tempoBpm !== null && !isPositiveNumber(attempt.tempoBpm)) {
		return 'tempoBpm must be a positive number or null';
	}
	return (
		checkItem(attempt.mechanic, attempt.cardKey, data.item, 'cardKey', 'data.item', true) ??
		checkAttemptFields(attempt) ??
		checkConfusion(data.confusion, 'data.confusion')
	);
}

/** Optional: a tempo scope is absent, or a non-empty string. */
function isScope(value: unknown): boolean {
	return value === undefined || isNonEmptyString(value);
}

function checkExecution(execution: unknown, index: number): string | null {
	if (!isFields(execution)) return `executions[${index}] must be an object`;
	if (!isNonEmptyString(execution.exerciseId)) {
		return `executions[${index}].exerciseId must be a non-empty string`;
	}
	if (execution.tempoBpm !== null && !isPositiveNumber(execution.tempoBpm)) {
		return `executions[${index}].tempoBpm must be a positive number or null`;
	}
	if (!isScope(execution.scope)) return `executions[${index}].scope must be a non-empty string`;
	return null;
}

function checkSession(session: Fields): string | null {
	const problem = checkSessionFields(session);
	if (problem) return problem;
	if (!Array.isArray(session.executions)) return 'executions must be an array';
	for (const [index, execution] of session.executions.entries()) {
		const executionProblem = checkExecution(execution, index);
		if (executionProblem) return executionProblem;
	}
	return null;
}

function checkProgression(progression: Fields): string | null {
	if (!isNonEmptyString(progression.exerciseId)) return 'exerciseId must be a non-empty string';
	if (!rulesOf(progression.mechanic)) return MECHANIC_PROBLEM;
	if (!isPositiveNumber(progression.tempoBpm)) return 'tempoBpm must be a positive number';
	if (!isFiniteNumber(progression.updatedAt)) return 'updatedAt must be a number';
	if (!isScope(progression.scope)) return 'scope must be a non-empty string';
	return null;
}

/** Checks a version 2 file, as exported before 2026-10-06, and returns it unchanged. */
export function validateBackupV2(file: unknown): Fields {
	const backup = checkHeader(file, 2);
	const settingsProblem = checkSettings(backup.settings as Fields);
	if (settingsProblem) throw new Error(`Invalid backup settings: ${settingsProblem}`);
	checkEntries(backup.progressions, 'progressions', checkProgression);
	checkEntries(backup.cards, 'cards', checkCard);
	checkEntries(backup.attempts, 'attempts', checkAttempt);
	checkEntries(backup.sessions, 'sessions', checkSession);
	return backup;
}

function fromV1(backup: V1Backup, now: number): Fields {
	const { settings, progressions, cards, attempts, sessions } = convertV1(backup, now);
	return {
		app: backup.app,
		version: 2,
		exportedAt: backup.exportedAt,
		settings,
		progressions,
		cards,
		attempts,
		sessions
	};
}

// Version 3: attempts keep their raw observations, sessions their measured latency.

function checkObservation(observation: unknown, index: number): string | null {
	const field = `observations[${index}]`;
	if (!isFields(observation)) return `${field} must be an object`;
	if (!isFiniteNumber(observation.atMs)) return `${field}.atMs must be a number`;
	if (!isNonEmptyString(observation.sensor)) return `${field}.sensor must be a non-empty string`;
	if (!isOneOf(observation.fate, OBSERVATION_FATES)) {
		return `${field}.fate must be one of ${OBSERVATION_FATES.join(', ')}`;
	}
	if (observation.correct !== null && typeof observation.correct !== 'boolean') {
		return `${field}.correct must be a boolean or null`;
	}
	if (!Object.hasOwn(observation, 'payload')) return `${field}.payload is required`;
	return null;
}

function checkObservations(value: unknown): string | null {
	if (value === null) return null;
	if (!Array.isArray(value)) return 'observations must be null or an array';
	for (const [index, observation] of value.entries()) {
		const problem = checkObservation(observation, index);
		if (problem) return problem;
	}
	return null;
}

/** Optional: absent until a refused chord is contested. */
function checkContested(value: unknown): string | null {
	return value === undefined || typeof value === 'boolean' ? null : 'contested must be a boolean';
}

function checkAttemptV3(attempt: Fields): string | null {
	return (
		checkAttempt(attempt) ??
		checkObservations(attempt.observations) ??
		checkContested(attempt.contested) ??
		(isScope(attempt.tempoScope) ? null : 'tempoScope must be a non-empty string')
	);
}

function checkSessionV3(session: Fields): string | null {
	return (
		checkSession(session) ??
		(isNullableNumber(session.latencyMs) ? null : 'latencyMs must be a number or null')
	);
}

/** Checks a version 3 file and returns it unchanged. */
export function validateBackupV3(file: unknown): BackupFile {
	const backup = checkHeader(file, 3);
	const settingsProblem = checkSettings(backup.settings as Fields);
	if (settingsProblem) throw new Error(`Invalid backup settings: ${settingsProblem}`);
	checkEntries(backup.progressions, 'progressions', checkProgression);
	checkEntries(backup.cards, 'cards', checkCard);
	checkEntries(backup.attempts, 'attempts', checkAttemptV3);
	checkEntries(backup.sessions, 'sessions', checkSessionV3);
	return backup as unknown as BackupFile;
}

/**
 * Accepts version 3, and versions 1 and 2 converted to it (`now` stamps the progression made
 * from a version 1 tempo). Throws a readable error on anything else.
 */
export function validateBackup(file: unknown, now: number = Date.now()): BackupFile {
	if (!isFields(file)) throw new Error('Backup file is not a JSON object');
	if (file.app !== 'neckspert-play') throw new Error('Not a Neckspert Play backup');
	if (file.version === 1) {
		return validateBackupV3(fromV2(fromV1(validateBackupV1(file), now)));
	}
	if (file.version === 2) return validateBackupV3(fromV2(validateBackupV2(file)));
	if (file.version === 3) return validateBackupV3(file);
	throw new Error(`Unsupported backup version: ${String(file.version)}`);
}
