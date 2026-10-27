import type { PromptStageModel } from '$lib/application/presentation';
import { laneTiles, laneWindow, type LaneTile } from '../lane';

/**
 * The lane of a response exercise read from its model: the target on the anchor beat once the
 * round is open (none while the item waits), each extended expectation as a band on its beats
 * after it, the rounds played before on theirs. Beats are the series' map beats, the same as
 * `controller.timeline.nowBeat()`; bars of the model's `beatsPerBar`.
 */
export function laneViewTiles(model: PromptStageModel, time: { nowBeat: number }): LaneTile[] {
	const { beatsPerBar } = model;
	// A band follows a target: while the item waits, there is none.
	const bands = model.anchorBeat === null ? [] : model.bands;
	const window = laneWindow({
		nowBeat: time.nowBeat,
		beatsPerBar,
		targetBeatIndex: model.anchorBeat,
		bands
	});
	return laneTiles({
		nowBeat: time.nowBeat,
		beatsPerBar,
		promptBeatIndex: model.promptBeat,
		targetBeatIndex: model.anchorBeat,
		bands,
		history: model.history,
		...window
	});
}
