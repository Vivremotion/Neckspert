import type { PassageRound, PassageStageModel } from '$lib/application/presentation/passageStage';
import type { LaneEntry } from '$lib/application/session/contract';
import type { ResponseVerdict } from '$lib/domain/types';

/** Beats on show behind the hit line, as on the notes' lane. */
export const LANE_BEATS_BEFORE = 4;
/** Beats on show ahead of it: two bars. */
export const LANE_BEATS_AFTER = 8;

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
	/** Beat in the bar, 1 to 4, on the beats ahead, once the lane runs in time. */
	label: number | null;
	verdict: ResponseVerdict | null;
	/** The latest verdict played. */
	justPlayed: boolean;
}

/**
 * The link's lane (spec 2026-10-10, second redesign, after trying it): the notes' lane, a tile per
 * beat, the way only on the first beat of each round (the first round's words), the round asked
 * due; nothing after the last round. The model's `anchorBeat`
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
