import type { OracleReport } from '$lib/application/ports';
import {
	DEFAULT_SETTINGS,
	type Attempt,
	type CardKey,
	type CardState,
	type ExerciseId,
	type LevelState,
	type Progression,
	type RecordedObservation,
	type SessionRecord,
	type Settings,
	type ResponseVerdict
} from '$lib/domain/types';
import type {
	AttackDetectorPort,
	AttackEvent,
	AttemptRepositoryPort,
	AudioClockPort,
	AudioInputDevice,
	CardStateRepositoryPort,
	LevelStateRepositoryPort,
	ChordExpectation,
	ChordReport,
	ChordVerifierPort,
	DiagnosticAudioChunk,
	DiagnosticSink,
	DiagnosticTakeOpening,
	DiagnosticTakeNotices,
	DiagnosticTakes,
	NoteDetectorPort,
	NoteOnset,
	NoteRejection,
	ProgressionRepositoryPort,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundSchedulerPort,
	TakeBufferPort
} from '$lib/application/ports';
import type { ScheduledSound, SoundId } from '$lib/domain/time';
import type { DiagnosticsService } from '$lib/application/app';

export class FakeClock implements AudioClockPort {
	time = 0;
	epochAtZero = Date.UTC(2026, 0, 1);

	async resume(): Promise<void> {}

	async settle(): Promise<void> {}

	now(): number {
		return this.time;
	}

	toEpochMs(audioTime: number): number {
		return this.epochAtZero + audioTime * 1000;
	}

	epochNow(): number {
		return this.toEpochMs(this.now());
	}

	advance(seconds: number): void {
		this.time += seconds;
	}
}

/**
 * A clock whose audio context does not exist until `resume()`, as the browser's before a gesture:
 * `now()` and `toEpochMs()` throw until then; `epochNow()` reads the wall time all along.
 */
export class UnresumedClock extends FakeClock {
	resumed = false;

	override async resume(): Promise<void> {
		this.resumed = true;
	}

	override now(): number {
		if (!this.resumed) throw new Error('AudioContext not created yet');
		return super.now();
	}

	override toEpochMs(audioTime: number): number {
		if (!this.resumed) throw new Error('AudioContext not created yet');
		return super.toEpochMs(audioTime);
	}

	override epochNow(): number {
		return this.epochAtZero + this.time * 1000;
	}
}

export class FakeSoundScheduler implements SoundSchedulerPort {
	private log: ScheduledSound[] = [];
	private wakeUps: { time: number; callback: () => void }[] = [];

	constructor(private readonly clock: FakeClock) {}

	/** Like the real scheduler, a time already past is dropped and not logged. */
	play(time: number, sound: SoundId): void {
		if (time < this.clock.now()) return;
		this.log.push({ time, sound });
	}

	at(time: number, callback: () => void): () => void {
		const wakeUp = { time, callback };
		this.wakeUps.push(wakeUp);
		return () => {
			this.wakeUps = this.wakeUps.filter((w) => w !== wakeUp);
		};
	}

	cancelAll(): void {
		this.log = [];
		this.wakeUps = [];
	}

	emitted(): readonly ScheduledSound[] {
		return [...this.log];
	}

	/** Runs the wake-ups due up to `clock.now()`, earliest first (a tie in the order asked). */
	flush(): void {
		for (;;) {
			const now = this.clock.now();
			let due: { time: number; callback: () => void } | null = null;
			for (const w of this.wakeUps) {
				if (w.time <= now && (!due || w.time < due.time)) due = w;
			}
			if (!due) return;
			const done = due;
			this.wakeUps = this.wakeUps.filter((w) => w !== done);
			done.callback();
		}
	}
}

/**
 * A take buffer that keeps time spans, not samples: the input arrives with `hear(time)` and is
 * kept between each `keepFrom` and its end, as the real one does. `plays` says whether the span
 * asked was still whole when it was played.
 */
export class FakeTakeBuffer implements TakeBufferPort {
	/** Every `keepFrom`, `keepUntil` and `stopKeeping`, in order. */
	readonly kept: { method: 'keepFrom' | 'keepUntil' | 'stopKeeping'; time: number | null }[] = [];
	readonly plays: {
		from: number;
		to: number;
		sounds: readonly ScheduledSound[];
		latencyS: number;
		/** The whole span was kept when it was asked for. */
		whole: boolean;
	}[] = [];
	stops = 0;
	/** When true, a `play` resolves only on `release()` or `stop()`; else at once. */
	hold = false;
	/** The spans of input kept, oldest first. */
	spans: { from: number; to: number }[] = [];
	/** Whether the input is being kept (until the next `keepFrom` once stopped). */
	keeping = false;
	private from = -Infinity;
	private until = Infinity;
	private heard = -Infinity;
	private forgottenUntil = -Infinity;
	private pending: (() => void) | null = null;

	keepFrom(fromTime: number): void {
		this.kept.push({ method: 'keepFrom', time: fromTime });
		this.from = fromTime;
		this.until = Infinity;
		this.keeping = true;
	}

	keepUntil(toTime: number): void {
		this.kept.push({ method: 'keepUntil', time: toTime });
		this.until = toTime;
		const last = this.spans.at(-1);
		if (last && last.to > toTime) {
			last.to = Math.max(last.from, toTime);
			if (last.to <= last.from) this.spans.pop();
		}
	}

	stopKeeping(): void {
		this.kept.push({ method: 'stopKeeping', time: null });
		this.keeping = false;
	}

	clear(): void {
		this.spans = [];
		this.forgottenUntil = this.heard;
	}

	holds(from: number, to: number): boolean {
		return from >= this.forgottenUntil && to <= this.heard && from < to;
	}

	/** The input arrives up to `time` (audio s). */
	hear(time: number): void {
		const start = Math.max(this.heard, this.from);
		const end = Math.min(time, this.until);
		if (this.keeping && end > start) {
			const last = this.spans.at(-1);
			if (last && last.to >= start) last.to = end;
			else this.spans.push({ from: start, to: end });
		}
		this.heard = Math.max(this.heard, time);
	}

	play(
		from: number,
		to: number,
		sounds: readonly ScheduledSound[],
		latencyS: number
	): Promise<void> {
		const whole = this.spans.some((span) => span.from <= from && span.to >= to);
		this.plays.push({ from, to, sounds: [...sounds], latencyS, whole });
		if (!this.hold) return Promise.resolve();
		return new Promise((resolve) => (this.pending = resolve));
	}

	/** Ends the take under way, as if it had played to its end. */
	release(): void {
		const pending = this.pending;
		this.pending = null;
		pending?.();
	}

	stop(): void {
		this.stops++;
		this.release();
	}
}

/** Pitchless attacks a test emits by hand. */
export class FakeAttackDetector implements AttackDetectorPort {
	private readonly attackListeners = new Set<(attack: AttackEvent) => void>();

	/** How many callbacks are listening. */
	get listeners(): number {
		return this.attackListeners.size;
	}

	onAttack(callback: (attack: AttackEvent) => void): () => void {
		this.attackListeners.add(callback);
		return () => this.attackListeners.delete(callback);
	}

	emit(attack: AttackEvent): void {
		[...this.attackListeners].forEach((listener) => listener(attack));
	}
}

export class FakeNoteDetector implements NoteDetectorPort {
	running = false;
	deviceId: string | null = null;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly rejectionListeners = new Set<(rejection: NoteRejection) => void>();
	private readonly levelListeners = new Set<(rms: number) => void>();

	async listInputs(): Promise<AudioInputDevice[]> {
		return [{ id: 'fake-input', label: 'Fake input' }];
	}

	builtInGain = 1;

	async start(deviceId: string | null): Promise<void> {
		this.running = true;
		this.deviceId = deviceId;
	}

	setBuiltInGain(gain: number): void {
		this.builtInGain = gain;
	}

	stop(): void {
		this.running = false;
	}

	onNote(callback: (onset: NoteOnset) => void): () => void {
		this.noteListeners.add(callback);
		return () => this.noteListeners.delete(callback);
	}

	onRejected(callback: (rejection: NoteRejection) => void): () => void {
		this.rejectionListeners.add(callback);
		return () => this.rejectionListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}

	emitNote(onset: NoteOnset): void {
		if (!this.running) return;
		this.noteListeners.forEach((listener) => listener(onset));
	}

	emitRejection(rejection: NoteRejection): void {
		if (!this.running) return;
		this.rejectionListeners.forEach((listener) => listener(rejection));
	}

	emitLevel(rms: number): void {
		if (!this.running) return;
		this.levelListeners.forEach((listener) => listener(rms));
	}
}

export class FakeChordVerifier implements ChordVerifierPort {
	/** Every call to expect, in order. */
	readonly expectations: (ChordExpectation | null)[] = [];
	private readonly listeners = new Set<(report: ChordReport) => void>();

	expect(expectation: ChordExpectation | null): void {
		this.expectations.push(expectation);
	}

	onReport(callback: (report: ChordReport) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	emit(report: ChordReport): void {
		this.listeners.forEach((listener) => listener(report));
	}
}

/** Records everything it is given, enabled or not: a test asserts that a producer stayed quiet. */
export class FakeDiagnosticSink implements DiagnosticSink, DiagnosticTakes, DiagnosticTakeNotices {
	readonly events: { kind: string; audioTime: number; data: unknown }[] = [];
	readonly chunks: DiagnosticAudioChunk[] = [];
	readonly takes: { opened: DiagnosticTakeOpening; endedAt: number | null }[] = [];
	/** Asks the recorder for the input's own rate instead of 16 kHz. */
	nativeRate = false;

	private readonly takeListeners = new Set<(enabled: boolean) => void>();

	constructor(public enabled = true) {}

	onTake(listener: (enabled: boolean) => void): () => void {
		this.takeListeners.add(listener);
		return () => this.takeListeners.delete(listener);
	}

	event(kind: string, audioTime: number, data: unknown): void {
		this.events.push({ kind, audioTime, data });
	}

	audio(chunk: DiagnosticAudioChunk): void {
		this.chunks.push(chunk);
	}

	async openTake(take: DiagnosticTakeOpening): Promise<void> {
		this.takes.push({ opened: take, endedAt: null });
		[...this.takeListeners].forEach((listener) => listener(this.enabled));
	}

	async closeTake(endedAt: number): Promise<void> {
		const open = this.takes.at(-1);
		if (open && open.endedAt === null) open.endedAt = endedAt;
		[...this.takeListeners].forEach((listener) => listener(false));
	}
}

/** The settings screen's view of the journal: a used size the test sets, calls counted. */
export class FakeDiagnostics implements DiagnosticsService {
	used = 0;
	takes = 0;
	exports = 0;
	clears = 0;

	async usage(): Promise<{ bytes: number; takes: number }> {
		return { bytes: this.used, takes: this.takes };
	}

	async exportArchive(): Promise<Blob> {
		this.exports++;
		return new Blob([], { type: 'application/zip' });
	}

	async oracleArchive(): Promise<Blob> {
		return new Blob([], { type: 'application/zip' });
	}

	oracleReport(): OracleReport {
		const none = { matched: 0, missed: 0, falseAttacks: 0, biasMs: null, spreadMs: null };
		return { suites: [], total: none, unmatched: [] };
	}

	async clear(): Promise<void> {
		this.clears++;
		this.used = 0;
		this.takes = 0;
	}
}

function byPromptedAt(a: Attempt, b: Attempt): number {
	return a.promptedAt - b.promptedAt;
}

export class InMemoryAttemptRepository implements AttemptRepositoryPort {
	private readonly attempts: Attempt[] = [];

	async add(attempt: Attempt): Promise<number> {
		const id = this.attempts.length + 1;
		this.attempts.push({ ...attempt, id });
		return id;
	}

	async setObservations(id: number, observations: RecordedObservation[]): Promise<void> {
		const index = this.attempts.findIndex((a) => a.id === id);
		if (index < 0) throw new Error(`No attempt with id ${id}`);
		this.attempts[index] = { ...this.attempts[index], observations };
	}

	async setContested(id: number, reason?: string): Promise<void> {
		const index = this.attempts.findIndex((a) => a.id === id);
		if (index < 0) throw new Error(`No attempt with id ${id}`);
		this.attempts[index] = {
			...this.attempts[index],
			contested: true,
			...(reason !== undefined && { contestReason: reason })
		};
	}

	async listByCard(key: CardKey): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.cardKey === key).sort(byPromptedAt);
	}

	async listBySession(sessionId: string): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.sessionId === sessionId).sort(byPromptedAt);
	}

	async listSince(epochMs: number): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.promptedAt >= epochMs).sort(byPromptedAt);
	}

	async all(): Promise<Attempt[]> {
		return [...this.attempts].sort(byPromptedAt);
	}
}

export class InMemoryCardStateRepository implements CardStateRepositoryPort {
	private readonly states = new Map<CardKey, CardState>();

	async get(key: CardKey): Promise<CardState | undefined> {
		return this.states.get(key);
	}

	async put(state: CardState): Promise<void> {
		this.states.set(state.key, state);
	}

	async putMany(states: CardState[]): Promise<void> {
		states.forEach((state) => this.states.set(state.key, state));
	}

	async all(): Promise<CardState[]> {
		return [...this.states.values()];
	}
}

export class InMemorySessionRepository implements SessionRepositoryPort {
	private readonly records = new Map<string, SessionRecord>();

	async put(record: SessionRecord): Promise<void> {
		this.records.set(record.id, record);
	}

	async get(id: string): Promise<SessionRecord | undefined> {
		return this.records.get(id);
	}

	async list(): Promise<SessionRecord[]> {
		return [...this.records.values()].sort((a, b) => a.startedAt - b.startedAt);
	}
}

export class InMemoryProgressionRepository implements ProgressionRepositoryPort {
	/** By exercise and scope: `JSON.stringify([exerciseId, scope ?? null])`. */
	private readonly progressions = new Map<string, Progression>();

	async get(exerciseId: ExerciseId, scope?: string): Promise<Progression | undefined> {
		const stored = this.progressions.get(JSON.stringify([exerciseId, scope ?? null]));
		return stored && { ...stored };
	}

	async put(progression: Progression): Promise<void> {
		const key = JSON.stringify([progression.exerciseId, progression.scope ?? null]);
		this.progressions.set(key, { ...progression });
	}

	async all(): Promise<Progression[]> {
		return [...this.progressions.values()].map((progression) => ({ ...progression }));
	}
}

export class InMemoryLevelStateRepository implements LevelStateRepositoryPort {
	/** By exercise, scope and item: `JSON.stringify([exerciseId, scope, item])`. */
	private readonly states = new Map<string, LevelState>();

	async get(key: {
		exerciseId: string;
		scope: string;
		item: string;
	}): Promise<LevelState | undefined> {
		const stored = this.states.get(JSON.stringify([key.exerciseId, key.scope, key.item]));
		return stored && { ...stored };
	}

	async put(state: LevelState): Promise<void> {
		this.states.set(JSON.stringify([state.exerciseId, state.scope, state.item]), { ...state });
	}

	async all(): Promise<LevelState[]> {
		return [...this.states.values()].map((state) => ({ ...state }));
	}
}

export class InMemorySettingsRepository implements SettingsRepositoryPort {
	private stored: Partial<Settings> = {};

	async get(): Promise<Settings> {
		return { ...DEFAULT_SETTINGS, ...this.stored };
	}

	async update(patch: Partial<Settings>): Promise<Settings> {
		this.stored = { ...this.stored, ...patch };
		return this.get();
	}
}
