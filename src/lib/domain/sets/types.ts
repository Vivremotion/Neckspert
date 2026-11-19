import type { Member } from '../families/core/types';
import type { ItemSetName } from './names';

/** What the code knows of the items of a registered set: their key and what a card keeps. */
export interface ItemSet<I = unknown> {
	id: ItemSetName | string;
	itemKey(item: I): string;
	/** Throws on an invalid key (backup validation). */
	parseItem(itemKey: string): I;
	/**
	 * The part of a prompted item its card keeps, when a prompt adds to it (a position drawn for
	 * this prompt only); the item itself without it. `parseItem` returns this part.
	 */
	cardItem?(item: I): unknown;
	/**
	 * The item a prompt asks when a member was drawn for a card's item (its place, what the prompt
	 * names); may take more numbers of `random` for what it draws beside the member.
	 */
	asked?(item: I, member: Member, random: () => number): I;
	/** The id of the family member an asked item names; null when it names none. */
	memberOf?(item: I): string | null;
}
