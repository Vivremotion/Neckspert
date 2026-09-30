/** User-facing tempo bounds (README). Metronome technical bounds stay 20..300. */
export const MIN_TEMPO_BPM = 60;
export const MAX_TEMPO_BPM = 140;

export function clampTempo(bpm: number): number {
	const rounded = Math.round(bpm);
	if (rounded < MIN_TEMPO_BPM) return MIN_TEMPO_BPM;
	if (rounded > MAX_TEMPO_BPM) return MAX_TEMPO_BPM;
	return rounded;
}
