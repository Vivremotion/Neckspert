import {
	CURRICULUM_STRINGS,
	LEARNABLE_FRETS,
	mirrorItems,
	neckCardKey,
	pitchOnString,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import type { StringNumber } from '$lib/domain/music/types';
import type { CardState } from '$lib/domain/types';

/** Fret markers: naturals on them come first on each string. */
const MARKER_FRETS: readonly number[] = [3, 5, 7, 9];

interface Position {
	string: StringNumber;
	fret: number;
	natural: boolean;
}

function positionsOf(string: StringNumber): Position[] {
	return LEARNABLE_FRETS.map((fret) => ({
		string,
		fret,
		natural: !pitchOnString(string, fret).includes('#')
	}));
}

/** Takes the first remaining position of each string in turn, skipping exhausted strings. */
function alternate(columns: readonly Position[][]): Position[] {
	const result: Position[] = [];
	const longest = Math.max(...columns.map((column) => column.length));
	for (let rank = 0; rank < longest; rank++) {
		for (const column of columns) {
			if (rank < column.length) result.push(column[rank]);
		}
	}
	return result;
}

function orderedPositions(): Position[] {
	const naturals = CURRICULUM_STRINGS.map((string) => {
		const own = positionsOf(string).filter((position) => position.natural);
		const onMarker = own.filter((position) => MARKER_FRETS.includes(position.fret));
		const others = own.filter((position) => !MARKER_FRETS.includes(position.fret));
		return [...onMarker, ...others];
	});
	const altered = CURRICULUM_STRINGS.map((string) =>
		positionsOf(string).filter((position) => !position.natural)
	);
	return [...alternate(naturals), ...alternate(altered)];
}

/**
 * The positions of `priority` (locate items, fret 1 to 11 on their string), in their order and
 * once each, then the rest of the queue.
 */
function prioritized(priority: readonly LocateItem[]): Position[] {
	const positions = orderedPositions();
	const first: Position[] = [];
	for (const item of priority) {
		const position = positions.find(
			(p) => p.string === item.string && pitchOnString(p.string, p.fret) === item.pitch
		);
		if (position && !first.includes(position)) first.push(position);
	}
	return [...first, ...positions.filter((position) => !first.includes(position))];
}

function locateAt(position: Position): { mechanic: 'locate'; item: LocateItem } {
	return {
		mechanic: 'locate',
		item: { string: position.string, pitch: pitchOnString(position.string, position.fret) }
	};
}

/**
 * Locate introduction queue: naturals, then altered notes, alternating strings 6 to 1.
 * On each string, naturals on a fret marker come first. The only place that fixes the order.
 * `priority` (the notes of the triads being learned) comes before everything, in its order.
 */
export function introductionOrder(priority: readonly LocateItem[] = []): LocateItem[] {
	return prioritized(priority).map((position) => ({
		string: position.string,
		pitch: pitchOnString(position.string, position.fret)
	}));
}

/**
 * Next card to introduce (queue led by `priority`): the identify position of an acquired locate
 * card first, in queue order; otherwise the next locate position without a card whose mirror (see `mirrorItems`)
 * has no card still to acquire. Null when nothing is left.
 */
export function nextNewCard(
	cards: readonly CardState[],
	priority: readonly LocateItem[] = []
): NeckCard | null {
	const byKey = new Map(cards.map((card) => [card.key, card]));
	const positions = prioritized(priority);
	for (const position of positions) {
		const locate = byKey.get(neckCardKey(locateAt(position)));
		const identify: NeckCard = {
			mechanic: 'identify',
			item: { string: position.string, fret: position.fret }
		};
		if (locate?.acquiredAt != null && !byKey.has(neckCardKey(identify))) return identify;
	}
	for (const position of positions) {
		const locate = locateAt(position);
		if (byKey.has(neckCardKey(locate))) continue;
		// A note waits while its mirror is still fragile: learning both at once mixes them up.
		const fragileMirror = mirrorItems(locate.item).some((mirror) => {
			const card = byKey.get(neckCardKey({ mechanic: 'locate', item: mirror }));
			return card !== undefined && card.acquiredAt === null;
		});
		if (!fragileMirror) return locate;
	}
	return null;
}
