import type {
	LaneEntry,
	PlaySessionController,
	PlayTimeline,
	PlayView,
	VerdictView
} from '$lib/application/session/contract';
import type { PitchName } from '$lib/domain/music/types';
import type { Verdict } from '$lib/domain/types';
import { playMessages } from '../messages';

export interface DemoClock {
	nowBeat(): number;
	setBeat(beat: number): void;
	advance(beats: number): void;
}

export class ManualDemoClock implements DemoClock {
	#beat = 0;

	nowBeat(): number {
		return this.#beat;
	}

	setBeat(beat: number): void {
		this.#beat = beat;
	}

	advance(beats: number): void {
		this.#beat += beats;
	}
}

const SCRIPT: {
	primary: string;
	stringName: string;
	verdict: Verdict;
	offsetMs: number;
	reactionMs: number;
}[] = [
	{ primary: 'F', stringName: 'B', verdict: 'perfect', offsetMs: 12, reactionMs: 980 },
	{ primary: 'C', stringName: 'G', verdict: 'perfect', offsetMs: -8, reactionMs: 1100 },
	{ primary: 'A', stringName: 'D', verdict: 'early', offsetMs: -120, reactionMs: 900 },
	{ primary: 'E', stringName: 'A', verdict: 'wrong', offsetMs: 40, reactionMs: 1300 },
	{ primary: 'F', stringName: 'B', verdict: 'late', offsetMs: 95, reactionMs: 1210 }
];

const COUNT_IN = 4;
const LEAD = 8;

export class DemoPlaySession implements PlaySessionController {
	readonly sessionId = 'demo-play';
	readonly view: PlayView;
	readonly timeline: PlayTimeline;

	#clock: DemoClock;
	#step = 0;
	#promptBeat: number | null = null;
	#targetBeat: number | null = null;
	#pausedBeat: number | null = null;

	constructor(options: { clock?: DemoClock; tempoBpm?: number } = {}) {
		this.#clock = options.clock ?? new ManualDemoClock();
		this.view = $state({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: options.tempoBpm ?? 80,
			beatsPerBar: 4,
			promptBeatIndex: null,
			targetBeatIndex: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene: 'locate',
			countdown: null,
			preview: null
		});
		this.timeline = {
			nowBeat: () => this.#clock.nowBeat()
		};
	}

	async start(): Promise<void> {
		this.#step = 0;
		this.view.history = [];
		this.view.lastVerdict = null;
		this.view.prompt = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.#clock.setBeat(0);
		this.#promptBeat = null;
		this.#targetBeat = null;
		this.view.status = 'count-in';
	}

	/** Drive the script from the injectable clock. Call after advancing the clock. */
	tick(): void {
		if (
			this.view.status === 'idle' ||
			this.view.status === 'finished' ||
			this.view.status === 'paused'
		) {
			return;
		}
		const now = this.#clock.nowBeat();
		if (this.view.status === 'count-in' && now >= COUNT_IN) {
			this.#openStep(COUNT_IN);
			return;
		}
		if (
			(this.view.status === 'awaiting' || this.view.status === 'verdict') &&
			this.#targetBeat !== null &&
			now >= this.#targetBeat &&
			this.view.history.every((h) => h.beatIndex !== this.#targetBeat)
		) {
			this.#judge();
		}
	}

	pause(): void {
		if (
			this.view.status !== 'awaiting' &&
			this.view.status !== 'count-in' &&
			this.view.status !== 'verdict'
		) {
			return;
		}
		this.#pausedBeat = this.#clock.nowBeat();
		this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		this.#pausedBeat = null;
		this.view.status = this.#promptBeat === null ? 'count-in' : 'awaiting';
	}

	answer(_pitch: PitchName): void {
		/* mode 1: guitar only */
	}

	quit(): void {
		this.view.status = 'finished';
		this.view.prompt = null;
	}

	#openStep(promptBeat: number): void {
		if (this.#step >= SCRIPT.length) {
			this.view.status = 'finished';
			this.view.prompt = null;
			this.view.promptBeatIndex = null;
			this.view.targetBeatIndex = null;
			this.view.leadBeats = null;
			return;
		}
		const t = playMessages();
		const item = SCRIPT[this.#step];
		this.#promptBeat = promptBeat;
		this.#targetBeat = promptBeat + LEAD;
		this.view.promptBeatIndex = this.#promptBeat;
		this.view.targetBeatIndex = this.#targetBeat;
		this.view.leadBeats = 8;
		this.view.prompt = {
			direction: 'locate',
			primary: item.primary,
			secondary: t.stringOf(item.stringName),
			aid: null,
			diagram: null
		};
		this.view.lastVerdict = null;
		this.view.status = 'awaiting';
	}

	#judge(): void {
		const item = SCRIPT[this.#step];
		const target = this.#targetBeat!;
		const entry: LaneEntry = { beatIndex: target, verdict: item.verdict };
		this.view.history = [...this.view.history, entry];
		const verdictView: VerdictView = {
			verdict: item.verdict,
			offsetMs: item.offsetMs,
			reactionMs: item.reactionMs,
			answerLabel: item.primary,
			correction:
				item.verdict === 'wrong' ? `${playMessages().stringOf(item.stringName)}, case 7` : null
		};
		this.view.lastVerdict = verdictView;
		this.view.status = 'verdict';
		this.#step += 1;
		const nextPrompt = target;
		queueMicrotask(() => {
			if (this.view.status !== 'verdict') return;
			this.#openStep(nextPrompt);
		});
	}
}
