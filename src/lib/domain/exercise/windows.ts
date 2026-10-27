import type { ExerciseDefinition } from './types';

/** The windows in which a response is heard and judged; an exercise writes them in `params.windows`. */
export interface ResponseWindows {
	/** Half-width of the « on the beat » window around the target, ms. */
	perfectMs: number;
	/** Past this after the target, a right answer is late, ms. */
	lateMs: number;
	/** How long the detector keeps listening past the late limit, ms. */
	lateCaptureMs: number;
	/** The window opens this long after the prompt, ms. */
	minResponseMs: number;
	/** A grid change opens this early, ms… */
	gridEarlyMs: number;
	/** …and at most this many beats early. */
	gridEarlyMaxBeats: number;
	/** The anchor's chord is taken from this many beats after its root. */
	anchorChordFromBeats: number;
}

/**
 * Today's values: the windows of an exercise that writes none. To calibrate. `perfectMs` 80:
 * largest |offset| from the target still « on the beat ». `lateMs` 400 and `lateCaptureMs` 2000:
 * a right note past the first is `offbeat`, up to the next prompt. `minResponseMs` 300: earlier
 * notes belong to the previous prompt. A grid change opens `gridEarlyMs` 200 early, at most
 * `gridEarlyMaxBeats` 0.4 beat; the anchor's chord is taken from 1 beat after its root.
 */
export const DEFAULT_RESPONSE_WINDOWS: ResponseWindows = {
	perfectMs: 80,
	lateMs: 400,
	lateCaptureMs: 2000,
	minResponseMs: 300,
	gridEarlyMs: 200,
	gridEarlyMaxBeats: 0.4,
	anchorChordFromBeats: 1
};

/** `params.windows` over the defaults, field by field. */
export function windowsOf(definition: ExerciseDefinition): ResponseWindows {
	const written = definition.params.windows as Partial<ResponseWindows> | undefined;
	return { ...DEFAULT_RESPONSE_WINDOWS, ...written };
}
