import type { ItemEntry } from './types';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The key an entry of `items` names. */
export function itemEntryKey(entry: ItemEntry): string {
	return typeof entry === 'string' ? entry : entry.item;
}

/**
 * The item entry `index` of an exercise's `items` serves: its key read by `parse`, with the
 * entry's length when it gives one. Throws an error naming the entry (`items[2].beats …`, or
 * `items[2] ("key"): …` for a key `parse` refuses).
 */
export function itemOfEntry(
	parse: (itemKey: string) => unknown,
	entry: unknown,
	index: number
): unknown {
	const field = `items[${index}]`;
	let key: unknown = entry;
	let beats: number | undefined;
	if (isObject(entry)) {
		const { item, beats: length, ...rest } = entry;
		const unknown = Object.keys(rest)[0];
		if (unknown !== undefined) throw new Error(`${field}: unknown key "${unknown}"`);
		if (typeof length !== 'number' || !Number.isFinite(length) || length <= 0) {
			throw new Error(`${field}.beats must be a positive number`);
		}
		key = item;
		beats = length;
	}
	if (typeof key !== 'string') throw new Error(`${field} must be a key or { item, beats }`);
	let parsed: unknown;
	try {
		parsed = parse(key);
	} catch (error) {
		throw new Error(`${field} (${JSON.stringify(key)}): ${(error as Error).message}`, {
			cause: error
		});
	}
	return beats === undefined ? parsed : { ...(parsed as object), beats };
}
