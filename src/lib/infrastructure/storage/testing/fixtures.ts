import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type BackupFile,
	type CardState,
	type IdentifyTarget,
	type LocateTarget,
	type SessionRecord,
	type Target
} from '$lib/domain/types';

export const LOCATE_TARGET: LocateTarget = { direction: 'locate', string: 2, pitch: 'F' };

export const IDENTIFY_TARGET: IdentifyTarget = { direction: 'identify', string: 5, fret: 8 };

export function makeAttempt(overrides: Partial<Attempt> = {}): Attempt {
	const target: Target = overrides.target ?? LOCATE_TARGET;
	return {
		sessionId: 's1',
		cardKey: cardKey(target),
		target,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: 1000,
		answer: { kind: 'note', midi: 65 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 10,
		reactionMs: 900,
		confusion: null,
		...overrides
	};
}

export function makeCard(overrides: Partial<CardState> = {}): CardState {
	const target: Target = overrides.target ?? LOCATE_TARGET;
	return {
		key: cardKey(target),
		target,
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
		acquiredAt: null,
		masteredAt: null,
		...overrides
	};
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: 's1',
		kind: 'daily',
		startedAt: 1000,
		endedAt: 2000,
		fatigueDetected: false,
		...overrides
	};
}

export function makeBackup(overrides: Partial<BackupFile> = {}): BackupFile {
	return {
		app: 'neckspert-play',
		version: 1,
		exportedAt: 5000,
		settings: { ...DEFAULT_SETTINGS },
		cards: [makeCard()],
		attempts: [makeAttempt({ id: 1 })],
		sessions: [makeSession()],
		...overrides
	};
}
