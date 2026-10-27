import { CONTENT_DERIVATIONS, ITEM_NUMBERS } from '../../derivations';
import { mechanicRules } from '../../mechanics';
import { Fraction } from '../../time/fraction';
import { BEAT_RESOLUTION, barLength, beatsOf, type Meter } from '../../time/meter';
import {
	validateRoundPlan,
	type Expectation,
	type ExpectedContent,
	type PairingPolicy,
	type RoundPlan
} from '../../time/plan';
import type { PlannedItem } from '../../types';
import { resolvedParamsOf } from '../levels';
import type { ExerciseDefinition } from '../types';
import type { ExpectationTemplate, Num, Position, RoundTemplate, WindowTemplate } from './types';

/**
 * The params a template reads: the item's resolved params (`resolvedParamsOf`: the exercise's, its
 * exercise level's, its item level's), the item's lead and the preview.
 */
export function roundParamsOf(
	definition: ExerciseDefinition,
	item: PlannedItem,
	resolved: { previewBeats: number }
): Readonly<Record<string, unknown>> {
	return {
		...resolvedParamsOf(definition, {
			exerciseLevel: item.exerciseLevel,
			itemLevel: item.level ?? null,
			mechanic: item.mechanic
		}),
		leadBeats: item.leadBeats,
		previewBeats: resolved.previewBeats
	};
}

/** What a compilation reads, and how it names a failure. */
interface Context {
	definition: ExerciseDefinition;
	item: PlannedItem;
	meter: Meter;
	params: Readonly<Record<string, unknown>>;
}

function itemKeyOf(item: PlannedItem): string {
	try {
		return mechanicRules(item.mechanic).itemKey(item.item);
	} catch {
		return JSON.stringify(item.item);
	}
}

function fail(context: Context, field: string, problem: string): never {
	throw new Error(`${context.definition.id}: round.${field} ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNum(value: unknown): value is { param: string } | { item: string } {
	if (!isRecord(value)) return false;
	const keys = Object.keys(value);
	return keys.length === 1 && (keys[0] === 'param' || keys[0] === 'item');
}

function readsFrom(
	context: Context,
	field: string,
	name: string,
	reads: readonly string[],
	what: string
): void {
	if (!reads.includes(context.item.mechanic)) {
		fail(
			context,
			field,
			`${what} "${name}" which reads ${reads.join(', ')}, not ${context.item.mechanic}`
		);
	}
}

function num(context: Context, field: string, value: Num): number {
	if (typeof value === 'number') return value;
	if ('param' in value) {
		let found: unknown = context.params;
		for (const key of value.param.split('.')) {
			found = isRecord(found) ? found[key] : undefined;
		}
		if (typeof found !== 'number' || !Number.isFinite(found)) {
			fail(
				context,
				field,
				`reads param "${value.param}", absent for ${context.item.mechanic} item ${itemKeyOf(context.item)}`
			);
		}
		return found;
	}
	const measure = Object.hasOwn(ITEM_NUMBERS, value.item) ? ITEM_NUMBERS[value.item] : undefined;
	if (!measure) fail(context, field, `measures unknown item number "${value.item}"`);
	readsFrom(context, field, value.item, measure.reads, 'measures');
	return measure.measure(context.item.item);
}

/** A count of whole units (beats or bars) as an exact fraction of that unit. */
function exact(context: Context, field: string, value: number): Fraction {
	try {
		return Fraction.fromNumber(value, BEAT_RESOLUTION);
	} catch (error) {
		return fail(context, field, (error as Error).message);
	}
}

function position(context: Context, field: string, at: Position): Fraction {
	if ('beats' in at) {
		const count = num(context, `${field}.beats`, at.beats);
		try {
			return beatsOf(context.meter, count);
		} catch (error) {
			return fail(context, `${field}.beats`, (error as Error).message);
		}
	}
	return barLength(context.meter).mul(
		exact(context, `${field}.bars`, num(context, `${field}.bars`, at.bars))
	);
}

/** Every `Num` inside a pairing, deeply; text, null and booleans stay. */
function resolveDeep(context: Context, field: string, value: unknown): unknown {
	if (isNum(value)) return num(context, field, value);
	if (Array.isArray(value)) return value.map((v, i) => resolveDeep(context, `${field}[${i}]`, v));
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, v]) => [key, resolveDeep(context, `${field}.${key}`, v)])
		);
	}
	return value;
}

/** A fraction of a whole note written as text, read or failing with the exercise and the field. */
function fractionOf(context: Context, field: string, text: string): Fraction {
	try {
		return Fraction.parse(text);
	} catch (error) {
		return fail(context, field, (error as Error).message);
	}
}

function windowOf(context: Context, field: string, window: WindowTemplate): Expectation['window'] {
	if ('ms' in window) return { ms: num(context, `${field}.ms`, window.ms) };
	return { ofGap: fractionOf(context, `${field}.ofGap`, window.ofGap) };
}

function contentOf(context: Context, field: string, from: string): ExpectedContent {
	const derivation = Object.hasOwn(CONTENT_DERIVATIONS, from)
		? CONTENT_DERIVATIONS[from]
		: undefined;
	if (!derivation) return fail(context, field, `derives unknown content "${from}"`);
	readsFrom(context, field, from, derivation.reads, 'derives');
	return { kind: derivation.kind, value: derivation.derive(context.item.item) };
}

function expectationOf(context: Context, template: ExpectationTemplate, i: number): Expectation {
	const field = `expectations[${i}]`;
	return {
		at: template.at && position(context, `${field}.at`, template.at),
		span: template.until ? { until: position(context, `${field}.until`, template.until) } : 'point',
		role: template.role ?? 'target',
		sensor: template.sensor,
		content: template.content && contentOf(context, `${field}.content`, template.content.from),
		window: windowOf(context, `${field}.window`, template.window),
		bar: template.bar ?? 0
	};
}

function lengthOf(context: Context, template: RoundTemplate['length']): Fraction {
	const bar = barLength(context.meter);
	let length = Fraction.ZERO;
	if (template.bars !== undefined) {
		length = length.add(
			bar.mul(exact(context, 'length.bars', num(context, 'length.bars', template.bars)))
		);
	}
	if (template.beats !== undefined) {
		const beats = num(context, 'length.beats', template.beats);
		try {
			length = length.add(beatsOf(context.meter, beats));
		} catch (error) {
			fail(context, 'length.beats', (error as Error).message);
		}
	}
	if (template.breath) {
		const bars = num(context, 'length.breath', { param: 'pacing.respirationBars' });
		length = length.add(bar.mul(exact(context, 'length.breath', bars)));
	}
	return length;
}

/**
 * The plan of `item`'s round, from its exercise's template; throws an error naming the exercise
 * and the field.
 */
export function compileRound(
	definition: ExerciseDefinition,
	item: PlannedItem,
	meter: Meter,
	resolved: { previewBeats: number }
): RoundPlan {
	const template = definition.round;
	if (!template) throw new Error(`${definition.id}: the exercise has no round template`);
	const context: Context = {
		definition,
		item,
		meter,
		params: roundParamsOf(definition, item, resolved)
	};
	const lead = num(context, 'prompt.lead', template.prompt.lead);
	let prompt: Fraction;
	try {
		prompt = lead === 0 ? Fraction.ZERO : beatsOf(meter, -lead);
	} catch (error) {
		return fail(context, 'prompt.lead', (error as Error).message);
	}
	const length = lengthOf(context, template.length);
	const plan: RoundPlan = {
		prompt,
		expectations: template.expectations.map((e, i) => expectationOf(context, e, i)),
		length,
		mutedBars: [...(template.mutedBars ?? [])],
		policy: {
			unit: template.policy.unit,
			verdict: template.policy.verdict,
			correction: template.policy.correction,
			pairing: resolveDeep(context, 'policy.pairing', template.policy.pairing) as PairingPolicy
		}
	};
	if (template.listenBeforeEnd) {
		plan.listenUntil = length.sub(position(context, 'listenBeforeEnd', template.listenBeforeEnd));
	}
	if (template.handover === 'end') plan.handover = length;
	if (template.barOffset !== undefined)
		plan.barOffset = fractionOf(context, 'barOffset', template.barOffset);
	if (template.countEndsOn) plan.countEndsOn = template.countEndsOn;
	const problem = validateRoundPlan(plan);
	if (problem) throw new Error(`${definition.id}: round plan is invalid: ${problem}`);
	return plan;
}
