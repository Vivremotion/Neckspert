import type { PlayView } from '../contract';

/** The view of a series before it starts: only the frame and the stage are ever filled. */
export function idlePlayView(): PlayView {
	return {
		status: 'idle',
		tempoBpm: 0,
		fatigueDetected: false,
		countdown: null,
		contest: null,
		audioError: null,
		stage: null,
		briefing: null
	};
}
