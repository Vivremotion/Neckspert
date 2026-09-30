/** Minimum gap after the previous attempt before the next one counts as cold. To calibrate. */
export const MIN_COLD_DELAY_MS = 60 * 60 * 1000;

/** Max cold review prompts in one daily session. To calibrate. */
export const DAILY_COLD_CAP = 20;

/** New targets introduced per daily session (warm learning). To calibrate. */
export const NEW_PER_SESSION = 3;

/** Fraction of a required set that must be acquired to unlock the next. To calibrate. */
export const UNLOCK_RATIO = 0.8;

/** Minimum share of cold attempts that must be direct recalls for mastery. To calibrate. */
export const MASTERY_ACCURACY = 0.9;

/** Distinct sessions with a cold direct-recall success required for mastery. To calibrate. */
export const MASTERY_SESSIONS = 3;

/** Minimum gap between the two latest successful mastery sessions. To calibrate. */
export const MASTERY_MIN_GAP_MS = 72 * 60 * 60 * 1000;

/** Suggested rest before the next session after a summary. To calibrate. */
export const NEXT_SESSION_GAP_MS = 2 * 60 * 60 * 1000;

/** Home-stats trend window length (7 days). To calibrate. */
export const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Relative change that counts as improving / worsening. To calibrate. */
export const TREND_RATIO = 0.05;
