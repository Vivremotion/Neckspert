import { CONTENT_DERIVATIONS, ITEM_FIGURES, ITEM_NUMBERS } from '../../derivations';
import { CONTENT_JUDGES, PITCH_CONTENT } from '../../judges';
import { attackNotes, validateFigure, type Figure } from '../../time/figure';
import { Fraction } from '../../time/fraction';
import {
	barLength,
	BEAT_RESOLUTION,
	beatsOf,
	isBeatCount,
	METER_4_4,
	sameMeter
} from '../../time/meter';
import { ROUND_MODES } from '../../time/modes';
import type { Expectation, PairingPolicy, RoundPlan } from '../../time/plan';
import { pacingOf } from '../pacing';
import { ladderFieldOf, ladderOf } from '../ladder';
import type { ExerciseDefinition } from '../types';
import { exerciseLevelsOf, exerciseParamsOf, resolvedParamsOf } from '../levels';
import { levelRange } from '../../time/levels';
import { FIGURE_CONTENT } from './types';

/** What a check may be told about the session that will play the exercise. */
export interface RoundCheckOptions {
	/** The sensors the session has; absent: not checked. */
	sensors?: readonly string[];
}

type Record_ = Record<string, unknown>;

const ROUND_KEYS = [
	'prompt',
	'expectations',
	'length',
	'listenBeforeEnd',
	'handover',
	'mutedBars',
	'policy',
	'barOffset',
	'countEndsOn',
	'accompaniment'
];
const EXPECTATION_KEYS = ['at', 'until', 'role', 'sensor', 'content', 'window', 'bar'];
const FIGURE_ENTRY_KEYS = ['figure', 'at', 'sensor', 'content', 'window'];
const FIGURE_REF_KEYS = ['id', 'param', 'item'];
const POLICY_KEYS = ['unit', 'verdict', 'correction', 'pairing'];
const LENGTH_KEYS = ['bars', 'beats', 'breath'];
const COUNT_ENDS = ['prompt', 'target'];
const ROLES = ['target', 'judged-rest'];
const UNITS = ['response', 'cycle'];

function isRecord(value: unknown): value is Record_ {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNum(value: unknown): value is { param: string } | { item: string } {
	if (!isRecord(value)) return false;
	const keys = Object.keys(value);
	return keys.length === 1 && (keys[0] === 'param' || keys[0] === 'item');
}

const at = (field: string, text: string) => `round.${field} ${text}`;

function unknownKey(value: Record_, allowed: readonly string[], field: string): string | null {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) {
			const where = field === '' ? 'round' : `round.${field}`;
			return `${where}.${key} is not a key of ${field === '' ? 'a round' : 'its place'} (known: ${allowed.join(', ')})`;
		}
	}
	return null;
}

/** What a check reads of the exercise. */
interface Check {
	definition: ExerciseDefinition;
	params: Readonly<Record<string, unknown>>;
	options: RoundCheckOptions;
}

/** The value a path of the params gives, undefined when it gives none. */
function paramValue(params: Readonly<Record<string, unknown>>, path: string): unknown {
	let found: unknown = params;
	for (const key of path.split('.')) found = isRecord(found) ? found[key] : undefined;
	return found;
}

/** Why no level of the ladder can give the lead, naming the levels; null when each gives one. */
function leadProblem(check: Check): string | null {
	const { definition } = check;
	const field = ladderFieldOf(definition, definition.mechanic);
	let ladder;
	try {
		ladder = ladderOf(definition, definition.mechanic);
	} catch {
		return `reads param "leadBeats", but the exercise writes no ladder (${field})`;
	}
	const without = ladder.flatMap((level, index) =>
		typeof level.params.leadBeats === 'number' && level.params.leadBeats > 0 ? [] : [index]
	);
	return without.length === 0
		? null
		: `reads param "leadBeats", which ${field} level ${without.join(', ')} gives no lead`;
}

/**
 * A number of the template: the number it is when the exercise gives it, undefined when only an
 * item gives it (or the ladder, level by level); or the problem.
 */
function numberOf(check: Check, field: string, value: unknown): number | undefined | string {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : at(field, `must be a finite number, got ${value}`);
	}
	if (!isNum(value)) {
		return at(field, 'must be a number, { param: path } or { item: name }');
	}
	if ('item' in value) {
		if (typeof value.item !== 'string' || !Object.hasOwn(ITEM_NUMBERS, value.item)) {
			return at(field, `measures unknown item number "${String(value.item)}"`);
		}
		const { reads } = ITEM_NUMBERS[value.item];
		if (!reads.includes(check.definition.mechanic)) {
			return at(
				field,
				`measures "${value.item}" which reads ${reads.join(', ')}, not ${check.definition.mechanic}`
			);
		}
		return undefined;
	}
	if (typeof value.param !== 'string') return at(field, 'reads a param named by text');
	if (value.param === 'leadBeats') {
		const problem = leadProblem(check);
		return problem === null ? undefined : at(field, problem);
	}
	// The preview is always resolved: the exercise's, else the presenter's.
	if (value.param === 'previewBeats') return check.definition.flow?.previewBeats;
	const found = paramValue(check.params, value.param);
	if (typeof found !== 'number' || !Number.isFinite(found)) {
		return at(
			field,
			`reads param "${value.param}", which the exercise does not give as a number (its params and their defaults)`
		);
	}
	return found;
}

/** A count of beats or bars that must not be negative and, for beats, be an exact fraction of a beat. */
function countProblem(
	field: string,
	value: number | undefined | string,
	unit: 'beats' | 'bars'
): string | null {
	if (typeof value === 'string') return value;
	if (value === undefined) return null;
	if (value < 0) return at(field, `must not be negative, got ${value}`);
	if (unit === 'beats' && !isBeatCount(value)) {
		return at(field, `must be an exact fraction of a beat, got ${value}`);
	}
	return null;
}

interface Placed {
	/** The place in the round, as a fraction of a whole note; undefined when an item decides it. */
	where: Fraction | undefined;
}

function positionOf(check: Check, field: string, position: unknown): Placed | string {
	if (!isRecord(position)) return at(field, 'must be { beats } or { bars }');
	const keys = Object.keys(position);
	if (keys.length !== 1 || (keys[0] !== 'beats' && keys[0] !== 'bars')) {
		const extra = keys.find((key) => key !== 'beats' && key !== 'bars');
		return extra
			? at(`${field}.${extra}`, 'is not a key of a place (known: beats, bars)')
			: at(field, 'must be { beats } or { bars }');
	}
	const unit = keys[0] as 'beats' | 'bars';
	const count = numberOf(check, `${field}.${unit}`, position[unit]);
	const problem = countProblem(`${field}.${unit}`, count, unit);
	if (problem !== null) return problem;
	if (typeof count !== 'number') return { where: undefined };
	const meter = check.definition.meter ?? METER_4_4;
	try {
		return {
			where:
				unit === 'beats'
					? beatsOf(meter, count)
					: barLength(meter).mul(Fraction.fromNumber(count, BEAT_RESOLUTION))
		};
	} catch {
		return at(`${field}.${unit}`, `is no exact place in the meter, got ${count}`);
	}
}

/** Checks the numbers inside a pairing, deeply. */
function pairingProblem(check: Check, field: string, value: unknown): string | null {
	if (isNum(value)) {
		const found = numberOf(check, field, value);
		return typeof found === 'string' ? found : null;
	}
	if (Array.isArray(value)) {
		for (const [i, v] of value.entries()) {
			const problem = pairingProblem(check, `${field}[${i}]`, v);
			if (problem !== null) return problem;
		}
	} else if (isRecord(value)) {
		for (const [key, v] of Object.entries(value)) {
			const problem = pairingProblem(check, `${field}.${key}`, v);
			if (problem !== null) return problem;
		}
	}
	return null;
}

function policyProblem(check: Check, policy: unknown): string | null {
	if (!isRecord(policy)) return at('policy', 'must be an object');
	const unknown = unknownKey(policy, POLICY_KEYS, 'policy');
	if (unknown !== null) return unknown;
	if (!UNITS.includes(policy.unit as string)) {
		return at('policy.unit', `must be one of ${UNITS.join(', ')}, got ${String(policy.unit)}`);
	}
	if (typeof policy.verdict !== 'string' || !Object.hasOwn(ROUND_MODES.verdicts, policy.verdict)) {
		return at(
			'policy.verdict',
			`names unknown verdict mode "${String(policy.verdict)}" (known: ${Object.keys(ROUND_MODES.verdicts).join(', ')})`
		);
	}
	if (typeof policy.correction !== 'boolean') {
		return at('policy.correction', `must be true or false, got ${String(policy.correction)}`);
	}
	const pairing = policy.pairing;
	if (!isRecord(pairing)) return at('policy.pairing', 'must be an object with a mode');
	if (typeof pairing.mode !== 'string' || !Object.hasOwn(ROUND_MODES.pairings, pairing.mode)) {
		return at(
			'policy.pairing.mode',
			`names unknown pairing mode "${String(pairing.mode)}" (known: ${Object.keys(ROUND_MODES.pairings).join(', ')})`
		);
	}
	return pairingProblem(check, 'policy.pairing', pairing);
}

function contentProblem(check: Check, field: string, content: unknown): string | null {
	if (content === null) return null;
	if (!isRecord(content) || typeof content.from !== 'string') {
		return at(field, 'must be null or { from: derivation }');
	}
	const unknown = unknownKey(content, ['from'], field);
	if (unknown !== null) return unknown;
	if (!Object.hasOwn(CONTENT_DERIVATIONS, content.from)) {
		return at(field, `derives unknown content "${content.from}"`);
	}
	if (CONTENT_DERIVATIONS[content.from].list) {
		return at(
			field,
			`derives "${content.from}", a list, which only a figure spreads over its notes`
		);
	}
	return derivationProblem(check, field, content.from);
}

/** Why a known derivation cannot serve the exercise: another mechanic's, or a kind with no judge. */
function derivationProblem(check: Check, field: string, from: string): string | null {
	const derivation = CONTENT_DERIVATIONS[from];
	if (!derivation.reads.includes(check.definition.mechanic)) {
		return at(
			field,
			`derives "${from}" which reads ${derivation.reads.join(', ')}, not ${check.definition.mechanic}`
		);
	}
	if (!Object.hasOwn(CONTENT_JUDGES, derivation.kind)) {
		return at(field, `derives "${from}", whose content kind "${derivation.kind}" has no judge`);
	}
	return null;
}

const WINDOW_KEYS = ['ms', 'ofGap', 'param'];

/** The window a param holds, as the compiler reads it; null when it holds none. */
function paramWindow(value: unknown): { ms: number } | { ofGap: Fraction } | null {
	if (!isRecord(value)) return null;
	if (typeof value.ms === 'number' && Number.isFinite(value.ms) && value.ms >= 0) {
		return { ms: value.ms };
	}
	if (value.ofGap instanceof Fraction) return value.ofGap.n > 0 ? { ofGap: value.ofGap } : null;
	if (typeof value.ofGap === 'string') {
		try {
			const gap = Fraction.parse(value.ofGap);
			return gap.n > 0 ? { ofGap: gap } : null;
		} catch {
			return null;
		}
	}
	return null;
}

function windowProblem(check: Check, field: string, window: unknown): string | null {
	if (!isRecord(window)) return at(field, 'must be { ms }, { ofGap } or { param }');
	const keys = Object.keys(window);
	if (keys.length !== 1 || !WINDOW_KEYS.includes(keys[0])) {
		const extra = keys.find((key) => !WINDOW_KEYS.includes(key));
		return extra
			? at(`${field}.${extra}`, `is not a key of a window (known: ${WINDOW_KEYS.join(', ')})`)
			: at(field, 'must be { ms }, { ofGap } or { param }');
	}
	if (keys[0] === 'param') {
		if (typeof window.param !== 'string')
			return at(`${field}.param`, 'reads a param named by text');
		return paramWindow(paramValue(check.params, window.param)) === null
			? at(
					field,
					`reads param "${window.param}", which the exercise does not give as a window ({ ms } or { ofGap })`
				)
			: null;
	}
	if (keys[0] === 'ofGap') {
		try {
			if (typeof window.ofGap !== 'string') throw new TypeError('not text');
			Fraction.parse(window.ofGap);
		} catch {
			return at(`${field}.ofGap`, `must be a fraction such as "1/2", got ${String(window.ofGap)}`);
		}
		return null;
	}
	const ms = numberOf(check, `${field}.ms`, window.ms);
	if (typeof ms === 'string') return ms;
	if (ms !== undefined && ms < 0) return at(`${field}.ms`, `must not be negative, got ${ms}`);
	return null;
}

/** Why a sensor cannot be heard, when the session's sensors are known. */
function sensorProblem(check: Check, field: string, sensor: unknown): string | null {
	if (typeof sensor !== 'string') return at(field, 'must name a sensor');
	const { sensors } = check.options;
	if (sensors && !sensors.includes(sensor)) {
		return at(
			field,
			`names sensor "${sensor}", which the session does not have (${sensors.join(', ')})`
		);
	}
	return null;
}

/** The exercise levels, from the lowest. */
function exerciseLevelIndexes(definition: ExerciseDefinition): number[] {
	const { lowest, highest } = levelRange(exerciseLevelsOf(definition));
	return Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i);
}

/** The figures a figure entry may name, or why it names none the exercise can play. */
function namedFigures(
	check: Check,
	field: string,
	ref: unknown
): { id: string; figure: Figure }[] | string {
	const { definition } = check;
	const written = definition.figures ?? [];
	const known = written.map((f) => f.id).join(', ') || 'none';
	if (
		!isRecord(ref) ||
		Object.keys(ref).length !== 1 ||
		!FIGURE_REF_KEYS.includes(Object.keys(ref)[0])
	) {
		return at(field, 'must be { id }, { param } or { item }');
	}
	const find = (id: string) => written.find((f) => f.id === id);
	let named: { id: string; figure: Figure }[];
	if ('id' in ref) {
		const found = typeof ref.id === 'string' ? find(ref.id) : undefined;
		if (!found) {
			return at(
				field,
				`names figure "${String(ref.id)}", which the exercise does not write (${known})`
			);
		}
		named = [found];
	} else if ('param' in ref) {
		if (typeof ref.param !== 'string') return at(`${field}.param`, 'reads a param named by text');
		named = [];
		for (const level of exerciseLevelIndexes(definition)) {
			const id = paramValue(
				resolvedParamsOf(definition, { exerciseLevel: level, itemLevel: null }),
				ref.param
			);
			const found = typeof id === 'string' ? find(id) : undefined;
			if (!found) {
				return at(
					field,
					`reads param "${ref.param}", which exercise level ${level} gives as ${JSON.stringify(id) ?? 'nothing'}, not a figure the exercise writes (${known})`
				);
			}
			if (!named.includes(found)) named.push(found);
		}
	} else {
		const name = ref.item;
		if (typeof name !== 'string' || !Object.hasOwn(ITEM_FIGURES, name)) {
			return at(field, `reads unknown item figure "${String(name)}"`);
		}
		const { reads } = ITEM_FIGURES[name];
		if (!reads.includes(definition.mechanic)) {
			return at(
				field,
				`reads "${name}" which reads ${reads.join(', ')}, not ${definition.mechanic}`
			);
		}
		if (written.length === 0)
			return at(field, `reads "${name}" on its items, and the exercise writes no figure`);
		named = [...written];
	}
	const meter = definition.meter ?? METER_4_4;
	for (const { id, figure } of named) {
		const invalid = validateFigure(figure);
		if (invalid !== null) return at(field, `names figure "${id}", which is invalid: ${invalid}`);
		if (!sameMeter(figure.meter, meter)) {
			return at(field, `names figure "${id}", which is not in the exercise's meter`);
		}
	}
	return named;
}

function figureContentProblem(
	check: Check,
	field: string,
	content: unknown,
	figures: readonly { id: string; figure: Figure }[]
): string | null {
	if (content === null) return null;
	if (!isRecord(content) || typeof content.from !== 'string') {
		return at(
			field,
			`must be null, { from: '${FIGURE_CONTENT}' } or { from: derivation, pattern? }`
		);
	}
	if (content.from === FIGURE_CONTENT) {
		const unknown = unknownKey(content, ['from'], field);
		if (unknown !== null) return unknown;
		for (const { id, figure } of figures) {
			const missing = attackNotes(figure).findIndex(({ note }) => note.pitch === undefined);
			if (missing >= 0) {
				return at(field, `reads the pitches of figure "${id}", whose note ${missing} has none`);
			}
		}
		return null;
	}
	const unknown = unknownKey(content, ['from', 'pattern'], field);
	if (unknown !== null) return unknown;
	if (!Object.hasOwn(CONTENT_DERIVATIONS, content.from)) {
		return at(field, `derives unknown content "${content.from}"`);
	}
	if (!CONTENT_DERIVATIONS[content.from].list) {
		return at(
			field,
			`derives "${content.from}", not a list: a figure spreads a list over its notes`
		);
	}
	const derivation = derivationProblem(check, field, content.from);
	if (derivation !== null) return derivation;
	const { pattern } = content;
	if (
		pattern !== undefined &&
		!(
			Array.isArray(pattern) &&
			pattern.length > 0 &&
			pattern.every((index) => Number.isInteger(index) && index >= 1)
		)
	) {
		return at(
			`${field}.pattern`,
			`must be a list of note numbers from 1, got ${JSON.stringify(pattern)}`
		);
	}
	return null;
}

function figureEntryProblem(check: Check, template: Record_, field: string): string | null {
	const unknown = unknownKey(template, FIGURE_ENTRY_KEYS, field);
	if (unknown !== null) return unknown;
	const sensor = sensorProblem(check, `${field}.sensor`, template.sensor);
	if (sensor !== null) return sensor;
	const figures = namedFigures(check, `${field}.figure`, template.figure);
	if (typeof figures === 'string') return figures;
	const content = figureContentProblem(
		check,
		`${field}.content`,
		template.content ?? null,
		figures
	);
	if (content !== null) return content;
	const window = windowProblem(check, `${field}.window`, template.window);
	if (window !== null) return window;
	if (template.at === null || template.at === undefined)
		return at(`${field}.at`, 'must place the figure');
	const start = positionOf(check, `${field}.at`, template.at);
	return typeof start === 'string' ? start : null;
}

function expectationProblem(check: Check, template: unknown, i: number): string | null {
	const field = `expectations[${i}]`;
	if (!isRecord(template)) return at(field, 'must be an object');
	if ('figure' in template) return figureEntryProblem(check, template, field);
	const unknown = unknownKey(template, EXPECTATION_KEYS, field);
	if (unknown !== null) return unknown;
	if (template.role !== undefined && !ROLES.includes(template.role as string)) {
		return at(`${field}.role`, `must be one of ${ROLES.join(', ')}, got ${String(template.role)}`);
	}
	const sensor = sensorProblem(check, `${field}.sensor`, template.sensor);
	if (sensor !== null) return sensor;
	if (
		template.bar !== undefined &&
		!(typeof template.bar === 'number' && Number.isInteger(template.bar) && template.bar >= 0)
	) {
		return at(`${field}.bar`, `must be a non-negative integer, got ${String(template.bar)}`);
	}
	const content = contentProblem(check, `${field}.content`, template.content ?? null);
	if (content !== null) return content;
	const window = windowProblem(check, `${field}.window`, template.window);
	if (window !== null) return window;
	if (template.at === null) {
		return template.until === undefined
			? null
			: at(`${field}.until`, 'cannot end a stretch that starts in free time');
	}
	const start = positionOf(check, `${field}.at`, template.at);
	if (typeof start === 'string') return start;
	if (template.until === undefined) return null;
	const end = positionOf(check, `${field}.until`, template.until);
	if (typeof end === 'string') return end;
	if (start.where && end.where && end.where.compare(start.where) <= 0) {
		return at(`${field}.until`, 'must end after it starts');
	}
	return null;
}

function lengthProblem(check: Check, length: unknown): string | null {
	if (!isRecord(length)) return at('length', 'must be an object');
	const unknown = unknownKey(length, LENGTH_KEYS, 'length');
	if (unknown !== null) return unknown;
	for (const unit of ['bars', 'beats'] as const) {
		if (length[unit] === undefined) continue;
		const problem = countProblem(
			`length.${unit}`,
			numberOf(check, `length.${unit}`, length[unit]),
			unit
		);
		if (problem !== null) return problem;
	}
	if (length.breath !== undefined && typeof length.breath !== 'boolean') {
		return at('length.breath', `must be true or false, got ${String(length.breath)}`);
	}
	return null;
}

/** Where a place falls, undefined when an item or a level decides it; its problems were named before. */
function whereOf(check: Check, field: string, position: unknown): Fraction | undefined {
	const placed = positionOf(check, field, position);
	return typeof placed === 'string' ? undefined : placed.where;
}

/** The round's length, undefined when an item or a level decides a part of it; or the problem. */
function lengthOf(check: Check, length: Record_): Fraction | undefined | string {
	const meter = check.definition.meter ?? METER_4_4;
	const bar = barLength(meter);
	let total = Fraction.ZERO;
	if (length.bars !== undefined) {
		const bars = numberOf(check, 'length.bars', length.bars);
		if (typeof bars !== 'number') return undefined;
		try {
			total = total.add(bar.mul(Fraction.fromNumber(bars, BEAT_RESOLUTION)));
		} catch {
			return at('length.bars', `must be an exact fraction of a bar, got ${bars}`);
		}
	}
	if (length.beats !== undefined) {
		const beats = numberOf(check, 'length.beats', length.beats);
		if (typeof beats !== 'number') return undefined;
		total = total.add(beatsOf(meter, beats));
	}
	if (length.breath === true) {
		total = total.add(bar.mul(Fraction.of(pacingOf(check.definition).respirationBars)));
	}
	return total;
}

/** A number of the template as far as the exercise knows it, 0 where an item or a level decides. */
function knownNumber(check: Check, value: unknown): unknown {
	if (isNum(value)) {
		const found = numberOf(check, '', value);
		return typeof found === 'number' ? found : 0;
	}
	if (Array.isArray(value)) return value.map((v) => knownNumber(check, v));
	if (isRecord(value)) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, knownNumber(check, v)]));
	}
	return value;
}

/** A window as far as the exercise knows it, its numbers 0 where an item or a level decides. */
function knownWindow(check: Check, window: Record_): Expectation['window'] {
	if ('ofGap' in window) return { ofGap: Fraction.parse(window.ofGap as string) };
	if ('param' in window) {
		return paramWindow(paramValue(check.params, window.param as string)) ?? { ms: 0 };
	}
	return { ms: knownNumber(check, window.ms) as number };
}

/** A length an item or a level decides stands as longer than any place, so it refuses none. */
const UNKNOWN_LENGTH = Fraction.of(10_000);

/**
 * The plan of the round as far as the exercise knows it, places an item or a level decides
 * standing at the start: what the round's modes read to say whether they can run it.
 */
function knownPlan(
	check: Check,
	template: Record_,
	length: Fraction | undefined,
	listenUntil: Fraction | undefined
): RoundPlan {
	const policy = template.policy as Record_;
	const expectations = (template.expectations as Record_[]).flatMap((e, i): Expectation[] => {
		const point: Expectation = {
			at: e.at === null ? null : (whereOf(check, '', e.at) ?? Fraction.ZERO),
			span:
				e.until === undefined
					? 'point'
					: { until: whereOf(check, '', e.until) ?? length ?? UNKNOWN_LENGTH },
			role: (e.role as Expectation['role'] | undefined) ?? 'target',
			sensor: e.sensor as string,
			// What its content is does not matter to a mode, only that it asks for some, and its kind.
			content: isRecord(e.content)
				? {
						kind:
							e.content.from === FIGURE_CONTENT
								? PITCH_CONTENT
								: CONTENT_DERIVATIONS[e.content.from as string].kind,
						value: null
					}
				: null,
			window: knownWindow(check, e.window as Record_),
			bar: (e.bar as number | undefined) ?? 0
		};
		if (!('figure' in e)) return [point];
		// A figure stands as one loop of the first figure it names, from its place.
		const named = namedFigures(check, `expectations[${i}].figure`, e.figure);
		const [first] = typeof named === 'string' ? [] : named;
		if (!first) return [point];
		return attackNotes(first.figure).map(({ at: attack }) => ({
			...point,
			at: (point.at ?? Fraction.ZERO).add(attack)
		}));
	});
	return {
		prompt: template.prompt === undefined ? null : Fraction.ZERO,
		expectations,
		length: length ?? UNKNOWN_LENGTH,
		...(listenUntil !== undefined && { listenUntil }),
		...(template.handover === 'end' && { handover: length ?? UNKNOWN_LENGTH }),
		mutedBars: [...((template.mutedBars as number[] | undefined) ?? [])],
		policy: {
			unit: policy.unit as RoundPlan['policy']['unit'],
			verdict: policy.verdict as string,
			correction: policy.correction as boolean,
			pairing: knownNumber(check, policy.pairing) as PairingPolicy
		}
	};
}

/**
 * What the compiled round could not hold, as far as the exercise knows its places: a length of
 * nothing, expectations out of order or outside the round, listening that ends before it starts,
 * a plan its pairing or verdict mode cannot run.
 */
function shapeProblem(check: Check, template: Record_): string | null {
	const length = lengthOf(check, template.length as Record_);
	if (typeof length === 'string') return length;
	if (length !== undefined && length.compare(Fraction.ZERO) <= 0) {
		return at('length', 'must last more than nothing, got 0');
	}
	// How long before its end the round stops listening, when the exercise knows it.
	const before =
		template.listenBeforeEnd === undefined
			? Fraction.ZERO
			: whereOf(check, 'listenBeforeEnd', template.listenBeforeEnd);
	if (length !== undefined && before !== undefined && before.compare(length) >= 0) {
		return at(
			'listenBeforeEnd',
			`must leave the round some listening: it lasts ${length}, got ${before}`
		);
	}
	let previous: { i: number; where: Fraction } | null = null;
	for (const [i, e] of (template.expectations as Record_[]).entries()) {
		if (e.at === null) continue;
		const start = whereOf(check, `expectations[${i}].at`, e.at);
		if (start === undefined) continue;
		if (previous && start.compare(previous.where) < 0) {
			return at(
				`expectations[${i}].at`,
				`comes before expectations[${previous.i}] (${start} before ${previous.where}): expectations are written in the order they come`
			);
		}
		previous = { i, where: start };
		if (length === undefined) continue;
		if (start.compare(length) >= 0) {
			return at(
				`expectations[${i}].at`,
				`must fall within the round, which lasts ${length}, got ${start}`
			);
		}
		const end =
			e.until === undefined ? undefined : whereOf(check, `expectations[${i}].until`, e.until);
		if (end !== undefined && end.compare(length) > 0) {
			return at(
				`expectations[${i}].until`,
				`must end within the round, which lasts ${length}, got ${end}`
			);
		}
	}
	// Where it stops listening, when the exercise knows it; else the modes see no end of listening.
	const listening =
		length !== undefined && before !== undefined && template.listenBeforeEnd !== undefined
			? length.sub(before)
			: undefined;
	const plan = knownPlan(check, template, length, listening);
	const policy = template.policy as Record_;
	const mode = (policy.pairing as Record_).mode as string;
	const pairing = ROUND_MODES.pairings[mode].validate?.(plan) ?? null;
	if (pairing !== null) return at('policy.pairing', `cannot be run by mode "${mode}": ${pairing}`);
	const verdictMode = ROUND_MODES.verdicts[policy.verdict as string];
	const verdict = verdictMode.validate?.(plan) ?? null;
	if (verdict !== null) {
		return at('policy.verdict', `"${String(policy.verdict)}" cannot judge the round: ${verdict}`);
	}
	if (verdictMode.readsThresholds) {
		const level = levelWithoutThresholds(check.definition);
		if (level !== null) {
			return at(
				'policy.verdict',
				`"${String(policy.verdict)}" judges against params.thresholds, which exercise level ${level} does not give`
			);
		}
	}
	return null;
}

/** The first exercise level whose resolved params give no thresholds; null when every one does. */
function levelWithoutThresholds(definition: ExerciseDefinition): number | null {
	const { lowest, highest } = levelRange(exerciseLevelsOf(definition));
	for (let level = lowest; level <= highest; level++) {
		const { thresholds } = resolvedParamsOf(definition, { exerciseLevel: level, itemLevel: null });
		if (typeof thresholds !== 'object' || thresholds === null) return level;
	}
	return null;
}

/** Why an accompaniment cannot be played under the round: no on/off bars, or an invalid figure. */
function playableProblem(value: unknown): string | null {
	if (!isRecord(value) || !isRecord(value.figure) || !Array.isArray(value.bars)) {
		return 'is no accompaniment ({ figure, bars })';
	}
	const { bars } = value;
	if (bars.length === 0 || !bars.every((bar) => bar === 'on' || bar === 'off')) {
		return `must have bars of "on" and "off", got ${JSON.stringify(bars)}`;
	}
	const invalid = validateFigure(value.figure as unknown as Figure);
	return invalid === null ? null : `has an invalid figure: ${invalid}`;
}

function accompanimentProblem(check: Check, accompaniment: unknown): string | null {
	if (accompaniment === undefined) return null;
	if (!(isRecord(accompaniment) && 'param' in accompaniment)) {
		const problem = playableProblem(accompaniment);
		return problem === null ? null : at('accompaniment', problem);
	}
	const unknown = unknownKey(accompaniment, ['param'], 'accompaniment');
	if (unknown !== null) return unknown;
	if (typeof accompaniment.param !== 'string') {
		return at('accompaniment.param', 'reads a param named by text');
	}
	const { definition } = check;
	for (const level of exerciseLevelIndexes(definition)) {
		const value = paramValue(
			resolvedParamsOf(definition, { exerciseLevel: level, itemLevel: null }),
			accompaniment.param
		);
		const problem = playableProblem(value);
		if (problem !== null) {
			return at(
				'accompaniment',
				`reads param "${accompaniment.param}", which at exercise level ${level} ${problem}`
			);
		}
	}
	return null;
}

function templateProblem(check: Check): string | null {
	const template: unknown = check.definition.round;
	if (!isRecord(template)) return at('', 'must be an object');
	const unknown = unknownKey(template, ROUND_KEYS, '');
	if (unknown !== null) return unknown;

	const expectations = template.expectations;
	if (!Array.isArray(expectations)) return at('expectations', 'must be a list');
	for (const [i, expectation] of expectations.entries()) {
		const problem = expectationProblem(check, expectation, i);
		if (problem !== null) return problem;
	}
	const prompt = template.prompt;
	if (prompt !== undefined) {
		if (!isRecord(prompt)) return at('prompt', 'must be { lead }');
		const promptUnknown = unknownKey(prompt, ['lead'], 'prompt');
		if (promptUnknown !== null) return promptUnknown;
		const lead = numberOf(check, 'prompt.lead', prompt.lead);
		const leadProblemText = countProblem('prompt.lead', lead, 'beats');
		if (leadProblemText !== null) return leadProblemText;
	}
	const accompaniment = accompanimentProblem(check, template.accompaniment);
	if (accompaniment !== null) return accompaniment;

	const free = expectations.filter((e) => (e as Record_).at === null).length;
	if (free > 0 && free < expectations.length) {
		return at('expectations', 'mixes expectations in free time with placed ones');
	}

	const length = lengthProblem(check, template.length);
	if (length !== null) return length;

	if (template.listenBeforeEnd !== undefined) {
		const place = positionOf(check, 'listenBeforeEnd', template.listenBeforeEnd);
		if (typeof place === 'string') return place;
	}
	if (template.handover !== undefined && template.handover !== 'end') {
		return at('handover', `must be "end", got ${String(template.handover)}`);
	}
	if (template.mutedBars !== undefined) {
		const bars = template.mutedBars;
		if (!(Array.isArray(bars) && bars.every((b) => Number.isInteger(b) && b >= 0))) {
			return at('mutedBars', 'must be a list of non-negative integers');
		}
	}
	const policy = policyProblem(check, template.policy);
	if (policy !== null) return policy;

	if (template.barOffset !== undefined) {
		let offset: Fraction;
		try {
			if (typeof template.barOffset !== 'string') throw new TypeError('not text');
			offset = Fraction.parse(template.barOffset);
		} catch {
			return at('barOffset', `must be a fraction such as "1/4", got ${String(template.barOffset)}`);
		}
		const bar = barLength(check.definition.meter ?? METER_4_4);
		if (offset.compare(Fraction.ZERO) < 0 || offset.compare(bar) >= 0) {
			return at(
				'barOffset',
				`must lie within its bar (0 to ${bar}, excluded), got ${String(template.barOffset)}`
			);
		}
	}
	if (template.countEndsOn !== undefined && !COUNT_ENDS.includes(template.countEndsOn as string)) {
		return at(
			'countEndsOn',
			`must be one of ${COUNT_ENDS.join(', ')}, got "${String(template.countEndsOn)}"`
		);
	}
	return shapeProblem(check, template);
}

/**
 * Null when the exercise writes no round or writes one the engine can run, else the first thing
 * it cannot, naming the field (`round.expectations[1].until …`): a key it does not know, a
 * derivation or number of an item that does not read the exercise's mechanic, content without a
 * judge, a mode it does not have, a sensor the session lacks (when told the `sensors`), a param
 * no level resolves, a negative place, a stretch that does not end after it starts, expectations
 * in free time mixed with placed ones, a bar offset outside its bar; and, as far as the exercise
 * knows its places, a round of no length, expectations out of order or outside the round, no
 * listening left, a plan its pairing or verdict mode cannot run. The caller names the exercise.
 */
export function roundProblem(
	definition: ExerciseDefinition,
	options: RoundCheckOptions = {}
): string | null {
	if (definition.round === undefined) return null;
	let params: Readonly<Record<string, unknown>>;
	try {
		params = exerciseParamsOf(definition);
	} catch (error) {
		return (error as Error).message;
	}
	return templateProblem({ definition, params, options });
}
