import { idProblem, RESERVED_IDS } from '$lib/domain/definitions/ids';
import { ITEM_SET_NAMES } from '$lib/domain/sets/names';
import type { SkillDefinition } from './types';

const KEYS = ['id', 'name', 'items', 'memory', 'directRecall'];

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A skill written in a JSON file. Throws an `Error` naming the field when the value is no skill
 * or has a key a skill does not know.
 */
export function skillFromJson(json: unknown): SkillDefinition {
	if (!isObject(json)) throw new Error('a skill must be a JSON object');
	const unknown = Object.keys(json).find((key) => !KEYS.includes(key));
	if (unknown !== undefined) throw new Error(`unknown key "${unknown}"`);
	const { id, name, items, memory, directRecall } = json;
	const badId = idProblem(id, { reserved: RESERVED_IDS });
	if (badId !== null) throw new Error(badId);
	if (typeof id !== 'string') throw new Error('id must be a string, not empty');
	if (!isObject(name) || typeof name.fr !== 'string' || typeof name.en !== 'string') {
		throw new Error('name must be { fr, en }');
	}
	if (typeof items !== 'string' || !(ITEM_SET_NAMES as readonly string[]).includes(items)) {
		throw new Error(`items must name a registered set, got ${JSON.stringify(items)}`);
	}
	if (typeof memory !== 'boolean') throw new Error('memory must be true or false');
	let recall: { withinMs: number } | undefined;
	if (directRecall !== undefined) {
		if (!isObject(directRecall)) throw new Error('directRecall must be { withinMs }');
		const extra = Object.keys(directRecall).find((key) => key !== 'withinMs');
		if (extra !== undefined) throw new Error(`directRecall: unknown key "${extra}"`);
		const { withinMs } = directRecall;
		if (typeof withinMs !== 'number' || !(withinMs > 0)) {
			throw new Error('directRecall.withinMs must be a positive number');
		}
		recall = { withinMs };
	} else if (memory) {
		throw new Error('directRecall is required for a memory skill');
	}
	return {
		id,
		name: { fr: name.fr, en: name.en },
		items,
		memory,
		...(recall !== undefined && { directRecall: recall })
	};
}
