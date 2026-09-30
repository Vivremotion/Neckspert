import type { PitchName } from '$lib/domain/music/types';
import type { Attempt, Locale, PlannedItem, SessionPlan, Settings } from '$lib/domain/types';
import type { BeatEvent, NoteOnset } from '$lib/application/ports';
import type { PlaySessionController, PlayView } from './contract';
import type { SessionDeps } from './SessionDeps';
import { buildPromptView } from './prompt';

const BEATS_PER_BAR = 4 as const;

type InternalStatus = PlayView['status'];

export class SessionController implements PlaySessionController {
	readonly sessionId: string;
	readonly view: PlayView;
	readonly timeline = {
		nowBeat: (): number => {
			if (!this.deps.metronome.isRunning()) return 0;
			return (
				(this.deps.clock.now() - this.deps.metronome.beatTime(0)) /
				this.deps.metronome.secondsPerBeat()
			);
		}
	};

	private readonly deps: SessionDeps;
	private readonly kind: SessionPlan['kind'];
	private queue: PlannedItem[];
	private settings!: Settings;
	private locale: Locale = 'fr';
	private latencyMs = 0;
	private unsubBeat: (() => void) | null = null;
	private unsubNote: (() => void) | null = null;
	private earliestPromptBeat = BEATS_PER_BAR;
	private current: PlannedItem | null = null;
	private promptBeatIndex: number | null = null;
	private targetBeatIndex: number | null = null;
	private promptTimeAudio: number | null = null;
	private windowClosesAt: number | null = null;
	private captured = false;
	private verdictBeatIndex: number | null = null;
	private sessionAttempts: Attempt[] = [];
	private started = false;

	constructor(plan: SessionPlan, deps: SessionDeps) {
		this.deps = deps;
		this.sessionId = plan.id;
		this.kind = plan.kind;
		this.queue = [...plan.items];
		this.view = $state<PlayView>({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: 80,
			beatsPerBar: BEATS_PER_BAR,
			promptBeatIndex: null,
			targetBeatIndex: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false
		});
	}

	async start(): Promise<void> {
		if (this.started && this.view.status !== 'idle') return;
		this.started = true;
		this.settings = await this.deps.settings.get();
		this.locale = this.settings.locale;
		this.latencyMs = this.settings.calibrationOffsetMs ?? 0;
		this.view.tempoBpm = this.settings.tempoBpm;

		await this.deps.clock.resume();
		await this.deps.detector.start(this.settings.inputDeviceId);
		if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
		this.deps.metronome.setTempo(this.settings.tempoBpm);

		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: this.deps.now(),
			endedAt: null,
			fatigueDetected: false
		});

		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = this.deps.metronome.onBeat((beat) => this.onBeat(beat));
		this.unsubNote = this.deps.detector.onNote((onset) => this.onNote(onset));

		this.earliestPromptBeat = BEATS_PER_BAR;
		this.clearItemState();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	pause(): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;
		// Discard in-progress item without recording.
		this.current = null;
		this.clearItemState();
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.deps.metronome.stop();
		this.setStatus('paused');
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
		this.deps.metronome.setTempo(this.settings.tempoBpm);
		this.earliestPromptBeat = BEATS_PER_BAR;
		this.clearItemState();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	answer(_pitch: PitchName): void {
		// Task 5
	}

	quit(): void {
		void this.finish();
	}

	private setStatus(status: InternalStatus): void {
		this.view.status = status;
	}

	private clearItemState(): void {
		this.promptBeatIndex = null;
		this.targetBeatIndex = null;
		this.promptTimeAudio = null;
		this.windowClosesAt = null;
		this.captured = false;
		this.verdictBeatIndex = null;
	}

	private onBeat(beat: BeatEvent): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;

		if (this.view.status === 'verdict') {
			if (this.verdictBeatIndex !== null && beat.index >= this.verdictBeatIndex + 1) {
				this.advanceAfterVerdict();
			}
			return;
		}

		if (this.view.status === 'awaiting') {
			this.maybeCloseWindow(beat);
			return;
		}

		if (this.view.status === 'count-in' || this.view.status === 'idle') {
			if (beat.index >= this.earliestPromptBeat) {
				this.beginNextItem(beat);
			}
		}
	}

	private onNote(_onset: NoteOnset): void {
		// Task 3
	}

	private beginNextItem(beat: BeatEvent): void {
		if (this.queue.length === 0) {
			void this.finish();
			return;
		}
		const item = this.queue.shift()!;
		this.current = item;

		if (item.target.direction === 'locate') {
			const lead = item.leadBeats ?? 1;
			this.promptBeatIndex = beat.index;
			this.targetBeatIndex = beat.index + lead;
			this.promptTimeAudio = this.deps.metronome.beatTime(beat.index);
			this.windowClosesAt = null;
			this.captured = false;

			this.view.prompt = buildPromptView(item, this.locale, this.deps.random);
			this.view.promptBeatIndex = this.promptBeatIndex;
			this.view.targetBeatIndex = this.targetBeatIndex;
			this.view.leadBeats = item.leadBeats;
			this.view.answerChoices = null;
			this.view.lastVerdict = null;
			this.setStatus('awaiting');
			this.armLocateWindow();
			return;
		}

		this.beginIdentify(item, beat);
	}

	private armLocateWindow(): void {
		// Task 3
	}

	private beginIdentify(_item: PlannedItem, _beat: BeatEvent): void {
		// Task 5
		void this.finish();
	}

	private maybeCloseWindow(_beat: BeatEvent): void {
		// Task 4
	}

	private advanceAfterVerdict(): void {
		this.clearItemState();
		this.current = null;
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		if (this.queue.length === 0) {
			void this.finish();
			return;
		}
		this.setStatus('count-in');
	}

	private async finish(): Promise<void> {
		this.deps.metronome.stop();
		this.deps.detector.stop();
		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = null;
		this.unsubNote = null;
		this.setStatus('finished');
		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: (await this.deps.sessions.get(this.sessionId))?.startedAt ?? this.deps.now(),
			endedAt: this.deps.now(),
			fatigueDetected: this.view.fatigueDetected
		});
		if (this.kind === 'placement') {
			await this.deps.settings.update({ placementDoneAt: this.deps.now() });
		}
	}
}
