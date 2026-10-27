import type { PromptStageModel } from '$lib/application/presentation';
import { laneTiles, laneWindow, type LaneTile } from '../lane';

/**
 * The lane of a response exercise read from its model: the target on the anchor beat once the
 * round is open (none while the item waits), the first extended expectation as a band on the beats
 * after it, the rounds played before on theirs. Beats are the series' map beats, the same as
 * `controller.timeline.nowBeat()`; bars of the model's `beatsPerBar`.
 */
export function laneViewTiles(model: PromptStageModel, time: { nowBeat: number }): LaneTile[] {
	const { beatsPerBar } = model;
	// A band follows a target: while the item waits, there is none.
	const followUp = model.anchorBeat === null ? null : (model.bands[0] ?? null);
	const window = laneWindow({
		nowBeat: time.nowBeat,
		beatsPerBar,
		targetBeatIndex: model.anchorBeat,
		followUp
	});
	return laneTiles({
		nowBeat: time.nowBeat,
		beatsPerBar,
		promptBeatIndex: model.promptBeat,
		targetBeatIndex: model.anchorBeat,
		followUp,
		history: model.history,
		...window
	});
}
