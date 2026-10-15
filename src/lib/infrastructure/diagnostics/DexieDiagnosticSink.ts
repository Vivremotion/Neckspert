import type {
	DiagnosticAudioChunk,
	DiagnosticSink,
	DiagnosticTakeNotices,
	DiagnosticTakeOpening,
	DiagnosticTakes
} from '$lib/application/ports';
import { DIAGNOSTICS_DB_NAME, DiagnosticsDb, type DiagnosticTakeRow } from './diagnosticsDb';

const BYTES_PER_MB = 1024 * 1024;

/** The journal's settings, the build default already applied. */
export interface ResolvedDiagnosticsSettings {
	enabled: boolean;
	budgetMb: number;
}

/** The take being recorded, as counted in memory. */
interface OpenTake {
	id: string;
	bytes: number;
	truncated: boolean;
	budgetBytes: number;
}

/**
 * The diagnostic journal in its own IndexedDB database. A take is recorded only when the
 * setting is on at its opening; writes go through one serialized queue, never awaited by the
 * producers. At each closing, the oldest takes are erased whole until the total fits the budget.
 */
export class DexieDiagnosticSink implements DiagnosticSink, DiagnosticTakes, DiagnosticTakeNotices {
	private readonly db: DiagnosticsDb;
	private readonly settings: () => Promise<ResolvedDiagnosticsSettings>;
	private readonly newId: () => string;
	private queue: Promise<void> = Promise.resolve();
	/** The take producers write to; null as soon as a closing is asked for. */
	private open: OpenTake | null = null;
	/** The last take opened in the database and not yet closed there (queue side). */
	private current: OpenTake | null = null;
	/** Counts openings, closings and clearings: an opening that settles late is not current. */
	private ticket = 0;
	private readonly takeListeners = new Set<(enabled: boolean) => void>();

	constructor(options: {
		name?: string;
		settings: () => Promise<ResolvedDiagnosticsSettings>;
		newId: () => string;
	}) {
		this.db = new DiagnosticsDb(options.name ?? DIAGNOSTICS_DB_NAME);
		this.settings = options.settings;
		this.newId = options.newId;
	}

	get enabled(): boolean {
		return this.open !== null;
	}

	onTake(listener: (enabled: boolean) => void): () => void {
		this.takeListeners.add(listener);
		return () => this.takeListeners.delete(listener);
	}

	private notifyTake(enabled: boolean): void {
		[...this.takeListeners].forEach((listener) => listener(enabled));
	}

	openTake(opening: DiagnosticTakeOpening): Promise<void> {
		const ticket = ++this.ticket;
		this.open = null;
		const settled = this.enqueue(async () => {
			if (this.current) await this.close(this.current, opening.startedAt);
			const settings = await this.settings();
			if (!settings.enabled) return;
			const row: DiagnosticTakeRow = {
				id: this.newId(),
				startedAt: opening.startedAt,
				startedAudioTime: opening.startedAudioTime,
				endedAt: null,
				input: opening.input,
				bytes: 0,
				truncated: false
			};
			await this.db.takes.add(row);
			this.current = {
				id: row.id,
				bytes: 0,
				truncated: false,
				budgetBytes: settings.budgetMb * BYTES_PER_MB
			};
			// Closed or cleared while it was opening: the queued closing ends it.
			if (ticket === this.ticket) this.open = this.current;
		});
		// An opening overtaken by a closing, a clearing or another opening says nothing: they do.
		return settled.then(() => {
			if (ticket === this.ticket) this.notifyTake(this.open !== null);
		});
	}

	closeTake(endedAt: number): Promise<void> {
		// Off at once: what comes after the closing belongs to no take.
		this.ticket++;
		this.open = null;
		this.notifyTake(false);
		return this.enqueue(async () => {
			if (this.current) await this.close(this.current, endedAt);
		});
	}

	event(kind: string, audioTime: number, data: unknown): void {
		const take = this.open;
		if (!take) return;
		let size: number;
		try {
			size = JSON.stringify({ kind, audioTime, data }).length;
		} catch {
			return;
		}
		take.bytes += size;
		const bytes = take.bytes;
		this.enqueue(() =>
			this.db.transaction('rw', this.db.events, this.db.takes, async () => {
				await this.db.events.add({ takeId: take.id, audioTime, kind, data });
				await this.db.takes.update(take.id, { bytes });
			})
		);
	}

	audio(chunk: DiagnosticAudioChunk): void {
		const take = this.open;
		if (!take || take.truncated) return;
		const size = chunk.samples.byteLength;
		if (take.bytes + size > take.budgetBytes) {
			take.truncated = true;
			this.enqueue(async () => {
				await this.db.takes.update(take.id, { truncated: true });
			});
			return;
		}
		take.bytes += size;
		const bytes = take.bytes;
		this.enqueue(() =>
			this.db.transaction('rw', this.db.audio, this.db.takes, async () => {
				await this.db.audio.add({ takeId: take.id, ...chunk });
				await this.db.takes.update(take.id, { bytes });
			})
		);
	}

	async usage(): Promise<{ bytes: number; takes: number }> {
		const takes = await this.takes();
		return { bytes: takes.reduce((sum, take) => sum + take.bytes, 0), takes: takes.length };
	}

	/** Erases every take; the one being recorded, if any, stops being recorded. */
	clear(): Promise<void> {
		this.ticket++;
		this.open = null;
		this.notifyTake(false);
		return this.enqueue(async () => {
			this.current = null;
			await this.db.transaction('rw', this.db.takes, this.db.events, this.db.audio, async () => {
				await Promise.all([this.db.takes.clear(), this.db.events.clear(), this.db.audio.clear()]);
			});
		});
	}

	/** Oldest first. */
	async takes(): Promise<DiagnosticTakeRow[]> {
		await this.queue;
		return this.db.takes.orderBy('startedAt').toArray();
	}

	async eventsOf(takeId: string): Promise<{ audioTime: number; kind: string; data: unknown }[]> {
		await this.queue;
		const rows = await this.db.events.where('takeId').equals(takeId).sortBy('id');
		return rows.map(({ audioTime, kind, data }) => ({ audioTime, kind, data }));
	}

	async audioOf(takeId: string): Promise<DiagnosticAudioChunk[]> {
		await this.queue;
		const rows = await this.db.audio.where('takeId').equals(takeId).sortBy('id');
		return rows.map(({ audioTime, sampleRate, samples }) => ({ audioTime, sampleRate, samples }));
	}

	private async close(take: OpenTake, endedAt: number): Promise<void> {
		if (this.current === take) this.current = null;
		if (this.open === take) this.open = null;
		await this.db.takes.update(take.id, {
			endedAt,
			bytes: take.bytes,
			truncated: take.truncated
		});
		await this.prune(take.budgetBytes, take.id);
	}

	/** Erases the oldest takes, whole, until the total fits; never `keep` nor the open take. */
	private async prune(budgetBytes: number, keep: string): Promise<void> {
		const takes = await this.db.takes.orderBy('startedAt').toArray();
		let total = takes.reduce((sum, take) => sum + take.bytes, 0);
		for (const take of takes) {
			if (total <= budgetBytes) return;
			if (take.id === keep || take.id === this.open?.id) continue;
			await this.db.transaction('rw', this.db.takes, this.db.events, this.db.audio, async () => {
				await this.db.events.where('takeId').equals(take.id).delete();
				await this.db.audio.where('takeId').equals(take.id).delete();
				await this.db.takes.delete(take.id);
			});
			total -= take.bytes;
		}
	}

	/** Runs after every earlier write; a failed write is dropped, never blocks the next ones. */
	private enqueue(job: () => Promise<unknown>): Promise<void> {
		const run = this.queue.then(job).then(
			() => undefined,
			(error: unknown) => console.warn('Diagnostic journal write failed', error)
		);
		this.queue = run;
		return run;
	}
}
