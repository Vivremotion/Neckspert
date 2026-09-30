/**
 * Pure scheduling step: indexes ≥ nextIndex whose beat time lies in (now, now + horizon].
 * Beats already in the past are skipped: a late click is worse than a missing one.
 */
export function beatsToSchedule(input: {
	nextIndex: number;
	firstBeatTime: number;
	secondsPerBeat: number;
	now: number;
	horizon: number;
}): number[] {
	const { nextIndex, firstBeatTime, secondsPerBeat, now, horizon } = input;
	if (!(secondsPerBeat > 0)) {
		throw new RangeError(`secondsPerBeat must be positive, got ${secondsPerBeat}`);
	}
	const timeOf = (index: number) => firstBeatTime + index * secondsPerBeat;
	const end = now + horizon;
	let index = Math.max(nextIndex, Math.floor((now - firstBeatTime) / secondsPerBeat));
	while (timeOf(index) <= now) index++;
	const indexes: number[] = [];
	for (; timeOf(index) <= end; index++) indexes.push(index);
	return indexes;
}
