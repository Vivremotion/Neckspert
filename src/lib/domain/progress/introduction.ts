import {
	CURRICULUM_STRINGS,
	LEARNABLE_FRETS,
	mirrorTargets,
	pitchOnString
} from '$lib/domain/music';
import type { StringNumber } from '$lib/domain/music/types';
import {
	cardKey,
	type CardState,
	type IdentifyTarget,
	type LocateTarget,
	type Target
} from '$lib/domain/types';

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
 * Mode 1 introduction queue: naturals, then altered notes, alternating strings 6 to 1.
 * On each string, naturals on a fret marker come first. The only place that fixes the order.
 */
export function introductionOrder(): LocateTarget[] {
	return orderedPositions().map((position) => ({
		direction: 'locate',
		string: position.string,
		pitch: pitchOnString(position.string, position.fret)
	}));
}

/**
 * Next note to introduce: the identify position of an acquired locate card first, in queue
 * order; otherwise the next locate position without a card whose mirror (see `mirrorTargets`)
 * has no card still to acquire. Null when nothing is left.
 */
export function nextNewTarget(cards: readonly CardState[]): Target | null {
	const byKey = new Map(cards.map((card) => [card.key, card]));
	const positions = orderedPositions();
	for (const position of positions) {
		const locate = byKey.get(
			cardKey({
				direction: 'locate',
				string: position.string,
				pitch: pitchOnString(position.string, position.fret)
			})
		);
		const identify: IdentifyTarget = {
			direction: 'identify',
			string: position.string,
			fret: position.fret
		};
		if (locate?.acquiredAt != null && !byKey.has(cardKey(identify))) return identify;
	}
	for (const position of positions) {
		const locate: LocateTarget = {
			direction: 'locate',
			string: position.string,
			pitch: pitchOnString(position.string, position.fret)
		};
		if (byKey.has(cardKey(locate))) continue;
		// A note waits while its mirror is still fragile: learning both at once mixes them up.
		const fragileMirror = mirrorTargets(locate).some((mirror) => {
			const card = byKey.get(cardKey(mirror));
			return card !== undefined && card.acquiredAt === null;
		});
		if (!fragileMirror) return locate;
	}
	return null;
}
