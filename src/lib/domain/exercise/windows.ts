import {
	LATE_CAPTURE_MS,
	LATE_LIMIT_MS,
	MIN_RESPONSE_MS,
	PERFECT_WINDOW_MS
} from '../scoring/timing';
import { ANCHOR_CHORD_FROM_BEATS } from '../timing/anchor';
import { GRID_EARLY_MAX_BEATS, GRID_EARLY_MS } from '../timing/gridChange';
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

/** Today's values: the windows of an exercise that writes none. */
export const DEFAULT_RESPONSE_WINDOWS: ResponseWindows = {
	perfectMs: PERFECT_WINDOW_MS,
	lateMs: LATE_LIMIT_MS,
	lateCaptureMs: LATE_CAPTURE_MS,
	minResponseMs: MIN_RESPONSE_MS,
	gridEarlyMs: GRID_EARLY_MS,
	gridEarlyMaxBeats: GRID_EARLY_MAX_BEATS,
	anchorChordFromBeats: ANCHOR_CHORD_FROM_BEATS
};

/** `params.windows` over the defaults, field by field. */
export function windowsOf(definition: ExerciseDefinition): ResponseWindows {
	const written = definition.params.windows as Partial<ResponseWindows> | undefined;
	return { ...DEFAULT_RESPONSE_WINDOWS, ...written };
}
