import { checkedId } from '$lib/domain/definitions/ids';
import {
	MAX_OPENING_DEPTH,
	MAX_OPENING_TERMS,
	MAX_ROUTINE_EXERCISES,
	type Opening,
	type RoutineDefinition
} from './types';

const KEYS = ['id', 'title', 'exercises', 'howTo', 'opens'];
const OPENING_FORMS = 'one of { acquired }, { level }, { all }, { any }';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A text in both languages, each written and not empty. */
function textOf(value: unknown, key: string): { fr: string; en: string } {
	if (
		!isObject(value) ||
		Object.keys(value).some((k) => k !== 'fr' && k !== 'en') ||
		typeof value.fr !== 'string' ||
		typeof value.en !== 'string' ||
		value.fr === '' ||
		value.en === ''
	) {
		throw new Error(`${key} must be { fr, en }, each a text not empty`);
	}
	return { fr: value.fr, en: value.en };
}

function exercisesOf(value: unknown): string[] {
	if (!Array.isArray(value)) throw new Error('exercises must be a list of exercise ids');
	if (value.length === 0) throw new Error('exercises is empty');
	if (value.length > MAX_ROUTINE_EXERCISES) {
		throw new Error(`exercises has ${value.length} entries, more than ${MAX_ROUTINE_EXERCISES}`);
	}
	const seen = new Set<string>();
	return value.map((id: unknown, index) => {
		if (typeof id !== 'string') throw new Error(`exercises[${index}] must be a string`);
		if (seen.has(id)) throw new Error(`exercises[${index}] lists "${id}" a second time`);
		seen.add(id);
		return id;
	});
}

const positiveInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** The fields of a leaf of the opening, refusing a key it does not know. */
function leafFields(
	value: unknown,
	where: string,
	keys: readonly string[]
): Record<string, unknown> {
	if (!isObject(value)) throw new Error(`${where} must be { ${keys.join(', ')} }`);
	const unknown = Object.keys(value).find((key) => !keys.includes(key));
	if (unknown !== undefined) throw new Error(`${where}: unknown key "${unknown}"`);
	if (!positiveInteger(value.atLeast)) {
		throw new Error(`${where}.atLeast must be a positive integer`);
	}
	return value;
}

/**
 * Reads an opening, counting every node read so far in `terms` and refusing past the limits
 * before reading further: a list is measured before its entries are read.
 */
function openingOf(
	value: unknown,
	where: string,
	depth: number,
	terms: { count: number }
): Opening {
	if (depth > MAX_OPENING_DEPTH) {
		throw new Error(`opens is deeper than ${MAX_OPENING_DEPTH} levels`);
	}
	terms.count += 1;
	if (terms.count > MAX_OPENING_TERMS) {
		throw new Error(`opens has more than ${MAX_OPENING_TERMS} terms`);
	}
	const keys = isObject(value) ? Object.keys(value) : [];
	if (!isObject(value) || keys.length !== 1) throw new Error(`${where} must be ${OPENING_FORMS}`);
	const [form] = keys;
	const inner = value[form];
	const at = `${where}.${form}`;
	switch (form) {
		case 'acquired': {
			const { skill, atLeast } = leafFields(inner, at, ['skill', 'atLeast']);
			if (typeof skill !== 'string') throw new Error(`${at}.skill must be a string`);
			return { acquired: { skill, atLeast: atLeast as number } };
		}
		case 'level': {
			const { exercise, scope, atLeast } = leafFields(inner, at, ['exercise', 'scope', 'atLeast']);
			if (typeof exercise !== 'string') throw new Error(`${at}.exercise must be a string`);
			if (scope !== undefined && typeof scope !== 'string') {
				throw new Error(`${at}.scope must be a string`);
			}
			return {
				level: { exercise, ...(scope !== undefined && { scope }), atLeast: atLeast as number }
			};
		}
		case 'all':
		case 'any': {
			if (!Array.isArray(inner)) throw new Error(`${at} must be a list`);
			if (inner.length === 0) throw new Error(`${at} is empty`);
			if (terms.count + inner.length > MAX_OPENING_TERMS) {
				throw new Error(`opens has more than ${MAX_OPENING_TERMS} terms`);
			}
			const read = inner.map((entry: unknown, index) =>
				openingOf(entry, `${at}[${index}]`, depth + 1, terms)
			);
			return form === 'all' ? { all: read } : { any: read };
		}
		default:
			throw new Error(`${where} must be ${OPENING_FORMS}`);
	}
}

/**
 * A routine written in a JSON file, its shape only (what it names is checked by
 * `routineProblem`). Throws an `Error` naming the field when the value is no routine or has a key
 * a routine does not know.
 */
export function routineFromJson(json: unknown): RoutineDefinition {
	if (!isObject(json)) throw new Error('a routine must be a JSON object');
	const unknown = Object.keys(json).find((key) => !KEYS.includes(key));
	if (unknown !== undefined) throw new Error(`unknown key "${unknown}"`);
	const id = checkedId(json.id);
	const title = textOf(json.title, 'title');
	const exercises = exercisesOf(json.exercises);
	const howTo = json.howTo === undefined ? undefined : textOf(json.howTo, 'howTo');
	const opens =
		json.opens === undefined ? undefined : openingOf(json.opens, 'opens', 1, { count: 0 });
	return {
		id,
		title,
		exercises,
		...(howTo !== undefined && { howTo }),
		...(opens !== undefined && { opens })
	};
}
