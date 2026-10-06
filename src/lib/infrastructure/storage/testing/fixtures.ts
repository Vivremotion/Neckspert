import type { IdentifyItem, LocateItem } from '$lib/domain/music';
import { mechanicRules, type IdentifyData, type LocateData } from '$lib/domain/mechanics';
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type BackupFile,
	type CardState,
	type MechanicId,
	type Progression,
	type SessionRecord
} from '$lib/domain/types';

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
		aid: 'none',
		promptedAt: 1000,
		tempoBpm: identify ? null : 80,
		leadBeats: identify ? null : 2,
		timingOffsetMs: identify ? null : 10,
		reactionMs: 900,
		correct: true,
		verdict: 'perfect',
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
		leadBeats: 8,
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

export function makeProgression(overrides: Partial<Progression> = {}): Progression {
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
		version: 3,
		exportedAt: 5000,
		settings: { ...DEFAULT_SETTINGS },
		progressions: [makeProgression()],
		cards: [makeCard()],
		attempts: [makeAttempt({ id: 1 })],
		sessions: [makeSession()],
		...overrides
	};
}

/** A version 2 export: attempts without observations, sessions without latency. */
export function makeBackupV2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const { attempts, sessions, ...rest } = makeBackup();
	return {
		...rest,
		version: 2,
		attempts: attempts.map(({ observations: _observations, ...attempt }) => attempt),
		sessions: sessions.map(({ latencyMs: _latencyMs, ...session }) => session),
		...overrides
	};
}
