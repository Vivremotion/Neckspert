import type { LinkLaneModel, LinkTile } from '$lib/application/mechanics/chordGrid';
import type { LaneEntry } from '$lib/application/session/contract';
import type { ResponseVerdict } from '$lib/domain/types';

/** Beats on show behind the hit line, as on the notes' lane. */
export const LANE_BEATS_BEFORE = 4;
/** Beats on show ahead of it: two bars. */
export const LANE_BEATS_AFTER = 8;

/** Far below a beat: absorbs floating-point error when matching a verdict to its change. */
const BEAT_TOLERANCE = 1e-6;

export interface LinkLaneTile {
	beatIndex: number;
	/** Beats from now: past (left of the hit line) at 0 and below, ahead above. */
	offset: number;
	/** The way to the shape, on the first beat of its bar; null on the other beats. */
	symbol: LinkTile | null;
	/** The change asked: the session listens for it. */
	due: boolean;
	/** Beat in the bar, 1 to 4, on the beats ahead, once the lane runs in time. */
	label: number | null;
	verdict: ResponseVerdict | null;
	/** The latest verdict played. */
	justPlayed: boolean;
}

/**
 * The link's lane (spec 2026-10-10, second redesign, after trying it): the notes' lane, a tile per
 * beat, the way only on the first beat of each bar, the change asked due. After the last bar, the
 * next tour as if the tour went on (it stops there once a tour succeeds). The model's `anchorBeat`
 * is the beat of the change on show once its round is open; before, `countedBeat` is where the
 * counted bar ends. Without either, that change waits on the next beat and nothing counts.
 */
export function linkLaneLayout(
	model: LinkLaneModel,
	time: { nowBeat: number; countedBeat?: number | null }
): LinkLaneTile[] {
	const { changes, index, beatsPerBar, history } = model;
	const anchorBeat = model.anchorBeat ?? time.countedBeat ?? null;
	const anchored = anchorBeat !== null;
	const anchor = anchorBeat ?? Math.floor(time.nowBeat) + 1;
	const start = anchor - changes[index].at;
	const lastAt = changes[changes.length - 1].at;

	const symbols = new Map<number, { symbol: LinkTile; change: number }>();
	changes.forEach((change, i) => {
		const symbol = model.tiles[i];
		if (symbol) symbols.set(start + change.at, { symbol, change: i });
	});
	model.following.forEach((symbol, j) => {
		symbols.set(start + lastAt + beatsPerBar * (j + 1), { symbol, change: changes.length + j });
	});

	const played = anchored
		? history.filter((e) => e.beatIndex <= time.nowBeat + BEAT_TOLERANCE)
		: [];
	const latest = played.reduce<LaneEntry | null>(
		(last, e) => (!last || e.beatIndex > last.beatIndex ? e : last),
		null
	);

	const current = Math.floor(time.nowBeat) + 1;
	const tiles: LinkLaneTile[] = [];
	for (let beat = current - LANE_BEATS_BEFORE; beat < current + LANE_BEATS_AFTER; beat++) {
		const entry = played.find((e) => Math.abs(e.beatIndex - beat) < BEAT_TOLERANCE) ?? null;
		const on = symbols.get(beat) ?? null;
		const inBar = (((beat - start) % beatsPerBar) + beatsPerBar) % beatsPerBar;
		tiles.push({
			beatIndex: beat,
			offset: beat - time.nowBeat,
			symbol: on?.symbol ?? null,
			due: on?.change === index,
			label: anchored && beat >= current ? inBar + 1 : null,
			verdict: entry?.verdict ?? null,
			justPlayed: entry !== null && entry === latest
		});
	}
	return tiles;
}
