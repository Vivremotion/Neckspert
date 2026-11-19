import { parseVoicingKey, voicingOccurrences } from '$lib/domain/music';
import { cueFrets, occurrencePosition } from '$lib/domain/triads/position';

/**
 * What a prompt asks of a card's item: the item, with what the draw adds. `previous` is the item
 * last asked of this card, null before any.
 */
export type Draw = (item: unknown, previous: unknown | null, random: () => number) => unknown;

function pick<T>(candidates: readonly T[], random: () => number): T | null {
	if (candidates.length === 0) return null;
	return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/**
 * A shape of the voicing other than the one `previous` asked (any when it names none, or when
 * there is no other), and a fret it covers. Stateless: the previous item is passed.
 * (Same computation as the triads' zone subject, which a later task deletes.)
 */
const anotherPlace: Draw = (item, previous, random) => {
	const voicing = (item as { voicingKey: string }).voicingKey;
	const shapes = voicingOccurrences(parseVoicingKey(voicing));
	const positions = shapes.map(occurrencePosition);
	const last = (previous as { position?: number | 'open' } | null)?.position;
	const others = positions.filter((position) => position !== last);
	const position = pick(others.length > 0 ? others : positions, random) ?? positions[0];
	const shape = shapes.find((occurrence) => occurrencePosition(occurrence) === position);
	const fret = shape ? pick(cueFrets(shape), random) : null;
	return fret === null
		? { voicingKey: voicing, position }
		: { voicingKey: voicing, position, fret };
};

/** The draw `name` of set `set`; null when none is registered. */
export function drawNamed(name: string, set: string): Draw | null {
	if (name === 'another-place' && set === 'voicing-on-strings') return anotherPlace;
	return null;
}
