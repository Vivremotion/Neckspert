import type { IdentifyItem, LocateItem } from '$lib/domain/music';
import { mechanicRules, type IdentifyData, type LocateData } from '$lib/domain/mechanics';
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type BackupFile,
	type CardState,
	type MechanicId,
	type SessionRecord
} from '$lib/domain/types';
import type { LevelState } from '$lib/domain/time';
import type { BackupV7, ProgressionV10 } from '../migrations/v11';
import type { CyclePlanRecordV11 } from '../migrations/v12';

export const LOCATE_ITEM: LocateItem = { string: 2, pitch: 'F' };

export const IDENTIFY_ITEM: IdentifyItem = { string: 5, fret: 8 };

function keyOf(mechanic: MechanicId, item: unknown): string {
	return cardKey(mechanic, mechanicRules(mechanic).itemKey(item));
}

function defaultItem(mechanic: MechanicId): unknown {
	return mechanic === 'identify' ? IDENTIFY_ITEM : LOCATE_ITEM;
}

/** A correct cold locate attempt on LOCATE_ITEM; `mechanic: 'identify'` gives one on IDENTIFY_ITEM. */
export function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
	const mechanic = overrides.mechanic ?? 'locate';
	const identify = mechanic === 'identify';
	const data: LocateData | IdentifyData = identify
		? { item: IDENTIFY_ITEM, answer: { pitch: 'F' }, confusion: null }
		: { item: LOCATE_ITEM, answer: { midi: 65 }, confusion: null };
	const finalData = (overrides.data ?? data) as { item: unknown };
	return {
		sessionId: 's1',
		exerciseId: identify ? 'identify-neck' : 'locate-neck',
		mechanic,
		cardKey: keyOf(mechanic, finalData.item),
		phase: 'review',
		temperature: 'cold',
		aids: [],
		promptedAt: 1000,
		tempoBpm: identify ? null : 80,
		leadBeats: identify ? null : 2,
		timingOffsetMs: identify ? null : 10,
		reactionMs: 900,
		correct: true,
		success: true,
		verdict: { relation: identify ? 'free' : 'beat', version: 1, value: 'perfect' },
		measures: {},
		plan: null,
		data,
		observations: [],
		...overrides
	};
}

/** A learned locate card on LOCATE_ITEM; `mechanic: 'identify'` gives one on IDENTIFY_ITEM. */
export function makeCard(overrides: Partial<CardState> = {}): CardState {
	const mechanic = overrides.mechanic ?? 'locate';
	const item = overrides.item ?? defaultItem(mechanic);
	return {
		key: keyOf(mechanic, item),
		mechanic,
		item,
		introducedAt: 1000,
		introducedInSession: 's1',
		scheduling: {
			due: 3_601_000,
			stability: 0,
			difficulty: 0,
			elapsedDays: 0,
			scheduledDays: 0,
			learningSteps: 0,
			reps: 0,
			lapses: 0,
			state: 0,
			lastReview: null
		},
		learnedAt: 1000,
		acquiredAt: null,
		masteredAt: null,
		...overrides
	};
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: 's1',
		kind: 'learn',
		startedAt: 1000,
		endedAt: 2000,
		fatigueDetected: false,
		executions: [
			{ exerciseId: 'locate-neck', tempoBpm: 80 },
			{ exerciseId: 'identify-neck', tempoBpm: null }
		],
		latencyMs: 0,
		...overrides
	};
}

/** A tempo progression as versions 2 to 6 of the backup hold it. */
export function makeProgressionV6(overrides: Partial<ProgressionV10> = {}): ProgressionV10 {
	return {
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		tempoBpm: 96,
		updatedAt: 1000,
		...overrides
	};
}

export function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
	return {
		app: 'neckspert-play',
		version: 8,
		exportedAt: 5000,
		settings: { ...DEFAULT_SETTINGS },
		cards: [makeCard()],
		attempts: [makeAttempt({ id: 1 })],
		sessions: [makeSession()],
		levelStates: [],
		...overrides
	};
}

/** A version 7 export: its rhythm attempts are of the mechanic `rhythm-figure`, with a cycle plan. */
export function makeBackupV7(overrides: Record<string, unknown> = {}): BackupV7 {
	return { ...makeBackup(), version: 7, ...overrides } as unknown as BackupV7;
}

/** A version 6 export: its tempo progressions; attempts may hold a `tempoScope`. */
export function makeBackupV6(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...makeBackupV7(), version: 6, progressions: [makeProgressionV6()], ...overrides };
}

/** A card as versions 1 to 5 of the backup hold it: with its lead, 8 by default. */
export function makeCardV5(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...makeCard(overrides as Partial<CardState>), leadBeats: 8, ...overrides };
}

/** A version 5 export: its cards hold their lead, no triad card has a level state. */
export function makeBackupV5(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...makeBackupV6(), version: 5, cards: [makeCardV5()], ...overrides };
}

/** A version 4 export: the level states hold the exercises' own, no neck card has one. */
export function makeBackupV4(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...makeBackupV5(), version: 4, ...overrides };
}

/**
 * A version 3 export: one calibrated offset in the settings, no level states. Its attempts are
 * at the target model, as the recorder wrote them before version 4.
 */
export function makeBackupV3(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const { settings, levelStates: _levelStates, ...rest } = makeBackupV5() as unknown as BackupFile;
	const { latency: _latency, clickBleed: _clickBleed, ...kept } = settings;
	return {
		...rest,
		version: 3,
		settings: { ...kept, calibrationOffsetMs: null },
		...overrides
	};
}

/** A version 2 export: attempts without observations, sessions without latency. */
export function makeBackupV2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const { attempts, sessions, ...rest } = makeBackupV3() as unknown as BackupFile;
	return {
		...rest,
		version: 2,
		attempts: attempts.map(({ observations: _observations, ...attempt }) => attempt),
		sessions: sessions.map(({ latencyMs: _latencyMs, ...session }) => session),
		...overrides
	};
}

/** The level state of a rhythm exercise: no scope, no item, at level 1. */
export function makeLevelState(overrides: Partial<LevelState> = {}): LevelState {
	return {
		exerciseId: 'rhythm-silent-bars',
		scope: '',
		item: '',
		level: 0,
		successes: 2,
		failures: 0,
		resumeAfter: null,
		...overrides
	};
}

/**
 * A 4/4 figure as versions 8 to 11 stored it (`figureToJson`, schema 2, no pitch): its one voice
 * written as durations, `r` before a rest's.
 */
function storedFigureV11(bars: number, elements: string): unknown {
	return {
		schema: 2,
		meter: { count: 4, unit: '1/4', grouping: [1, 1, 1, 1] },
		bars,
		voices: [
			{
				id: 'main',
				elements: elements
					.split(' ')
					.map((written) =>
						written.startsWith('r')
							? { kind: 'rest', duration: written.slice(1) }
							: { kind: 'note', duration: written, content: null }
					)
			}
		]
	};
}

/** The click of 4/4 on every beat, the first accented, as versions 8 to 11 stored it. */
const EVERY_BEAT_V11 = {
	schema: 2,
	meter: { count: 4, unit: '1/4', grouping: [1, 1, 1, 1] },
	bars: 1,
	voices: [
		{
			id: 'click',
			elements: [
				{ kind: 'note', duration: '1/4', content: 'click-accent' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' },
				{ kind: 'note', duration: '1/4', content: 'click' }
			]
		}
	]
};

/** The thresholds the rhythm exercises started from at version 11. */
const BASE_THRESHOLDS_V11 = { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 };

/**
 * A cycle of each rhythm exercise as versions 8 to 11 stored its plan (`CyclePlanRecord`): the
 * exercise level and the figure it was played at, and its record. Silent bars at level 2 from
 * the first of its two silent bars; the first line of « 2 et 4 » at ♩ = 120, kept before the
 * audio start was; two bars of offbeats from the second.
 */
export const CYCLE_PLANS_V11: readonly {
	exerciseId: string;
	level: number;
	figureId: string;
	record: CyclePlanRecordV11;
}[] = [
	{
		exerciseId: 'rhythm-silent-bars',
		level: 1,
		figureId: 'eighths',
		record: {
			figureId: 'eighths',
			figure: storedFigureV11(1, '1/8 1/8 1/8 1/8 1/8 1/8 1/8 1/8'),
			cycleBars: 4,
			startBar: 2,
			accompaniment: { figure: EVERY_BEAT_V11, bars: ['on', 'on', 'off', 'off'] },
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			window: { ms: 80 },
			thresholds: BASE_THRESHOLDS_V11,
			startAudioS: 12.5
		}
	},
	{
		exerciseId: 'rhythm-two-four',
		level: 2,
		figureId: 'line-1',
		record: {
			figureId: 'line-1',
			figure: storedFigureV11(4, '1/4 1/4 1/4 1/4 1/4 1/4 1/2 1/2 1/4 1/4 1/4 1/4 1/4 1/4'),
			cycleBars: 4,
			startBar: 0,
			accompaniment: {
				figure: {
					...EVERY_BEAT_V11,
					voices: [
						{
							id: 'click',
							elements: [
								{ kind: 'rest', duration: '1/4' },
								{ kind: 'note', duration: '1/4', content: 'click' },
								{ kind: 'rest', duration: '1/4' },
								{ kind: 'note', duration: '1/4', content: 'click' }
							]
						}
					]
				},
				bars: ['on']
			},
			tempo: { at: '0', bpm: 120, unit: '1/4' },
			window: { ms: 80 },
			thresholds: BASE_THRESHOLDS_V11
		}
	},
	{
		exerciseId: 'rhythm-offbeats',
		level: 2,
		figureId: 'offbeats-2',
		record: {
			figureId: 'offbeats-2',
			figure: storedFigureV11(
				2,
				'1/8 1/8 r1/8 1/8 r1/8 1/8 r1/8 1/8 r1/8 1/8 r1/8 1/8 r1/8 1/8 r1/8 1/8'
			),
			cycleBars: 2,
			startBar: 1,
			accompaniment: { figure: EVERY_BEAT_V11, bars: ['on'] },
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			window: { ms: 80 },
			thresholds: BASE_THRESHOLDS_V11,
			startAudioS: 3.25
		}
	}
];

/** A rhythm attempt as versions 8 to 11 stored it: of the mechanic `rhythm-figure`, a cycle plan. */
export function makeCycleAttemptV11(
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	const { exerciseId, level, figureId, record } = CYCLE_PLANS_V11[2];
	return {
		...makeAttempt({ id: 1 }),
		exerciseId,
		mechanic: 'rhythm-figure',
		cardKey: `rhythm-figure:${figureId}@${level}`,
		phase: 'free',
		temperature: 'hot',
		aids: ['cursor'],
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: 4,
		reactionMs: null,
		correct: null,
		success: true,
		verdict: { relation: 'cycle', version: 1, value: { passed: true } },
		measures: {},
		plan: record,
		data: { item: { figureId, level }, level, report: { expectations: [], extra: 0 } },
		...overrides
	};
}
