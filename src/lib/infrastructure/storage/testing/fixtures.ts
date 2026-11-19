import type { IdentifyItem, LocateItem } from '$lib/domain/music';
import { setOfSkill, type IdentifyData, type LocateData } from '$lib/domain/sets';
import {
	IDENTIFY_NECK_ID,
	IDENTIFY_SKILL_ID,
	LOCATE_NECK_ID,
	LOCATE_SKILL_ID,
	ROUTINE_NOTES_ID
} from '$lib/domain/exercise/catalogIds';
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type BackupFile,
	type CardState,
	type SessionRecord,
	type SkillId
} from '$lib/domain/types';
import type { LevelState } from '$lib/domain/time';
import type { BackupV7, ProgressionV10 } from '../migrations/v11';
import { RHYTHM_FIGURE_MECHANIC_V11, type CyclePlanRecordV11 } from '../migrations/v12';
import { MECHANICS_V12 } from '../migrations/v13';

export const LOCATE_ITEM: LocateItem = { string: 2, pitch: 'F' };

export const IDENTIFY_ITEM: IdentifyItem = { string: 5, fret: 8 };

function keyOf(skill: SkillId, item: unknown): string {
	return cardKey(skill, setOfSkill(skill).itemKey(item));
}

/** A card key as versions 1 to 12 wrote it: prefixed by its mechanic. */
function keyOfV12(mechanic: string, item: unknown): string {
	const rules = MECHANICS_V12.find((frozen) => frozen.id === mechanic);
	if (!rules) throw new Error(`no frozen mechanic ${mechanic}`);
	return `${mechanic}:${rules.itemKey(item)}`;
}

function defaultItem(skill: SkillId): unknown {
	return skill === IDENTIFY_SKILL_ID ? IDENTIFY_ITEM : LOCATE_ITEM;
}

/** A correct cold locate attempt on LOCATE_ITEM; the identify skill gives one on IDENTIFY_ITEM. */
export function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
	const skill = overrides.skill ?? LOCATE_SKILL_ID;
	const identify = skill === IDENTIFY_SKILL_ID;
	const data: LocateData | IdentifyData = identify
		? { item: IDENTIFY_ITEM, answer: { pitch: 'F' }, confusion: null }
		: { item: LOCATE_ITEM, answer: { midi: 65 }, confusion: null };
	const finalData = (overrides.data ?? data) as { item: unknown };
	return {
		sessionId: 's1',
		exerciseId: identify ? IDENTIFY_NECK_ID : LOCATE_NECK_ID,
		skill,
		cardKey: overrides.cardKey ?? keyOf(skill, finalData.item),
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

/** A learned locate card on LOCATE_ITEM; the identify skill gives one on IDENTIFY_ITEM. */
export function makeCard(overrides: Partial<CardState> = {}): CardState {
	const skill = overrides.skill ?? LOCATE_SKILL_ID;
	const item = overrides.item ?? defaultItem(skill);
	return {
		key: overrides.key ?? keyOf(skill, item),
		skill,
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

/** The ids versions 1 to 12 gave the two neck exercises. */
const LOCATE_NECK_ID_V12 = 'locate-neck';
const IDENTIFY_NECK_ID_V12 = 'identify-neck';

/**
 * An attempt as versions 1 to 12 stored it: named by its mechanic, its card key prefixed by it,
 * its exercise by its id then.
 * A correct cold locate attempt on LOCATE_ITEM; `mechanic: 'identify'` gives one on IDENTIFY_ITEM.
 */
export function makeAttemptV12(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const mechanic = (overrides.mechanic as string | undefined) ?? 'locate';
	const live = makeAttempt({
		skill: mechanic === 'identify' ? IDENTIFY_SKILL_ID : LOCATE_SKILL_ID
	});
	const { skill: _skill, cardKey: _cardKey, ...fields } = live;
	const data = (overrides.data ?? fields.data) as { item: unknown };
	const exerciseId = mechanic === 'identify' ? IDENTIFY_NECK_ID_V12 : LOCATE_NECK_ID_V12;
	return { ...fields, exerciseId, mechanic, cardKey: keyOfV12(mechanic, data.item), ...overrides };
}

/**
 * A card as versions 6 to 12 stored it: named by its mechanic, its key prefixed by it. A learned
 * locate card on LOCATE_ITEM; `mechanic: 'identify'` gives one on IDENTIFY_ITEM.
 */
export function makeCardV12(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const mechanic = (overrides.mechanic as string | undefined) ?? 'locate';
	const live = makeCard({ skill: mechanic === 'identify' ? IDENTIFY_SKILL_ID : LOCATE_SKILL_ID });
	const { skill: _skill, key: _key, ...fields } = live;
	const item = overrides.item ?? fields.item;
	return { ...fields, mechanic, key: keyOfV12(mechanic, item), item, ...overrides };
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: 's1',
		routine: ROUTINE_NOTES_ID,
		startedAt: 1000,
		endedAt: 2000,
		fatigueDetected: false,
		executions: [
			{ exerciseId: LOCATE_NECK_ID, tempoBpm: 80 },
			{ exerciseId: IDENTIFY_NECK_ID, tempoBpm: null }
		],
		latencyMs: 0,
		...overrides
	};
}

/** A session as versions 2 to 12 stored it: its kind, its exercises by their ids then. */
export function makeSessionV12(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const { routine: _routine, ...fields } = makeSession();
	return {
		...fields,
		kind: 'learn',
		executions: [
			{ exerciseId: LOCATE_NECK_ID_V12, tempoBpm: 80 },
			{ exerciseId: IDENTIFY_NECK_ID_V12, tempoBpm: null }
		],
		...overrides
	};
}

/** A tempo progression as versions 2 to 6 of the backup hold it. */
export function makeProgressionV6(overrides: Partial<ProgressionV10> = {}): ProgressionV10 {
	return {
		exerciseId: LOCATE_NECK_ID_V12,
		mechanic: 'locate',
		tempoBpm: 96,
		updatedAt: 1000,
		...overrides
	};
}

export function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
	return {
		app: 'neckspert-play',
		version: 9,
		exportedAt: 5000,
		settings: { ...DEFAULT_SETTINGS },
		cards: [makeCard()],
		attempts: [makeAttempt({ id: 1 })],
		sessions: [makeSession()],
		levelStates: [],
		...overrides
	};
}

/**
 * A version 8 export: cards and attempts named by their mechanic, keyed by it; sessions by their
 * kind; exercises by their ids then.
 */
export function makeBackupV8(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		...makeBackup(),
		version: 8,
		cards: [makeCardV12()],
		attempts: [makeAttemptV12({ id: 1 })],
		sessions: [makeSessionV12()],
		...overrides
	};
}

/** A version 7 export: its rhythm attempts are of the version-11 rhythm mechanic, with a cycle plan. */
export function makeBackupV7(overrides: Record<string, unknown> = {}): BackupV7 {
	return { ...makeBackupV8(), version: 7, ...overrides } as unknown as BackupV7;
}

/** A version 6 export: its tempo progressions; attempts may hold a `tempoScope`. */
export function makeBackupV6(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...makeBackupV7(), version: 6, progressions: [makeProgressionV6()], ...overrides };
}

/** A card as versions 1 to 5 of the backup hold it: with its lead, 8 by default. */
export function makeCardV5(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...makeCardV12(overrides), leadBeats: 8, ...overrides };
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
 * A cycle of each rhythm exercise as versions 8 to 11 stored its plan (`CyclePlanRecordV11`): the
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

/**
 * A rhythm attempt as versions 8 to 11 stored it: of the version-11 rhythm mechanic
 * (`RHYTHM_FIGURE_MECHANIC_V11`), a cycle plan.
 */
export function makeCycleAttemptV11(
	overrides: Record<string, unknown> = {}
): Record<string, unknown> {
	const { exerciseId, level, figureId, record } = CYCLE_PLANS_V11[2];
	return {
		...makeAttemptV12({ id: 1 }),
		exerciseId,
		mechanic: RHYTHM_FIGURE_MECHANIC_V11,
		cardKey: `${RHYTHM_FIGURE_MECHANIC_V11}:${figureId}@${level}`,
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
