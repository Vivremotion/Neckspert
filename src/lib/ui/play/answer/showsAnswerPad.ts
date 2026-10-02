import type { PlayView } from '$lib/application/session/contract';

/** The play screen shows the answer pad instead of the tile lane while the stage is set for the screen. */
export function showsAnswerPad(view: Pick<PlayView, 'scene'>): boolean {
	return view.scene === 'identify';
}
