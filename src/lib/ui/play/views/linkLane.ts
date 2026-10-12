import type { LinkLaneModel, LinkTile } from '$lib/application/mechanics/chordGrid';
import type { LaneEntry } from '$lib/application/session/contract';
import type { Verdict } from '$lib/domain/types';

/** Bars kept on show behind the bar. */
export const LANE_BARS_BEFORE = 2;
/** Bars on show ahead of the bar. */
export const LANE_BARS_AFTER = 4;

/** Far below a beat: absorbs floating-point error when matching a verdict to its change. */
const BEAT_TOLERANCE = 1e-6;

export type LinkTileState = 'past' | 'now' | 'next' | 'later';

export interface LinkLaneTile {
	/** Null: a bar of an earlier passage, drawn from the history. */
	symbol: LinkTile | null;
	/** Bars from the bar line, whole: -1 is the bar under way, ending on the line; 0 starts there. */
	offset: number;
	state: LinkTileState;
	verdict: Verdict | null;
	/** The tile right of the bar line: the beat of the bar shows over it. */
	labelled: boolean;
}

/**
 * Where the link's lane sits at `nowBeat` (spec 2026-10-10, second redesign): one tile per bar,
 * moving a whole bar at a time like the notes' lane moves a beat. The bar under way ends on the
 * line, the next starts there; after the last bar, the next tour as if the tour went on (it stops
 * there once a tour succeeds). `anchorBeat` is the beat of the change on show; without it, the
 * change asked stands right of the line and no beat counts. Earlier passages come from the history.
 */
export function linkLaneLayout(
	model: LinkLaneModel,
	time: { anchorBeat: number | null; nowBeat: number; history: readonly LaneEntry[] }
): { tiles: LinkLaneTile[]; beat: number | null } {
	const { changes, index, beatsPerBar } = model;
	const anchored = time.anchorBeat !== null;
	const start = anchored ? time.anchorBeat! - changes[index].at : 0;
	const barOf = (beat: number) => Math.floor((beat - start) / beatsPerBar + BEAT_TOLERANCE);
	const current = anchored ? barOf(time.nowBeat) : barOf(changes[index].at) - 1;
	const offsetOf = (bar: number) => bar - current - 1;
	const verdictAt = (beat: number) =>
		anchored
			? (time.history.find((e) => Math.abs(e.beatIndex - beat) < BEAT_TOLERANCE)?.verdict ?? null)
			: null;
	const stateOf = (i: number): LinkTileState =>
		i < index ? 'past' : i === index ? 'now' : i === index + 1 ? 'next' : 'later';

	// One tile per bar: the last verdict of a bar of another passage stands for it.
	const earlierByBar = new Map<number, Verdict>();
	if (anchored) {
		for (const e of [...time.history].sort((a, b) => a.beatIndex - b.beatIndex)) {
			if (e.beatIndex < start - BEAT_TOLERANCE) earlierByBar.set(barOf(e.beatIndex), e.verdict);
		}
	}
	const earlier = [...earlierByBar].map(([bar, verdict]) => ({
		symbol: null,
		offset: offsetOf(bar),
		state: 'past' as const,
		verdict,
		labelled: false
	}));
	const passage = changes.map((change, i) => ({
		symbol: model.tiles[i] ?? null,
		offset: offsetOf(barOf(start + change.at)),
		state: stateOf(i),
		verdict: verdictAt(start + change.at),
		labelled: false
	}));
	const lastBar = barOf(start + changes[changes.length - 1].at);
	const following = model.following.map((symbol, j) => ({
		symbol,
		offset: offsetOf(lastBar + 1 + j),
		state: stateOf(changes.length + j),
		verdict: null,
		labelled: false
	}));
	const tiles = [...earlier, ...passage, ...following].filter(
		(t) => t.offset >= -LANE_BARS_BEFORE - 1 && t.offset <= LANE_BARS_AFTER - 1
	);
	const right = tiles.find((t) => t.offset === 0);
	if (anchored && right) right.labelled = true;
	const elapsed = Math.floor(time.nowBeat - start + BEAT_TOLERANCE);
	return {
		tiles,
		beat: anchored ? (((elapsed % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1 : null
	};
}
