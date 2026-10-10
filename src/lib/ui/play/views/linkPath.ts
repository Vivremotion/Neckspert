import type { LinkPathModel } from '$lib/application/mechanics/chordGrid';
import type { LaneEntry } from '$lib/application/session/contract';
import type { StringNumber } from '$lib/domain/music/types';
import type { Verdict } from '$lib/domain/types';

/** Far below a beat: absorbs floating-point error when matching a verdict to its change. */
const BEAT_TOLERANCE = 1e-6;

export type ShapeState = 'current' | 'next' | 'other';

export interface LinkPathLayout {
	/** The frets drawn, low first: a fret either side of the shapes, from fret 1 (0 with an open string). */
	frets: number[];
	/** The strings of the set, the high one on top. */
	strings: { string: StringNumber; name: string }[];
	/** The shape to play now (its number), or the first one before the passage starts. */
	current: number;
	next: number | null;
	/** 'first' before the first change, 'now' once the passage runs. */
	label: 'first' | 'now';
	/** From the top shape on: the way goes back down. */
	descending: boolean;
	/** Beats of the current bar already begun, 0 to 4. */
	filledBeats: number;
	/** Every note of every shape, when the passage is aided; none otherwise. */
	dots: { string: StringNumber; fret: number; number: number; state: ShapeState }[];
	/** Each shape's frets, its number and the verdict of its latest change. */
	blocks: {
		number: number;
		from: number;
		to: number;
		state: ShapeState;
		verdict: Verdict | null;
	}[];
	/** Between two shapes in a row, the way the passage goes. */
	arrows: { fret: number; direction: 'up' | 'down' }[];
}

/**
 * Where the link's path sits on the neck (spec 2026-10-10, « Réalisation »): the frets of the
 * passage's shapes, numbered in playing order, the one to play now and the next one, the beats of
 * the current bar, and each shape's last verdict. Pure: the view only draws it.
 */
export function linkPathLayout(
	model: LinkPathModel,
	time: { targetBeatIndex: number | null; nowBeat: number; history: readonly LaneEntry[] }
): LinkPathLayout {
	const { shapes, path, changes, index } = model;
	const started = time.targetBeatIndex !== null;
	const currentShape = path[index];
	const nextShape = path[index + 1] ?? null;
	const top = shapes.length - 1;
	// From the top on, the way goes back down.
	const descending = started && index >= path.indexOf(top);
	const stateOf = (shape: number): ShapeState =>
		shape === currentShape ? 'current' : shape === nextShape ? 'next' : 'other';

	const fretted = shapes.flatMap((shape) => shape.notes.map((n) => n.fret)).filter((f) => f > 0);
	const open = shapes.some((shape) => shape.notes.some((n) => n.fret === 0));
	const low = open ? 0 : Math.max(1, Math.min(...fretted) - 1);
	const high = Math.max(...fretted) + 1;
	const frets = Array.from({ length: high - low + 1 }, (_, i) => low + i);

	const start = started ? time.targetBeatIndex! - changes[index].at : null;
	const verdictOf = (shape: number): Verdict | null => {
		if (start === null) return null;
		let verdict: Verdict | null = null;
		path.forEach((played, k) => {
			if (played !== shape) return;
			const beat = start + changes[k].at;
			const entry = time.history.find((e) => Math.abs(e.beatIndex - beat) < BEAT_TOLERANCE);
			if (entry) verdict = entry.verdict;
		});
		return verdict;
	};

	const blocks = shapes.map((shape, i) => {
		const shapeFrets = shape.notes.map((n) => n.fret);
		return {
			number: shape.number,
			from: Math.min(...shapeFrets),
			to: Math.max(...shapeFrets),
			state: stateOf(i),
			verdict: verdictOf(i)
		};
	});
	const arrows = blocks.slice(1).map((block, i) => ({
		fret: Math.round((blocks[i].to + block.from) / 2),
		direction: descending ? ('down' as const) : ('up' as const)
	}));
	const dots = model.aided
		? shapes.flatMap((shape, i) =>
				shape.notes.map((note) => ({ ...note, number: shape.number, state: stateOf(i) }))
			)
		: [];
	const elapsed = started ? time.nowBeat - time.targetBeatIndex! : -1;
	const filledBeats =
		elapsed < -BEAT_TOLERANCE
			? 0
			: Math.min(model.beatsPerBar, Math.floor(elapsed + BEAT_TOLERANCE) + 1);

	return {
		frets,
		strings: [...model.strings].reverse(),
		current: shapes[currentShape].number,
		next: nextShape === null ? null : shapes[nextShape].number,
		label: started ? 'now' : 'first',
		descending,
		filledBeats,
		dots,
		blocks,
		arrows
	};
}
