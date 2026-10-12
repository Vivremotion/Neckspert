import {
	DEFAULT_SETTINGS,
	type Attempt,
	type CardKey,
	type CardState,
	type ExerciseId,
	type Progression,
	type RecordedObservation,
	type SessionRecord,
	type Settings,
	type Verdict
} from '$lib/domain/types';
import type {
	AttemptRepositoryPort,
	AudioClockPort,
	AudioInputDevice,
	BeatEvent,
	CardStateRepositoryPort,
	ChordExpectation,
	ChordReport,
	ChordVerifierPort,
	DiagnosticAudioChunk,
	DiagnosticSink,
	DiagnosticTakeOpening,
	DiagnosticTakes,
	MetronomePort,
	NoteDetectorPort,
	NoteOnset,
	NoteRejection,
	ProgressionRepositoryPort,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundCuePort
} from '$lib/application/ports';
import type { DiagnosticsService } from '$lib/application/app';

export class FakeSoundCues implements SoundCuePort {
	readonly played: { verdict: Verdict; time: number | undefined }[] = [];

	play(verdict: Verdict, time?: number): void {
		this.played.push({ verdict, time });
	}
}

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

	advance(seconds: number): void {
		this.time += seconds;
	}
}

export class FakeMetronome implements MetronomePort {
	audible = true;
	private bpm = 80;
	private firstBeatTime: number | null = null;
	private lastEmitted = -1;
	private readonly listeners = new Set<(beat: BeatEvent) => void>();
	private wakeUps: { time: number; callback: () => void }[] = [];

	/** `lookaheadS` mirrors the real scheduler: beats are announced up to that far before their time. */
	constructor(
		private readonly clock: FakeClock,
		private readonly beatsPerBar = 4,
		private readonly lookaheadS = 0.1
	) {}

	setTempo(bpm: number): void {
		if (this.isRunning()) throw new Error('Cannot change tempo while running');
		this.bpm = bpm;
	}

	getTempo(): number {
		return this.bpm;
	}

	secondsPerBeat(): number {
		return 60 / this.bpm;
	}

	start(firstBeatTime: number): void {
		this.firstBeatTime = firstBeatTime;
		this.lastEmitted = -1;
	}

	setAudible(audible: boolean): void {
		this.audible = audible;
	}

	stop(): void {
		this.firstBeatTime = null;
		this.wakeUps = [];
	}

	isRunning(): boolean {
		return this.firstBeatTime !== null;
	}

	at(time: number, callback: () => void): () => void {
		if (this.firstBeatTime === null) throw new Error('Metronome not running');
		const wakeUp = { time, callback };
		this.wakeUps.push(wakeUp);
		return () => {
			this.wakeUps = this.wakeUps.filter((w) => w !== wakeUp);
		};
	}

	beatTime(index: number): number {
		if (this.firstBeatTime === null) throw new Error('Metronome not running');
		return this.firstBeatTime + index * this.secondsPerBeat();
	}

	onBeat(callback: (beat: BeatEvent) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/**
	 * Emits every beat whose audio time is within the lookahead of the clock, and calls every
	 * wake-up whose time the clock reached, in the order they come due: a beat at its time minus
	 * the lookahead, a wake-up at its time (a beat first on a tie). Either may stop or restart it.
	 */
	flush(): void {
		const now = this.clock.now();
		for (;;) {
			if (this.firstBeatTime === null) return;
			const nextBeat = this.beatTime(this.lastEmitted + 1);
			const wakeUp = this.wakeUps
				.filter((w) => w.time <= now)
				.reduce<{ time: number; callback: () => void } | null>(
					(earliest, w) => (!earliest || w.time < earliest.time ? w : earliest),
					null
				);
			const beatFirst =
				nextBeat <= now + this.lookaheadS && (!wakeUp || nextBeat - this.lookaheadS <= wakeUp.time);
			if (beatFirst) {
				this.lastEmitted++;
				const beat: BeatEvent = {
					index: this.lastEmitted,
					time: this.beatTime(this.lastEmitted),
					isDownbeat: this.lastEmitted % this.beatsPerBar === 0
				};
				this.listeners.forEach((listener) => listener(beat));
			} else if (wakeUp) {
				this.wakeUps = this.wakeUps.filter((w) => w !== wakeUp);
				wakeUp.callback();
			} else return;
		}
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
export class FakeDiagnosticSink implements DiagnosticSink, DiagnosticTakes {
	readonly events: { kind: string; audioTime: number; data: unknown }[] = [];
	readonly chunks: DiagnosticAudioChunk[] = [];
	readonly takes: { opened: DiagnosticTakeOpening; endedAt: number | null }[] = [];

	constructor(public enabled = true) {}

	event(kind: string, audioTime: number, data: unknown): void {
		this.events.push({ kind, audioTime, data });
	}

	audio(chunk: DiagnosticAudioChunk): void {
		this.chunks.push(chunk);
	}

	async openTake(take: DiagnosticTakeOpening): Promise<void> {
		this.takes.push({ opened: take, endedAt: null });
	}

	async closeTake(endedAt: number): Promise<void> {
		const open = this.takes.at(-1);
		if (open && open.endedAt === null) open.endedAt = endedAt;
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

	async setContested(id: number): Promise<void> {
		const index = this.attempts.findIndex((a) => a.id === id);
		if (index < 0) throw new Error(`No attempt with id ${id}`);
		this.attempts[index] = { ...this.attempts[index], contested: true };
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
