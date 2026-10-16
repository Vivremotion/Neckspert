import { chordGridPresenter } from '$lib/application/mechanics/chordGrid';
import type {
	PlaySessionController,
	PlayTimeline,
	PlayView
} from '$lib/application/session/contract';
import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { parseTriadId, triadId, type ChordGridItem } from '$lib/domain/mechanics';
import { linkShapes } from '$lib/domain/gesture/passages';
import { occurrenceId } from '$lib/domain/triads';
import type { ResponseVerdict } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import type { DemoClock } from './DemoPlaySession.svelte';

/** A counted bar, then the passage. */
const COUNT_IN = 4;
const GRID = gridChanges(gridById('iohefy-a'));
/** E on G-B-E, linked up the neck and back: one shape per bar. */
const LINK_SHAPES_E = linkShapes(parseTriadId('E|maj'), [3, 2, 1]);
const LINK = LINK_SHAPES_E.map((_, i) => ({ at: i * 4, length: 4, symbol: 'E' }));
/** The verdict of each change, as the demo plays it. */
const VERDICTS: readonly ResponseVerdict[] = [
	'perfect',
	'early',
	'perfect',
	'late',
	'wrong',
	'perfect'
];
/** Each change is judged this long after it. */
const JUDGED_AFTER_BEATS = 0.5;

function itemAt(mode: DemoGestureMode, index: number): ChordGridItem {
	if (mode === 'link') {
		return {
			rule: 'link',
			element: 'link:E|maj:3,2,1',
			passageId: 'demo:0',
			index,
			changes: LINK,
			symbol: 'E',
			chord: 'E|maj',
			sets: [[3, 2, 1]],
			shape: occurrenceId(LINK_SHAPES_E[index]),
			previous: null
		};
	}
	const symbol = GRID[index].symbol;
	return {
		rule: 'climb',
		element: 'climb:iohefy-a:3,2,1',
		passageId: 'demo:0',
		index,
		changes: GRID,
		symbol,
		chord: triadId(triadOf(symbol)),
		sets: [[3, 2, 1]],
		direction: 'up',
		previous: null
	};
}

/** Which exercise the demo plays: the link on its path, or a climb on the scrolling grid. */
export type DemoGestureMode = 'link' | 'climb';

/** A gesture passage played by script, for /dev/gesture: its view without audio. */
export class DemoGestureSession implements PlaySessionController {
	readonly sessionId = 'demo-gesture';
	readonly view: PlayView;
	readonly timeline: PlayTimeline;
	#clock: DemoClock;
	#index = -1;

	readonly #mode: DemoGestureMode;

	constructor(clock: DemoClock, mode: DemoGestureMode = 'link') {
		this.#clock = clock;
		this.#mode = mode;
		this.timeline = { nowBeat: () => this.#clock.nowBeat() };
		this.view = $state({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: DEFAULT_TEMPO_BPM,
			beatsPerBar: 4,
			promptBeatIndex: null,
			targetBeatIndex: null,
			followUp: null,
			chordDiagram: 'strings',
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false,
			scene: 'guitar',
			countdown: null,
			preview: null,
			contest: null,
			audioError: null,
			stage: null
		});
	}

	async start(): Promise<void> {
		this.#clock.setBeat(0);
		this.#index = -1;
		this.view.history = [];
		this.view.lastVerdict = null;
		this.view.targetBeatIndex = null;
		this.view.status = 'count-in';
		this.view.countdown = COUNT_IN;
		this.#stage(0);
	}

	/** Drive the script from the injectable clock. Call after advancing the clock. */
	tick(): void {
		if (this.view.status === 'idle' || this.view.status === 'finished') return;
		if (this.view.status === 'paused') return;
		const now = this.#clock.nowBeat();
		const CHANGES = this.#mode === 'link' ? LINK : GRID;
		if (now < COUNT_IN) {
			this.view.countdown = COUNT_IN - Math.floor(now);
			return;
		}
		this.view.countdown = null;
		const due = CHANGES.findLastIndex((change) => COUNT_IN + change.at <= now);
		if (
			due >= CHANGES.length - 1 &&
			now >= COUNT_IN + CHANGES.at(-1)!.at + CHANGES.at(-1)!.length
		) {
			// The demo plays its passage again and again.
			void this.start();
			return;
		}
		if (due !== this.#index) {
			this.#index = due;
			this.view.targetBeatIndex = COUNT_IN + CHANGES[due].at;
			this.view.status = 'awaiting';
			this.view.lastVerdict = null;
			this.#stage(due);
		}
		const beat = COUNT_IN + CHANGES[due].at;
		if (now >= beat + JUDGED_AFTER_BEATS && this.view.history.every((h) => h.beatIndex !== beat)) {
			const verdict = VERDICTS[due % VERDICTS.length];
			this.view.history = [...this.view.history, { beatIndex: beat, verdict }];
			this.view.lastVerdict = {
				verdict,
				offsetMs: null,
				reactionMs: null,
				answerLabel: null,
				correction: null
			};
			this.view.status = 'verdict';
		}
	}

	pause(): void {
		this.view.status = 'paused';
	}

	resume(): void {
		this.view.status = this.#index < 0 ? 'count-in' : 'awaiting';
	}

	answer(): void {}

	contest(): void {}

	quit(): void {
		this.view.status = 'finished';
	}

	#stage(index: number): void {
		const { model } = chordGridPresenter.stage!(itemAt(this.#mode, index), null, i18n.locale, {
			aid: 'show-position'
		});
		this.view.stage = { view: this.#mode === 'link' ? 'link-lane' : 'grid-scroll', model };
	}
}
