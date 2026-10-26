import type {
	Attempt,
	CardState,
	Execution,
	Progression,
	SessionRecord,
	Settings
} from '$lib/domain/types';
import { withoutLegacyLead } from '../legacyLead';

/**
 * The exercises version 1 data was played in, by its target direction. Frozen here on purpose:
 * old data maps to version 1 of these exercises whatever the catalog becomes.
 */
export const V1_EXERCISE_IDS = { locate: 'locate-neck', identify: 'identify-neck' } as const;

type V1Direction = keyof typeof V1_EXERCISE_IDS;

type Row = Record<string, unknown>;

/** The four tables as Dexie versions 2 to 4 stored them, and as backup version 1 holds them. */
export interface V1Data {
	settings: Row;
	cards: Row[];
	attempts: Row[];
	sessions: Row[];
}

export interface V1Backup extends V1Data {
	app: 'neckspert-play';
	version: 1;
	exportedAt: number;
}

export interface V1Conversion {
	settings: Partial<Settings>;
	progressions: Progression[];
	cards: CardState[];
	attempts: Attempt[];
	sessions: SessionRecord[];
}

function isPositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRow(value: unknown): value is Row {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isV1Direction(value: unknown): value is V1Direction {
	return value === 'locate' || value === 'identify';
}

/** Splits a v1 target into its mechanic and its item; throws, naming the row, otherwise. */
function splitTarget(target: unknown, row: string): { mechanic: V1Direction; item: Row } {
	const direction = isRow(target) ? target.direction : undefined;
	if (!isRow(target) || !isV1Direction(direction)) {
		throw new Error(`Cannot convert v1 ${row}: unknown direction ${String(direction)}`);
	}
	const { direction: _direction, ...item } = target;
	return { mechanic: direction, item };
}

/** A v1 answer carried its kind (`note`, `name`); the mechanic now says it. */
function withoutKind(answer: unknown): Row | null {
	if (!isRow(answer)) return null;
	const { kind: _kind, ...rest } = answer;
	return rest;
}

/** Version 1 bounds the stored tempo to 80–160 bpm, rounded; frozen with the format. */
const LEGACY_TEMPO_MIN_BPM = 80;
const LEGACY_TEMPO_MAX_BPM = 160;
const LEGACY_DEFAULT_TEMPO_BPM = 80;

function clampLegacyTempo(bpm: number): number {
	return Math.min(LEGACY_TEMPO_MAX_BPM, Math.max(LEGACY_TEMPO_MIN_BPM, Math.round(bpm)));
}

/** One conversion for the Dexie upgrade and the v1 import. */
export function convertV1(data: V1Data, now: number): V1Conversion {
	const { tempoBpm: settingsTempo, ...settings } = data.settings;
	const storedTempo = isPositiveNumber(settingsTempo) ? clampLegacyTempo(settingsTempo) : null;
	const fallbackTempo = storedTempo ?? LEGACY_DEFAULT_TEMPO_BPM;

	const sessionTempos = new Map<unknown, number>();
	for (const session of data.sessions) {
		if (isPositiveNumber(session.tempoBpm)) sessionTempos.set(session.id, session.tempoBpm);
	}
	const locateTempo = (sessionId: unknown): number => sessionTempos.get(sessionId) ?? fallbackTempo;

	const progressions: Progression[] =
		storedTempo === null
			? []
			: [
					{
						exerciseId: V1_EXERCISE_IDS.locate,
						mechanic: 'locate',
						tempoBpm: storedTempo,
						updatedAt: now
					}
				];

	const cards = data.cards.map((row): CardState => {
		const { target, ...rest } = row;
		const { mechanic, item } = splitTarget(target, `card ${String(row.key)}`);
		return withoutLegacyLead({ ...rest, mechanic, item } as unknown as CardState);
	});

	const attempts = data.attempts.map((row): Attempt => {
		const { target, answer, confusion, ...rest } = row;
		const { mechanic, item } = splitTarget(target, `attempt ${String(row.id ?? row.cardKey)}`);
		return {
			...rest,
			exerciseId: V1_EXERCISE_IDS[mechanic],
			mechanic,
			tempoBpm: mechanic === 'locate' ? locateTempo(row.sessionId) : null,
			data: { item, answer: withoutKind(answer), confusion: confusion ?? null }
		} as unknown as Attempt;
	});

	const sessions = data.sessions.map((row): SessionRecord => {
		const { tempoBpm: _tempo, ...rest } = row;
		const executions: Execution[] = [
			{ exerciseId: V1_EXERCISE_IDS.locate, tempoBpm: locateTempo(row.id) },
			{ exerciseId: V1_EXERCISE_IDS.identify, tempoBpm: null }
		];
		return { ...rest, executions } as unknown as SessionRecord;
	});

	return { settings: settings as Partial<Settings>, progressions, cards, attempts, sessions };
}
