import { DEFAULT_RESPIRATION_BARS } from '$lib/domain/exercise/pacing';
import {
	CONTENT_VIEWS,
	presentPrompt,
	type PromptStageModel,
	type StageVerdict
} from '$lib/application/presentation';
import type {
	LaneEntry,
	PlaySessionController,
	PlayTimeline,
	PlayView
} from '$lib/application/session/contract';
import { DEFAULT_TEMPO_BPM, LOCATE_NECK } from '$lib/domain/exercise';
import { acceptableMidis, midiOnString, type LocateItem } from '$lib/domain/music';
import type { ResponseVerdict } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';

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

/** The notes played, and how each went: the wrong one is answered with its string's open note. */
const SCRIPT: { item: LocateItem; verdict: ResponseVerdict; offsetMs: number }[] = [
	{ item: { string: 2, pitch: 'F' }, verdict: 'perfect', offsetMs: 12 },
	{ item: { string: 3, pitch: 'C' }, verdict: 'perfect', offsetMs: -8 },
	{ item: { string: 4, pitch: 'A' }, verdict: 'early', offsetMs: -120 },
	{ item: { string: 5, pitch: 'E' }, verdict: 'wrong', offsetMs: 40 },
	{ item: { string: 2, pitch: 'F' }, verdict: 'late', offsetMs: 95 }
];

const BAR_BEATS = 4;
const COUNT_IN = BAR_BEATS;
const LEAD = 8;
/** The breathing bar after a target: its verdict stays, then the next note comes. */
const BREATH_BEATS = DEFAULT_RESPIRATION_BARS * BAR_BEATS;

/** Spells the demo's notes always alike. */
const noRandom = () => 0;

/**
 * Scripted mode 1 session without audio, for the demo page and tests: it fills the stage with
 * the prompt's screen model, as the series writes it for locate, from the injectable clock.
 */
export class DemoPlaySession implements PlaySessionController {
	readonly sessionId = 'demo-play';
	readonly view: PlayView;
	readonly timeline: PlayTimeline;

	#clock: DemoClock;
	#step = 0;
	#history: LaneEntry[] = [];
	#promptBeat: number | null = null;
	#targetBeat: number | null = null;
	/** The beat the next note comes on, while a verdict stays through the breath. */
	#nextPromptBeat: number | null = null;

	constructor(options: { clock?: DemoClock; tempoBpm?: number } = {}) {
		this.#clock = options.clock ?? new ManualDemoClock();
		this.view = $state({
			status: 'idle',
			tempoBpm: options.tempoBpm ?? DEFAULT_TEMPO_BPM,
			contest: null,
			fatigueDetected: false,
			countdown: null,
			audioError: null,
			stage: null,
			briefing: null,
			announcement: null
		});
		this.timeline = {
			nowBeat: () => this.#clock.nowBeat()
		};
	}

	/** The note lane on stage, when the demo shows it. */
	get lane(): PromptStageModel | null {
		return this.view.stage ? (this.view.stage.model as PromptStageModel) : null;
	}

	async start(): Promise<void> {
		this.#step = 0;
		this.#history = [];
		this.#clock.setBeat(0);
		this.#promptBeat = null;
		this.#targetBeat = null;
		this.#nextPromptBeat = null;
		// The first string shows under the counted bar.
		this.#show({ anchorBeat: null, promptBeat: null, verdict: null });
		this.view.status = 'count-in';
		this.view.countdown = COUNT_IN;
	}

	/** Drive the script from the injectable clock. Call after advancing the clock. */
	tick(): void {
		const status = this.view.status;
		if (status === 'idle' || status === 'finished' || status === 'paused') return;
		const now = this.#clock.nowBeat();
		if (status === 'count-in') {
			if (now >= COUNT_IN) {
				this.view.countdown = null;
				this.#openStep(COUNT_IN);
			} else {
				this.view.countdown = COUNT_IN - Math.floor(now);
			}
			return;
		}
		if (status === 'awaiting' && this.#targetBeat !== null && now >= this.#targetBeat) {
			this.#judge();
			return;
		}
		if (status === 'verdict' && this.#nextPromptBeat !== null && now >= this.#nextPromptBeat) {
			this.#openStep(this.#nextPromptBeat);
		}
	}

	pause(): void {
		const status = this.view.status;
		if (status !== 'awaiting' && status !== 'count-in' && status !== 'verdict') return;
		this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		this.view.status =
			this.#promptBeat === null
				? 'count-in'
				: this.#nextPromptBeat !== null
					? 'verdict'
					: 'awaiting';
	}

	answer(_value: string): void {
		/* mode 1: guitar only */
	}

	/** Nothing to contest in a demo. */
	contest(): void {}

	quit(): void {
		this.view.status = 'finished';
		this.view.stage = null;
		this.view.countdown = null;
	}

	#show(place: Pick<PromptStageModel, 'anchorBeat' | 'promptBeat' | 'verdict'>): void {
		const { item } = SCRIPT[this.#step];
		const planned = {
			exerciseId: LOCATE_NECK.id,
			mechanic: LOCATE_NECK.mechanic,
			exerciseLevel: 0,
			item,
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: LEAD
		} as const;
		this.view.stage = {
			view: 'lane',
			model: {
				prompt: presentPrompt(LOCATE_NECK, planned, i18n.locale, noRandom),
				history: this.#history,
				bands: [],
				beatsPerBar: BAR_BEATS,
				chordDiagram: 'strings',
				choices: [],
				...place
			} satisfies PromptStageModel
		};
	}

	#openStep(promptBeat: number): void {
		this.#nextPromptBeat = null;
		if (this.#step >= SCRIPT.length) {
			this.quit();
			return;
		}
		this.#promptBeat = promptBeat;
		this.#targetBeat = promptBeat + LEAD;
		this.#show({ anchorBeat: this.#targetBeat, promptBeat, verdict: null });
		this.view.status = 'awaiting';
	}

	#judge(): void {
		const { item, verdict, offsetMs } = SCRIPT[this.#step];
		const target = this.#targetBeat!;
		this.#history = [...this.#history, { beatIndex: target, verdict }];
		const missed = verdict === 'wrong';
		// The wrong note is the string's open note, played; a right one, the target.
		const answer = { midi: missed ? midiOnString(item.string, 0) : acceptableMidis(item)[0] };
		const note = CONTENT_VIEWS.note;
		const told: StageVerdict = {
			verdict,
			offsetMs,
			answerLabel: note.answerLabel(item, answer, i18n.locale, noRandom),
			misses: missed ? [note.miss(item, { answer, confusion: null }, i18n.locale, noRandom)] : []
		};
		this.#show({ anchorBeat: target, promptBeat: this.#promptBeat, verdict: told });
		this.view.status = 'verdict';
		this.#step += 1;
		this.#nextPromptBeat = target + BREATH_BEATS;
	}
}
