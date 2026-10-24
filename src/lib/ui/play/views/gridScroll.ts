import type { GridStageModel } from '$lib/application/mechanics/chordGrid';
import type { GridChange } from '$lib/domain/grid';
import type { ResponseVerdict } from '$lib/domain/types';

/** Far below a beat: absorbs floating-point error when matching a verdict to its change. */
const BEAT_TOLERANCE = 1e-6;

export type CellState = 'past' | 'current' | 'next' | 'later';

/** The part of a change inside one bar. */
export interface GridCell {
	change: number;
	symbol: string;
	/** Beats it fills in this bar. */
	beats: number;
	/** It began in a bar before: its symbol was written there. */
	continued: boolean;
	state: CellState;
	verdict: ResponseVerdict | null;
}

export interface GridPlacement {
	/** The bars to show, from 0 (the first of the grid). */
	bars: { bar: number; cells: GridCell[] }[];
	/** The change on show, null before the first. */
	current: number | null;
	/** The change after it, null after the last. */
	next: number | null;
	/** The next change is a beat away or less. */
	nextAnnounced: boolean;
}

/**
 * Where each chord of a passage sits on the scrolling line (spec 2026-10-10, section 6): the bars
 * from the current one, the change on show, the next one, announced at least a beat ahead, and
 * the verdict of each change played (from the model's history, at the change's beat). Before its
 * round opens, the model's `anchorBeat` is null: the grid shows from its start, the change next.
 */
export function gridPlacement(
	model: Pick<GridStageModel, 'changes' | 'beatsPerBar' | 'index' | 'anchorBeat' | 'history'>,
	input: {
		nowBeat: number;
		visibleBars: number;
		/** Bars shown before the current one. */
		barsBefore?: number;
	}
): GridPlacement {
	const { changes, beatsPerBar, index, anchorBeat, history } = model;
	const { nowBeat } = input;
	const opened = anchorBeat !== null;
	const current = opened ? index : null;
	const nextIndex = opened ? index + 1 : index;
	const next = nextIndex < changes.length ? nextIndex : null;
	const start = opened ? anchorBeat - changes[index].at : null;
	const nextAnnounced =
		next !== null && start !== null && start + changes[next].at - nowBeat <= 1 + BEAT_TOLERANCE;

	const verdictAt = (change: GridChange): ResponseVerdict | null => {
		if (start === null) return null;
		const beat = start + change.at;
		return (
			history.find((entry) => Math.abs(entry.beatIndex - beat) < BEAT_TOLERANCE)?.verdict ?? null
		);
	};
	const stateOf = (k: number): CellState => {
		if (k === current) return 'current';
		if (k === next) return 'next';
		return current !== null && k < current ? 'past' : 'later';
	};

	const totalBars = Math.ceil(
		(changes.at(-1)!.at + changes.at(-1)!.length) / beatsPerBar - BEAT_TOLERANCE
	);
	const focus = changes[current ?? next ?? 0];
	const firstBar = Math.max(0, Math.floor(focus.at / beatsPerBar) - (input.barsBefore ?? 0));
	const lastBar = Math.min(totalBars, firstBar + input.visibleBars) - 1;
	const bars: GridPlacement['bars'] = [];
	for (let bar = firstBar; bar <= lastBar; bar++) {
		const from = bar * beatsPerBar;
		const to = from + beatsPerBar;
		const cells = changes.flatMap((change, k): GridCell[] => {
			const end = change.at + change.length;
			if (end <= from + BEAT_TOLERANCE || change.at >= to - BEAT_TOLERANCE) return [];
			return [
				{
					change: k,
					symbol: change.symbol,
					beats: Math.min(end, to) - Math.max(change.at, from),
					continued: change.at < from - BEAT_TOLERANCE,
					state: stateOf(k),
					verdict: verdictAt(change)
				}
			];
		});
		bars.push({ bar, cells });
	}
	return { bars, current, next, nextAnnounced };
}
