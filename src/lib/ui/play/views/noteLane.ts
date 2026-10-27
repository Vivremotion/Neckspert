import type { PromptStageModel } from '$lib/application/presentation';
import { laneTiles, laneWindow, type LaneTile } from '../lane';

/**
 * The notes' lane read from its model: the target on the anchor beat once the round is open (none
 * while the note waits), the rounds played before on theirs. Beats are the series' map beats, the
 * same as `controller.timeline.nowBeat()`; bars of the model's `beatsPerBar`.
 */
export function noteLaneTiles(model: PromptStageModel, time: { nowBeat: number }): LaneTile[] {
	const { beatsPerBar } = model;
	const window = laneWindow({
		nowBeat: time.nowBeat,
		beatsPerBar,
		targetBeatIndex: model.anchorBeat,
		followUp: null
	});
	return laneTiles({
		nowBeat: time.nowBeat,
		beatsPerBar,
		promptBeatIndex: model.promptBeat,
		targetBeatIndex: model.anchorBeat,
		followUp: null,
		history: model.history,
		...window
	});
}
