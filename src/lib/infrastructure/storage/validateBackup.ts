import {
	LEAD_STEPS,
	MAX_BUILT_IN_INPUT_GAIN,
	MIN_BUILT_IN_INPUT_GAIN,
	parseCardKey,
	type BackupFile,
	type ItemPhase,
	type Locale,
	type SessionKind,
	type Target,
	type Temperature,
	type Verdict
} from '$lib/domain/types';

type Fields = Record<string, unknown>;

const LOCALES: readonly Locale[] = ['fr', 'en'];
const VERDICTS: readonly Verdict[] = ['perfect', 'early', 'late', 'wrong'];
const TEMPERATURES: readonly Temperature[] = ['cold', 'hot'];
const ITEM_PHASES: readonly ItemPhase[] = ['probe', 'review', 'learning', 'consolidation', 'free'];
const SESSION_KINDS: readonly SessionKind[] = ['learn', 'free'];
const SCHEDULING_STATES: readonly number[] = [0, 1, 2, 3];
/** Exports made before 2026-10-04 can hold the dropped 1-beat step; the import moves it to 2. */
const CARD_LEADS: readonly number[] = [...LEAD_STEPS, 1];

function isFields(value: unknown): value is Fields {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): boolean {
	return value === null || isFiniteNumber(value);
}

function isOneOf(value: unknown, allowed: readonly unknown[]): boolean {
	return allowed.includes(value);
}

function parseKey(key: unknown): Target | null {
	if (typeof key !== 'string') return null;
	try {
		return parseCardKey(key);
	} catch {
		return null;
	}
}

function sameTarget(expected: Target, target: Fields): boolean {
	return expected.direction === 'locate'
		? target.direction === 'locate' &&
				target.string === expected.string &&
				target.pitch === expected.pitch
		: target.direction === 'identify' &&
				target.string === expected.string &&
				target.fret === expected.fret;
}

function checkTarget(key: unknown, target: unknown, keyField: string): string | null {
	const expected = parseKey(key);
	if (!expected) return `${keyField} is not a valid card key`;
	if (!isFields(target) || !sameTarget(expected, target))
		return `target does not match ${keyField}`;
	return null;
}

function checkSettings(settings: Fields): string | null {
	if (!isOneOf(settings.locale, LOCALES)) return 'locale must be "fr" or "en"';
	if (!isFiniteNumber(settings.tempoBpm) || settings.tempoBpm <= 0) {
		return 'tempoBpm must be a positive number';
	}
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
	return null;
}

function checkCard(card: Fields): string | null {
	const targetProblem = checkTarget(card.key, card.target, 'key');
	if (targetProblem) return targetProblem;
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

function checkAttempt(attempt: Fields): string | null {
	if (attempt.id !== undefined && !(Number.isInteger(attempt.id) && Number(attempt.id) > 0)) {
		return 'id must be a positive integer';
	}
	if (typeof attempt.sessionId !== 'string') return 'sessionId must be a string';
	const targetProblem = checkTarget(attempt.cardKey, attempt.target, 'cardKey');
	if (targetProblem) return targetProblem;
	if (!isOneOf(attempt.phase, ITEM_PHASES))
		return 'phase must be probe, review, learning, consolidation or free';
	if (!isOneOf(attempt.temperature, TEMPERATURES)) return 'temperature must be cold or hot';
	if (!isFiniteNumber(attempt.promptedAt)) return 'promptedAt must be a number';
	if (typeof attempt.correct !== 'boolean') return 'correct must be a boolean';
	if (!isOneOf(attempt.verdict, VERDICTS)) return 'verdict must be perfect, early, late or wrong';
	if (!isNullableNumber(attempt.reactionMs)) return 'reactionMs must be a number or null';
	return null;
}

function checkSession(session: Fields): string | null {
	if (typeof session.id !== 'string' || session.id === '') return 'id must be a non-empty string';
	if (!isOneOf(session.kind, SESSION_KINDS)) return 'kind must be learn or free';
	if (!isFiniteNumber(session.startedAt)) return 'startedAt must be a number';
	if (!isNullableNumber(session.endedAt)) return 'endedAt must be a number or null';
	if (typeof session.fatigueDetected !== 'boolean') return 'fatigueDetected must be a boolean';
	const tempoBpm = session.tempoBpm;
	if (tempoBpm !== undefined && tempoBpm !== null) {
		if (!isFiniteNumber(tempoBpm) || tempoBpm <= 0) {
			return 'tempoBpm must be a positive number or null';
		}
	}
	return null;
}

function checkEntries(
	value: unknown,
	field: string,
	check: (entry: Fields) => string | null
): void {
	if (!Array.isArray(value)) throw new Error(`Backup field "${field}" must be an array`);
	value.forEach((entry: unknown, index) => {
		const problem = isFields(entry) ? check(entry) : 'not an object';
		if (problem) throw new Error(`Invalid ${field} entry at index ${index}: ${problem}`);
	});
}

export function validateBackup(file: unknown): BackupFile {
	if (!isFields(file)) throw new Error('Backup file is not a JSON object');
	if (file.app !== 'neckspert-play') throw new Error('Not a Neckspert Play backup');
	if (file.version !== 1) throw new Error(`Unsupported backup version: ${String(file.version)}`);
	if (!isFiniteNumber(file.exportedAt)) throw new Error('Backup exportedAt must be a number');
	if (!isFields(file.settings)) throw new Error('Backup settings must be an object');
	const settingsProblem = checkSettings(file.settings);
	if (settingsProblem) throw new Error(`Invalid backup settings: ${settingsProblem}`);
	checkEntries(file.cards, 'cards', checkCard);
	checkEntries(file.attempts, 'attempts', checkAttempt);
	checkEntries(file.sessions, 'sessions', checkSession);
	return file as unknown as BackupFile;
}
