/** Share of cold attempts that were correct; null when none. */
export function coldAccuracyRatio(coldCorrect: number, coldCount: number): number | null {
	if (coldCount <= 0) return null;
	return coldCorrect / coldCount;
}
