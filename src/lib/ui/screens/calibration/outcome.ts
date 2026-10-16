import type { CalibrationOutcome } from '$lib/application/ports';

/** What the screen shows at the end: the calibration's outcome, or an input that did not open. */
export type CalibrationScreenOutcome = CalibrationOutcome | { ok: false; reason: 'error' };
