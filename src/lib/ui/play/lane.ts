import type { LaneEntry } from '$lib/application/session/contract';
import type { ResponseVerdict } from '$lib/domain/types';

export type LaneTileKind = 'empty' | 'target' | 'band' | 'history';

export interface LaneTile {
	beatIndex: number;
	/** Beat units relative to the hit line: negative = past (left), positive = upcoming (right). */
	offset: number;
	/** First beat of a bar. */
	downbeat: boolean;
	kind: LaneTileKind;
	verdict: ResponseVerdict | null;
	justPlayed: boolean;
	current: boolean;
	/**
	 * On a band, its first and last tiles, drawn closed (`both`: a one-beat band, closed on both
	 * sides); null inside it and elsewhere.
	 */
	bandEdge: 'start' | 'end' | 'both' | null;
}

/** Beats where an extended expectation is played (`untilBeat` excluded). */
export interface LaneBand {
	fromBeat: number;
	untilBeat: number;
}

/**
 * The lane shows one bar behind and two bars ahead, and always holds the
 * announced target and every band that follows it.
 */
export function laneWindow(input: {
	nowBeat: number;
	beatsPerBar: number;
	targetBeatIndex: number | null;
	bands: readonly LaneBand[];
}): { beatsBefore: number; beatsAfter: number } {
	const { nowBeat, beatsPerBar, targetBeatIndex, bands } = input;
	// Up to one beat past the target, or to the end of the last band that follows it.
	const last =
		bands.length > 0
			? Math.max(...bands.map((band) => band.untilBeat))
			: targetBeatIndex === null
				? null
				: targetBeatIndex + 1;
	const held = last === null ? 0 : last - Math.floor(nowBeat);
	return { beatsBefore: beatsPerBar, beatsAfter: Math.max(2 * beatsPerBar, held) };
}

export function laneTiles(input: {
	nowBeat: number;
	beatsPerBar: number;
	promptBeatIndex: number | null;
	targetBeatIndex: number | null;
	/** Beats where a further gesture is expected after the target, one band each. */
	bands?: readonly LaneBand[];
	history: readonly LaneEntry[];
	beatsBefore: number;
	beatsAfter: number;
}): LaneTile[] {
	const { nowBeat, beatsPerBar, targetBeatIndex, history, beatsBefore, beatsAfter } = input;
	const bands = input.bands ?? [];
	const bandAt = (beatIndex: number) =>
		bands.find((band) => beatIndex >= band.fromBeat && beatIndex < band.untilBeat) ?? null;
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
		const band = bandAt(beatIndex);
		const kind: LaneTileKind = entry
			? 'history'
			: beatIndex === targetBeatIndex
				? 'target'
				: band !== null
					? 'band'
					: 'empty';
		tiles.push({
			beatIndex,
			offset,
			downbeat: beatIndex % beatsPerBar === 0,
			kind,
			verdict: entry?.verdict ?? null,
			justPlayed: justPlayedBeat !== null && beatIndex === justPlayedBeat,
			current: beatIndex === currentBeatIndex,
			bandEdge: kind === 'band' && band !== null ? bandEdgeOf(beatIndex, band) : null
		});
	}
	return tiles;
}

function bandEdgeOf(beatIndex: number, band: LaneBand): LaneTile['bandEdge'] {
	const first = beatIndex === band.fromBeat;
	const last = beatIndex === band.untilBeat - 1;
	return first && last ? 'both' : first ? 'start' : last ? 'end' : null;
}

/**
 * How many cells the cell just played sits left of the now line (0: right before it), counted
 * among the past tiles; null when it is no longer on the lane. The caption under it is anchored
 * there, outside the lane's clip, and kept inside the lane's left edge.
 */
export function justPlayedBack(tiles: readonly LaneTile[]): number | null {
	const past = tiles.filter((tile) => tile.offset <= 0);
	const index = past.findIndex((tile) => tile.justPlayed);
	return index < 0 ? null : past.length - 1 - index;
}

/**
 * The first band's visible cells, as positions on the lane (index of its first visible tile, from
 * the lane's left edge, and how many follow, up to where the next band starts): its name runs
 * across them from its left edge.
 */
export function bandSpan(tiles: readonly LaneTile[]): { start: number; cells: number } | null {
	const start = tiles.findIndex((tile) => tile.kind === 'band');
	if (start < 0) return null;
	let cells = 1;
	const opensBand = (tile: LaneTile) => tile.bandEdge === 'start' || tile.bandEdge === 'both';
	while (tiles[start + cells]?.kind === 'band' && !opensBand(tiles[start + cells])) cells++;
	return { start, cells };
}
