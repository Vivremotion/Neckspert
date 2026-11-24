import { getContext, setContext } from 'svelte';

const KEY = Symbol('play-info-line');

/**
 * What a view adds to the quiet frame's info line (the discreet line at the top: what plays, its
 * tempo): `parts` between the session's name and the tempo (the exercise's name, its level, the
 * bar played), and `tempo`, the tempo written with the unit of its beat (« ♪ = 90 »), in place of
 * the frame's own (always a quarter) when the view knows better. The frame provides it; a view
 * sets them while it is on stage and clears them as it leaves. A view rendered without a frame
 * (a test) gets none and shows its parts itself.
 */
export class InfoLineParts {
	parts: string[] = $state([]);
	tempo: string | null = $state(null);
}

export function provideInfoLine(): InfoLineParts {
	return setContext(KEY, new InfoLineParts());
}

export function useInfoLine(): InfoLineParts | null {
	return getContext<InfoLineParts | undefined>(KEY) ?? null;
}
