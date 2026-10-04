import { TEMPO_MAX_BPM, TEMPO_MIN_BPM, clampTempo } from '$lib/domain/progress';

/**
 * User-facing tempo bounds: the same as the tempo adapted between learn sessions. Below
 * 80 bpm the 2-beat lead would outlast the direct-recall threshold. Metronome technical
 * bounds stay 20..300.
 */
export const MIN_TEMPO_BPM = TEMPO_MIN_BPM;
export const MAX_TEMPO_BPM = TEMPO_MAX_BPM;

export { clampTempo };
