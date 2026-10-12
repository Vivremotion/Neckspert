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
	/** Bars from the bar: 0 puts the tile's left edge on it, at its change. */
	offset: number;
	state: LinkTileState;
	verdict: Verdict | null;
	/** The first tile still to reach the bar: the beat of the bar shows over it. */
	labelled: boolean;
}

/**
 * Where the link's lane sits at `nowBeat` (spec 2026-10-10, second redesign): one tile per bar,
 * scrolling to the bar, the change asked `now`, the earlier passages from the history. `anchorBeat`
 * is the beat of the change on show; without it, the tiles stand still around it and no beat counts.
 */
export function linkLaneLayout(
	model: LinkLaneModel,
	time: { anchorBeat: number | null; nowBeat: number; history: readonly LaneEntry[] }
): { tiles: LinkLaneTile[]; beat: number | null } {
	const { changes, index, beatsPerBar } = model;
	const anchored = time.anchorBeat !== null;
	const start = anchored ? time.anchorBeat! - changes[index].at : 0;
	const now = anchored ? time.nowBeat : changes[index].at;
	const offsetOf = (beat: number) => (beat - now) / beatsPerBar;
	const verdictAt = (beat: number) =>
		anchored
			? (time.history.find((e) => Math.abs(e.beatIndex - beat) < BEAT_TOLERANCE)?.verdict ?? null)
			: null;
	const stateOf = (i: number): LinkTileState =>
		i < index ? 'past' : i === index ? 'now' : i === index + 1 ? 'next' : 'later';

	const earlier = anchored
		? time.history
				.filter((e) => e.beatIndex < start - BEAT_TOLERANCE)
				.sort((a, b) => a.beatIndex - b.beatIndex)
				.map((e) => ({
					symbol: null,
					offset: offsetOf(e.beatIndex),
					state: 'past' as const,
					verdict: e.verdict,
					labelled: false
				}))
		: [];
	const passage = changes.map((change, i) => ({
		symbol: model.tiles[i] ?? null,
		offset: offsetOf(start + change.at),
		state: stateOf(i),
		verdict: verdictAt(start + change.at),
		labelled: false
	}));
	const tiles = [...earlier, ...passage].filter(
		(t) => t.offset + 1 > -LANE_BARS_BEFORE && t.offset < LANE_BARS_AFTER
	);
	const ahead = tiles.find((t) => t.offset > BEAT_TOLERANCE);
	if (anchored && ahead) ahead.labelled = true;
	const elapsed = Math.floor(time.nowBeat - start + BEAT_TOLERANCE);
	return {
		tiles,
		beat: anchored ? (((elapsed % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1 : null
	};
}
