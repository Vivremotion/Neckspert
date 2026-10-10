import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';
import type {
	PlaySessionController,
	PlayTimeline,
	PlayView
} from '$lib/application/session/contract';
import { identifyRules } from '$lib/domain/mechanics';
import {
	answerChoiceLabel,
	fretLabel,
	pitchOnString,
	stringLabel,
	type IdentifyItem
} from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { identifyTiming } from '$lib/domain/timing';
import { i18n } from '$lib/i18n/index.svelte';
import { identifyChoices } from './choices';

/** Demo prompts: F, F#, G, G#, D. */
export const DEMO_IDENTIFY_SCRIPT: readonly IdentifyItem[] = [
	{ string: 5, fret: 8 },
	{ string: 2, fret: 7 },
	{ string: 6, fret: 3 },
	{ string: 3, fret: 1 },
	{ string: 1, fret: 10 }
];

/** How long the demo shows a verdict before the next prompt. */
export const DEMO_VERDICT_MS = 1200;

/** Scripted mode 2 session without audio, for the demo page and tests. */
export class DemoIdentifySession implements PlaySessionController {
	readonly sessionId = 'demo-identify';
	view = $state<PlayView>({
		status: 'idle',
		prompt: null,
		lastVerdict: null,
		tempoBpm: DEFAULT_TEMPO_BPM,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		followUp: null,
		chordDiagram: 'strings',
		contest: null,
		leadBeats: null,
		history: [],
		answerChoices: identifyChoices(),
		fatigueDetected: false,
		scene: 'screen',
		countdown: null,
		preview: null,
		audioError: null,
		stage: null
	});
	readonly timeline: PlayTimeline = { nowBeat: () => 0 };

	private readonly script: readonly IdentifyItem[];
	private readonly verdictMs: number;
	private index = 0;
	/** Epoch ms when the current prompt was displayed. */
	private promptedAt = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(script: readonly IdentifyItem[] = DEMO_IDENTIFY_SCRIPT, verdictMs = DEMO_VERDICT_MS) {
		this.script = script;
		this.verdictMs = verdictMs;
	}

	async start(): Promise<void> {
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.index = 0;
		this.view.lastVerdict = null;
		this.showPromptOrFinish();
	}

	pause(): void {
		if (this.view.status === 'awaiting') this.view.status = 'paused';
	}

	resume(): void {
		if (this.view.status !== 'paused') return;
		this.promptedAt = Date.now();
		this.view.status = 'awaiting';
	}

	answer(value: string): void {
		const pitch = value as PitchName;
		if (this.view.status !== 'awaiting') return;
		const target = this.script[this.index];
		const judged = identifyRules.judge(target, pitch);
		// Seconds since the epoch stand in for the audio clock: the round only measures the delay.
		const promptTime = this.promptedAt / 1000;
		const round = identifyTiming.open({
			planned: { leadBeats: null },
			promptBeat: 0,
			now: promptTime,
			beatTime: () => promptTime,
			secondsPerBeat: 60 / this.view.tempoBpm
		});
		const event = round.observe({
			time: Date.now() / 1000,
			correct: judged.correct,
			answer: judged.answer
		});
		if (event.kind !== 'settled') return;
		const { verdict, reactionMs } = event.outcome;
		this.view.lastVerdict = {
			verdict,
			offsetMs: null,
			reactionMs,
			answerLabel: answerChoiceLabel(pitch),
			correction:
				verdict === 'wrong' ? answerChoiceLabel(pitchOnString(target.string, target.fret)) : null
		};
		this.view.status = 'verdict';
		this.timer = setTimeout(() => {
			this.timer = null;
			this.index += 1;
			this.showPromptOrFinish();
		}, this.verdictMs);
	}

	/** Nothing to contest in a demo. */
	contest(): void {}

	quit(): void {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.finish();
	}

	private showPromptOrFinish(): void {
		const target = this.script[this.index];
		if (!target) {
			this.finish();
			return;
		}
		this.view.prompt = {
			primary: fretLabel(target.fret, i18n.locale),
			secondary: stringLabel(target.string, i18n.locale),
			aid: null,
			diagram: null
		};
		this.promptedAt = Date.now();
		this.view.status = 'awaiting';
	}

	private finish(): void {
		this.view.prompt = null;
		this.view.status = 'finished';
	}
}
