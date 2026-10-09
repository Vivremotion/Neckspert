import type { LaneEntry } from '$lib/application/session/contract';
import type { Verdict } from '$lib/domain/types';

export type LaneTileKind = 'empty' | 'target' | 'band' | 'history';

export interface LaneTile {
	beatIndex: number;
	/** Beat units relative to the hit line: negative = past (left), positive = upcoming (right). */
	offset: number;
	/** Beat-in-bar 1..beatsPerBar for the upcoming window only; null otherwise. */
	label: number | null;
	kind: LaneTileKind;
	verdict: Verdict | null;
	justPlayed: boolean;
	current: boolean;
	/** On a band, its first and last tiles, drawn closed; null inside it and elsewhere. */
	bandEdge: 'start' | 'end' | null;
}

export function laneTiles(input: {
	nowBeat: number;
	beatsPerBar: number;
	promptBeatIndex: number | null;
	targetBeatIndex: number | null;
	/** Beats where a second gesture is expected after the target (`untilBeat` excluded). */
	followUp?: { fromBeat: number; untilBeat: number } | null;
	history: readonly LaneEntry[];
	beatsBefore: number;
	beatsAfter: number;
}): LaneTile[] {
	const { nowBeat, beatsPerBar, targetBeatIndex, history, beatsBefore, beatsAfter } = input;
	const band = input.followUp ?? null;
	const inBand = (beatIndex: number) =>
		band !== null && beatIndex >= band.fromBeat && beatIndex < band.untilBeat;
	const currentBeatIndex = Math.floor(nowBeat) + 1;
	const first = currentBeatIndex - beatsBefore;
	const last = currentBeatIndex + beatsAfter - 1;

	const historyByBeat = new Map<number, LaneEntry>();
	for (const entry of history) {
		historyByBeat.set(entry.beatIndex, entry);
	}

	let justPlayedBeat: number | null = null;
	for (const entry of history) {
		if (entry.beatIndex - nowBeat <= 0) {
			if (justPlayedBeat === null || entry.beatIndex > justPlayedBeat) {
				justPlayedBeat = entry.beatIndex;
			}
		}
	}

	const tiles: LaneTile[] = [];
	for (let beatIndex = first; beatIndex <= last; beatIndex++) {
		const offset = beatIndex - nowBeat;
		const entry = historyByBeat.get(beatIndex);
		const upcoming = beatIndex >= currentBeatIndex && beatIndex < currentBeatIndex + beatsAfter;
		const kind: LaneTileKind = entry
			? 'history'
			: beatIndex === targetBeatIndex
				? 'target'
				: inBand(beatIndex)
					? 'band'
					: 'empty';
		tiles.push({
			beatIndex,
			offset,
			label: upcoming ? (beatIndex % beatsPerBar) + 1 : null,
			kind,
			verdict: entry?.verdict ?? null,
			justPlayed: justPlayedBeat !== null && beatIndex === justPlayedBeat,
			current: beatIndex === currentBeatIndex,
			bandEdge:
				kind !== 'band'
					? null
					: beatIndex === band!.fromBeat
						? 'start'
						: beatIndex === band!.untilBeat - 1
							? 'end'
							: null
		});
	}
	return tiles;
}
