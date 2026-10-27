import type {
	PresentedPrompt,
	PromptStageModel,
	StageVerdict
} from '$lib/application/presentation';

/** A prompt as `presentPrompt` writes it, saying nothing but what `over` gives. */
export function presented(over: Partial<PresentedPrompt> = {}): PresentedPrompt {
	return {
		primary: '',
		secondary: null,
		detail: null,
		target: null,
		band: null,
		preview: null,
		aid: null,
		pictures: [],
		...over
	};
}

/** A prompt's screen model, waiting for nothing: not placed, no verdict, no keys. */
export function stageModel(over: Partial<PromptStageModel> = {}): PromptStageModel {
	return {
		prompt: presented(),
		anchorBeat: null,
		promptBeat: null,
		history: [],
		bands: [],
		beatsPerBar: 4,
		verdict: null,
		chordDiagram: 'strings',
		choices: [],
		...over
	};
}

/** A settled round's verdict: a miss of one expectation when `correction` is given. */
export function stageVerdict(
	over: Partial<Omit<StageVerdict, 'misses'>> & { correction?: string | null } = {}
): StageVerdict {
	const { correction = null, ...rest } = over;
	return {
		verdict: 'wrong',
		offsetMs: null,
		answerLabel: null,
		misses: correction === null ? [] : [{ correction, heard: null, expected: null, gap: null }],
		...rest
	};
}
