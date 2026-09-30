import type { PlayView } from '$lib/application/session/contract';

/**
 * The play screen shows the answer pad instead of the tile lane for an identify prompt,
 * and between prompts while mode 2 choices are on offer.
 */
export function showsAnswerPad(view: Pick<PlayView, 'prompt' | 'answerChoices'>): boolean {
	if (view.prompt !== null) return view.prompt.direction === 'identify';
	return view.answerChoices !== null;
}
