import type {
	PlaySessionController,
	PlayTimeline,
	PlayView
} from '$lib/application/session/contract';
import { answerChoiceLabel, fretLabel, pitchOnString, stringLabel } from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import { judgeIdentify } from '$lib/domain/scoring';
import type { IdentifyTarget } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import { identifyChoices } from './choices';

/** Demo prompts: F, F#, G, G#, D. */
export const DEMO_IDENTIFY_SCRIPT: readonly IdentifyTarget[] = [
	{ direction: 'identify', string: 5, fret: 8 },
	{ direction: 'identify', string: 2, fret: 7 },
	{ direction: 'identify', string: 6, fret: 3 },
	{ direction: 'identify', string: 3, fret: 1 },
	{ direction: 'identify', string: 1, fret: 10 }
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
		tempoBpm: 80,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		leadBeats: null,
		history: [],
		answerChoices: identifyChoices(),
		fatigueDetected: false,
		scene: 'identify',
		countdown: null
	});
	readonly timeline: PlayTimeline = { nowBeat: () => 0 };

	private readonly script: readonly IdentifyTarget[];
	private readonly verdictMs: number;
	private index = 0;
	/** Epoch ms when the current prompt was displayed. */
	private promptedAt = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		script: readonly IdentifyTarget[] = DEMO_IDENTIFY_SCRIPT,
		verdictMs = DEMO_VERDICT_MS
	) {
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

	answer(pitch: PitchName): void {
		if (this.view.status !== 'awaiting') return;
		const target = this.script[this.index];
		const judgement = judgeIdentify({
			expected: pitchOnString(target.string, target.fret),
			promptTime: this.promptedAt / 1000,
			answerTime: Date.now() / 1000,
			answered: pitch
		});
		this.view.lastVerdict = {
			verdict: judgement.verdict,
			offsetMs: null,
			reactionMs: judgement.reactionMs,
			answerLabel: answerChoiceLabel(pitch),
			correction:
				judgement.verdict === 'wrong'
					? answerChoiceLabel(pitchOnString(target.string, target.fret))
					: null
		};
		this.view.status = 'verdict';
		this.timer = setTimeout(() => {
			this.timer = null;
			this.index += 1;
			this.showPromptOrFinish();
		}, this.verdictMs);
	}

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
			direction: 'identify',
			primary: fretLabel(target.fret, i18n.locale),
			secondary: stringLabel(target.string, i18n.locale),
			aid: null
		};
		this.promptedAt = Date.now();
		this.view.status = 'awaiting';
	}

	private finish(): void {
		this.view.prompt = null;
		this.view.status = 'finished';
	}
}
