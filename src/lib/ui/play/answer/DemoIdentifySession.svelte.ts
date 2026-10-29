import { identifyPresenter } from '$lib/application/mechanics/identify';
import { CONTENT_VIEWS, presentPrompt, type PromptStageModel } from '$lib/application/presentation';
import type {
	PlaySessionController,
	PlayTimeline,
	PlayView
} from '$lib/application/session/contract';
import { DEFAULT_TEMPO_BPM, IDENTIFY_NECK } from '$lib/domain/exercise';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { answerChoiceLabel, pitchOnString, type IdentifyItem } from '$lib/domain/music';
import type { PitchName } from '$lib/domain/music/types';
import type { ResponseVerdict } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';

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

/** A name given within the exercise's recall threshold is perfect, later late. */
const RECALL_THRESHOLD_MS = recallThresholdOf(IDENTIFY_NECK) ?? 0;

/** Spells the demo's notes always alike. */
const noRandom = () => 0;

/**
 * Scripted mode 2 session without audio, for the demo page and tests: it fills the stage with
 * the prompt's screen model, as the series writes it for identify.
 */
export class DemoIdentifySession implements PlaySessionController {
	readonly sessionId = 'demo-identify';
	view = $state<PlayView>({
		status: 'idle',
		tempoBpm: DEFAULT_TEMPO_BPM,
		contest: null,
		fatigueDetected: false,
		countdown: null,
		audioError: null,
		stage: null,
		briefing: null,
		announcement: null
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

	/** The answer keys on stage, when the demo shows them. */
	get keys(): PromptStageModel | null {
		return this.view.stage ? (this.view.stage.model as PromptStageModel) : null;
	}

	async start(): Promise<void> {
		if (this.view.status !== 'idle' && this.view.status !== 'finished') return;
		this.index = 0;
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
		const keys = this.keys;
		if (this.view.status !== 'awaiting' || !keys) return;
		const pitch = value as PitchName;
		const target = this.script[this.index];
		const right = pitchOnString(target.string, target.fret);
		const reactionMs = Date.now() - this.promptedAt;
		const verdict: ResponseVerdict =
			pitch !== right ? 'wrong' : reactionMs <= RECALL_THRESHOLD_MS ? 'perfect' : 'late';
		this.view.stage = {
			view: 'answer-keys',
			model: {
				...keys,
				verdict: {
					verdict,
					offsetMs: null,
					answerLabel: answerChoiceLabel(pitch),
					misses:
						pitch === right
							? []
							: [
									CONTENT_VIEWS.name.miss(
										target,
										{ answer: { pitch }, confusion: null },
										i18n.locale,
										noRandom
									)
								]
				}
			} satisfies PromptStageModel
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
		this.view.stage = {
			view: 'answer-keys',
			model: {
				prompt: presentPrompt(
					IDENTIFY_NECK,
					{
						exerciseId: IDENTIFY_NECK.id,
						mechanic: IDENTIFY_NECK.mechanic,
						exerciseLevel: 0,
						item: target,
						phase: 'review',
						temperature: 'cold',
						aid: 'none',
						leadBeats: null
					},
					i18n.locale,
					noRandom
				),
				anchorBeat: null,
				promptBeat: null,
				history: [],
				bands: [],
				beatsPerBar: 4,
				verdict: null,
				chordDiagram: 'strings',
				choices: identifyPresenter.answerChoices!()
			} satisfies PromptStageModel
		};
		this.promptedAt = Date.now();
		this.view.status = 'awaiting';
	}

	private finish(): void {
		this.view.stage = null;
		this.view.status = 'finished';
	}
}
