import {
	Fraction,
	METER_4_4,
	clickAccompaniment,
	type Accompaniment,
	type Figure,
	type Meter
} from '$lib/domain/time';
import { parseLilyPond, parseLilyPondNotes } from '$lib/domain/time/notation/lilypond';
import type { ExerciseDefinition, ExerciseForm } from './types';

/** Every key an `ExerciseDefinition` has (the type's own list, held by the compiler). */
const KEYS: Record<keyof ExerciseDefinition, true> = {
	id: true,
	version: true,
	mechanic: true,
	practices: true,
	params: true,
	tempo: true,
	chordDiagram: true,
	meter: true,
	flow: true,
	round: true,
	presentation: true,
	view: true,
	howTo: true,
	title: true,
	levels: true,
	figures: true,
	forms: true,
	pick: true,
	items: true
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A meter written `{ count, unit: "1/4", grouping }`; throws naming `where`. */
function meterFromJson(value: unknown, where: string): Meter {
	if (!isObject(value)) throw new Error(`${where} must be an object { count, unit, grouping }`);
	const { count, unit, grouping } = value;
	if (typeof count !== 'number') throw new Error(`${where}.count must be a number`);
	if (typeof unit !== 'string') throw new Error(`${where}.unit must be a fraction written "1/4"`);
	if (!Array.isArray(grouping) || !grouping.every((g) => typeof g === 'number')) {
		throw new Error(`${where}.grouping must be a list of numbers`);
	}
	let fraction: Fraction;
	try {
		fraction = Fraction.parse(unit);
	} catch (error) {
		throw new Error(`${where}.unit: ${(error as Error).message}`, { cause: error });
	}
	return { count, unit: fraction, grouping: grouping as number[] };
}

/** An accompaniment written `{ clicks: { beats, accent? }, bars }`; throws naming `where`. */
function accompanimentFromJson(value: unknown, meter: Meter, where: string): Accompaniment {
	const shape = `${where} must be { clicks: { beats, accent? }, bars }`;
	if (!isObject(value) || !isObject(value.clicks)) throw new Error(shape);
	const { clicks, bars, ...rest } = value;
	const { beats, accent = [], ...clickRest } = clicks;
	const unknown = Object.keys(rest)[0] ?? Object.keys(clickRest)[0];
	if (unknown !== undefined) throw new Error(`${where}: unknown key "${unknown}"`);
	const numbers = (list: unknown): list is number[] =>
		Array.isArray(list) && list.every((n) => typeof n === 'number');
	if (
		!numbers(beats) ||
		!numbers(accent) ||
		!Array.isArray(bars) ||
		!bars.every((bar) => bar === 'on' || bar === 'off')
	) {
		throw new Error(shape);
	}
	try {
		return clickAccompaniment({ meter, beats, accent, bars });
	} catch (error) {
		throw new Error(`${where}: ${(error as Error).message}`, { cause: error });
	}
}

function figuresFromJson(value: unknown): { id: string; figure: Figure }[] {
	if (!Array.isArray(value)) throw new Error('figures must be a list of { id, lilypond }');
	return value.map((entry: unknown, index) => {
		const where = `figures[${index}]`;
		if (!isObject(entry)) throw new Error(`${where} must be { id, lilypond }`);
		const { id, lilypond, meter, ...rest } = entry;
		const unknown = Object.keys(rest)[0];
		if (unknown !== undefined) throw new Error(`${where}: unknown key "${unknown}"`);
		if (typeof id !== 'string') throw new Error(`${where}.id must be a string`);
		if (typeof lilypond !== 'string') throw new Error(`${where}.lilypond must be a string`);
		try {
			const options = meter === undefined ? {} : { meter: meterFromJson(meter, 'meter') };
			return { id, figure: parseLilyPond(lilypond, options) };
		} catch (error) {
			throw new Error(`${where} (${id}): ${(error as Error).message}`, { cause: error });
		}
	});
}

function formsFromJson(value: unknown): ExerciseForm[] {
	if (!Array.isArray(value)) throw new Error('forms must be a list of { id, symbol, lilypond }');
	return value.map((entry: unknown, index) => {
		const where = `forms[${index}]`;
		if (!isObject(entry)) throw new Error(`${where} must be { id, symbol, lilypond }`);
		const { id, symbol, lilypond, ...rest } = entry;
		const unknown = Object.keys(rest)[0];
		if (unknown !== undefined) throw new Error(`${where}: unknown key "${unknown}"`);
		if (typeof id !== 'string') throw new Error(`${where}.id must be a string`);
		if (typeof symbol !== 'string') throw new Error(`${where}.symbol must be a string`);
		if (typeof lilypond !== 'string') throw new Error(`${where}.lilypond must be a string`);
		try {
			return { id, symbol, notes: parseLilyPondNotes(lilypond) };
		} catch (error) {
			throw new Error(`${where} (${id}): ${(error as Error).message}`, { cause: error });
		}
	});
}

/**
 * An exercise written as JSON: its figures as `{ id, lilypond, meter? }` (parsed by
 * `parseLilyPond`), its forms as `{ id, symbol, lilypond }` (parsed by `parseLilyPondNotes`), its
 * top-level `meter` as `{ count, unit: "1/4", grouping }`, everything else
 * as the `ExerciseDefinition` it is. Throws an `Error` naming the field when the value is no
 * exercise or has a key the definition does not know; whether the engine can run it is for
 * `validateExercise`.
 */
export function exerciseFromJson(json: unknown): ExerciseDefinition {
	if (!isObject(json)) throw new Error('an exercise must be a JSON object');
	for (const key of Object.keys(json)) {
		if (!Object.hasOwn(KEYS, key)) throw new Error(`unknown key "${key}"`);
	}
	if (typeof json.id !== 'string' || json.id === '')
		throw new Error('id must be a string, not empty');
	if (typeof json.version !== 'number') throw new Error('version must be a number');
	if (typeof json.mechanic !== 'string') throw new Error('mechanic must be a string');
	if (json.practices !== undefined && typeof json.practices !== 'string') {
		throw new Error('practices must be a string');
	}
	if (!isObject(json.params)) throw new Error('params must be an object');
	const { figures, forms, meter, ...rest } = json;
	const exerciseMeter = meter === undefined ? undefined : meterFromJson(meter, 'meter');
	return {
		...(accompanimentsFromJson(rest, exerciseMeter ?? METER_4_4) as unknown as ExerciseDefinition),
		...(figures !== undefined && { figures: figuresFromJson(figures) }),
		...(forms !== undefined && { forms: formsFromJson(forms) }),
		...(exerciseMeter !== undefined && { meter: exerciseMeter })
	};
}

/**
 * Turns every click accompaniment the file writes into the engine's: the one in `round`, or, when
 * `round.accompaniment` names a param, that param in `params` and in each level's `params`. The
 * param must be a top-level one: a dotted name is refused, the nested value being out of reach.
 */
function accompanimentsFromJson(
	json: Record<string, unknown>,
	meter: Meter
): Record<string, unknown> {
	const round = json.round;
	if (!isObject(round) || round.accompaniment === undefined) return json;
	const written = round.accompaniment;
	if (!isObject(written) || typeof written.param !== 'string') {
		return {
			...json,
			round: {
				...round,
				accompaniment: accompanimentFromJson(written, meter, 'round.accompaniment')
			}
		};
	}
	const name = written.param;
	if (name.includes('.')) {
		throw new Error(`round.accompaniment.param must name a top-level param, got "${name}"`);
	}
	const convert = (params: unknown, where: string): unknown =>
		isObject(params) && Object.hasOwn(params, name)
			? { ...params, [name]: accompanimentFromJson(params[name], meter, `${where}.${name}`) }
			: params;
	const levels = Array.isArray(json.levels)
		? json.levels.map((level: unknown, index) =>
				isObject(level) && level.params !== undefined
					? { ...level, params: convert(level.params, `levels[${index}].params`) }
					: level
			)
		: json.levels;
	return {
		...json,
		params: convert(json.params, 'params'),
		...(levels !== undefined && { levels })
	};
}
