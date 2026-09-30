export function barLabel(input: {
	nowBeat: number;
	promptBeatIndex: number;
	targetBeatIndex: number;
	beatsPerBar: number;
}): { bar: number; bars: number; beat: number } {
	const { nowBeat, promptBeatIndex, targetBeatIndex, beatsPerBar } = input;
	const leadBeats = Math.max(1, targetBeatIndex - promptBeatIndex);
	const bars = Math.max(1, Math.ceil(leadBeats / beatsPerBar));
	const raw = Math.floor(nowBeat - promptBeatIndex);
	const progressBeat = Math.min(leadBeats - 1, Math.max(0, raw));
	const bar = Math.min(bars, Math.floor(progressBeat / beatsPerBar) + 1);
	const beat = (progressBeat % beatsPerBar) + 1;
	return { bar, bars, beat };
}
