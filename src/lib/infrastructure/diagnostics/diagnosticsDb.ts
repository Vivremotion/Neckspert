import Dexie, { type EntityTable } from 'dexie';
import type { DiagnosticInputInfo } from '$lib/application/ports';

/** Kept apart from the learning database, and never in the backup. */
export const DIAGNOSTICS_DB_NAME = 'neckspert-play-diagnostics';

/** One opening of the input, from start to stop. */
export interface DiagnosticTakeRow {
	id: string;
	/** Wall-clock time (ms) of the opening. */
	startedAt: number;
	/** Audio time (s) at the same instant: joins attempts (wall clock) to the sound (audio time). */
	startedAudioTime: number;
	endedAt: number | null;
	input: DiagnosticInputInfo;
	/** Sound bytes plus the JSON length of the events. */
	bytes: number;
	/** True once the take alone reached the budget: its sound stopped, its events went on. */
	truncated: boolean;
}

export interface DiagnosticEventRow {
	id?: number;
	takeId: string;
	audioTime: number;
	kind: string;
	data: unknown;
}

export interface DiagnosticAudioRow {
	id?: number;
	takeId: string;
	audioTime: number;
	sampleRate: number;
	samples: Int16Array;
}

export class DiagnosticsDb extends Dexie {
	takes!: EntityTable<DiagnosticTakeRow, 'id'>;
	events!: EntityTable<DiagnosticEventRow, 'id'>;
	audio!: EntityTable<DiagnosticAudioRow, 'id'>;

	constructor(name: string) {
		super(name);
		this.version(1).stores({
			takes: 'id, startedAt',
			events: '++id, takeId',
			audio: '++id, takeId'
		});
	}
}
