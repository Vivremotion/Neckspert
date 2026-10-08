import {
	LEARNABLE_FRETS,
	locateItemKey,
	parseVoicingKey,
	pitchOnString,
	voicingOccurrences,
	type LocateItem
} from '$lib/domain/music';
import { cardKey, type CardState } from '$lib/domain/types';

/**
 * The notes to learn first in locate (spec 2026-10-08, section 2): every position, string by
 * string, of the shapes of the triads being anchored (introduced, not acquired), frets 1 to 11,
 * that locate has not acquired. Oldest triad first, once each.
 */
export function triadNotesToLearn(cards: readonly CardState[]): LocateItem[] {
	const byKey = new Map(cards.map((card) => [card.key, card]));
	const anchoring = cards
		.filter((card) => card.mechanic === 'triad-anchor' && card.acquiredAt === null)
		.sort((a, b) => a.introducedAt - b.introducedAt || a.key.localeCompare(b.key));
	const notes: LocateItem[] = [];
	const seen = new Set<string>();
	for (const card of anchoring) {
		const voicing = parseVoicingKey((card.item as { voicingKey: string }).voicingKey);
		for (const { string } of voicing.strings) {
			for (const occurrence of voicingOccurrences(voicing)) {
				const note = occurrence.notes.find((n) => n.string === string);
				if (!note || !LEARNABLE_FRETS.includes(note.fret)) continue;
				const item: LocateItem = { string, pitch: pitchOnString(string, note.fret) };
				const key = locateItemKey(item);
				if (seen.has(key)) continue;
				seen.add(key);
				if (byKey.get(cardKey('locate', key))?.acquiredAt == null) notes.push(item);
			}
		}
	}
	return notes;
}
