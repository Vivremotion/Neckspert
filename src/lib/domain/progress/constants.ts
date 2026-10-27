/** Minimum gap after the previous attempt before the next one counts as cold. To calibrate. */
export const MIN_COLD_DELAY_MS = 60 * 60 * 1000;

/** Prompts in one free-play run. To calibrate. */
export const FREE_PLAY_COUNT = 20;

/** Minimum share of cold attempts that must be direct recalls for mastery. To calibrate. */
export const MASTERY_ACCURACY = 0.9;

/** Distinct sessions with a cold direct-recall success required for mastery. To calibrate. */
export const MASTERY_SESSIONS = 3;

/** Minimum gap between the two latest successful mastery sessions. To calibrate. */
export const MASTERY_MIN_GAP_MS = 72 * 60 * 60 * 1000;

/** Home-stats trend window length (7 days). To calibrate. */
export const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Relative change that counts as improving / worsening. To calibrate. */
export const TREND_RATIO = 0.05;
