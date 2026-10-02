/** Minimum gap after the previous attempt before the next one counts as cold. To calibrate. */
export const MIN_COLD_DELAY_MS = 60 * 60 * 1000;

/** Length of a learn session; no prompt starts after it. To calibrate. */
export const LEARN_SESSION_MS = 5 * 60 * 1000;

/** Max cold review prompts in one learn session. To calibrate. */
export const LEARN_COLD_CAP = 20;

/** Max cards being learned at once (learnedAt null). To calibrate. */
export const LEARNING_SLOTS = 3;

/** Max learned cards not yet acquired; above it no new note enters. To calibrate. */
export const MAX_UNCONSOLIDATED = 10;

/** Lead of the aided presentation of a new note (mode 1). To calibrate. */
export const LEARN_PRESENT_LEAD_BEATS = 8;

/** Prompts between a learning attempt and its unaided retest, by successes so far. To calibrate. */
export const LEARN_RETEST_GAPS = [2, 4] as const;

/** Unaided direct recalls in a row that make a note learned. To calibrate. */
export const LEARN_SUCCESSES = 2;

/** Consolidation skips cards served in the last N prompts. To calibrate. */
export const CONSOLIDATION_SKIP_RECENT = 2;

/** Consolidation favors cards confused in their last N attempts. To calibrate. */
export const CONFUSION_LOOKBACK = 3;

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
