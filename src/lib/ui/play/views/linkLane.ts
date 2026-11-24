import type { PassageRound, PassageStageModel } from '$lib/application/presentation/passageStage';
import type { LaneEntry } from '$lib/application/session/contract';
import type { ResponseVerdict } from '$lib/domain/types';
import type { LaneTile } from '$lib/ui/play/lane';

/** Bars on show behind the hit line, as on the notes' lane. */
export const LANE_BARS_BEFORE = 1;
/** Bars on show ahead of it. */
export const LANE_BARS_AFTER = 2;

/** Far below a beat: absorbs floating-point error when matching a round or a verdict to its beat. */
const BEAT_TOLERANCE = 1e-6;

/** The arrow of a round that lies higher or lower than the one before. */
const ARROWS: Partial<Record<NonNullable<PassageRound['way']>, string>> = { up: '↗', down: '↘' };

/** What a round's tile shows: the arrow of its way, else its words (the first round's chord). */
const markOf = ({ way, label }: PassageRound): string => (way && ARROWS[way]) ?? label;

export interface LinkLaneTile {
	beatIndex: number;
	/** Beats from now: past (left of the hit line) at 0 and below, ahead above. */
	offset: number;
	/**
	 * On the first beat of its round, the way to the shape (↗, ↘), else the round's words; null on
	 * the other beats.
	 */
	symbol: string | null;
	/** The change asked: the session listens for it. */
	due: boolean;
	/** The first beat of a bar, once the lane runs in time; a tone lighter on the lane. */
	downbeat: boolean;
	verdict: ResponseVerdict | null;
	/** The latest verdict played. */
	justPlayed: boolean;
}

/**
 * The link's lane (spec 2026-10-10, second redesign, after trying it): the notes' lane, a tile per
 * beat, the way only on the first beat of each round (the first round's words), the round asked
 * due; nothing after the last round; no beat numbers (« Près du silence », 2026-10-22: the first
 * beat of a bar is a tone lighter instead). The model's `anchorBeat`
 * is the beat of the change on show once its round is open; before, `countedBeat` is where the
 * counted bar ends. Without either, that change waits on the next beat and nothing counts.
 */
export function linkLaneLayout(
	model: Pick<PassageStageModel, 'rounds' | 'index' | 'beatsPerBar' | 'anchorBeat' | 'history'>,
	time: { nowBeat: number; countedBeat?: number | null }
): LinkLaneTile[] {
	const { rounds, index, beatsPerBar, history } = model;
	const anchorBeat = model.anchorBeat ?? time.countedBeat ?? null;
	const anchored = anchorBeat !== null;
	const anchor = anchorBeat ?? Math.floor(time.nowBeat) + 1;
	// An empty line has no round to anchor: its beats alone.
	const start = anchor - (rounds[index]?.at ?? 0);

	// Each round on the tile of its beat, a float's error absorbed; a round that starts between
	// two beats has no tile.
	const symbols = new Map<number, { symbol: string; change: number }>();
	rounds.forEach((round, i) => {
		const at = start + round.at;
		const beat = Math.round(at);
		if (Math.abs(at - beat) < BEAT_TOLERANCE) {
			symbols.set(beat, { symbol: markOf(round), change: i });
		}
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
	// One bar behind, two ahead, in the exercise's meter: the lane's cells are sized on it.
	const before = LANE_BARS_BEFORE * beatsPerBar;
	const after = LANE_BARS_AFTER * beatsPerBar;
	for (let beat = current - before; beat < current + after; beat++) {
		const entry = played.find((e) => Math.abs(e.beatIndex - beat) < BEAT_TOLERANCE) ?? null;
		const on = symbols.get(beat) ?? null;
		const inBar = (((beat - start) % beatsPerBar) + beatsPerBar) % beatsPerBar;
		tiles.push({
			beatIndex: beat,
			offset: beat - time.nowBeat,
			symbol: on?.symbol ?? null,
			due: on?.change === index,
			downbeat: anchored && inBar === 0,
			verdict: entry?.verdict ?? null,
			justPlayed: entry !== null && entry === latest
		});
	}
	return tiles;
}

/**
 * The link's tiles as the notes' lane draws them (`Lane`): a played beat is history with its
 * verdict, the change asked is the target, the way of a round is the words of its first beat.
 */
export function laneTilesOfLink(tiles: readonly LinkLaneTile[]): LaneTile[] {
	return tiles.map((tile) => ({
		beatIndex: tile.beatIndex,
		offset: tile.offset,
		downbeat: tile.downbeat,
		kind: tile.verdict !== null ? 'history' : tile.due ? 'target' : 'empty',
		verdict: tile.verdict,
		justPlayed: tile.justPlayed,
		current: tile.offset > 0 && tile.offset <= 1,
		bandEdge: null,
		label: tile.symbol
	}));
}
