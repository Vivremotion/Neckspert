import { DEFAULT_SETTINGS } from '$lib/domain/types';
import type { PlayView } from '../contract';

/** The view of a series before it starts: only the frame and the stage are ever filled. */
export function idlePlayView(): PlayView {
	return {
		status: 'idle',
		prompt: null,
		lastVerdict: null,
		tempoBpm: 0,
		beatsPerBar: 4,
		promptBeatIndex: null,
		targetBeatIndex: null,
		followUp: null,
		leadBeats: null,
		history: [],
		answerChoices: null,
		fatigueDetected: false,
		scene: 'guitar',
		countdown: null,
		preview: null,
		chordDiagram: DEFAULT_SETTINGS.chordDiagram,
		contest: null,
		audioError: null,
		stage: null,
		briefing: null
	};
}
