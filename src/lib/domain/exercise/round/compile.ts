import { CONTENT_DERIVATIONS, ITEM_FIGURES, ITEM_NUMBERS, ITEM_VALUES } from '../../derivations';
import {
	familyNamed,
	indexDerivation,
	selectionProblem,
	type Filter,
	type Selection
} from '../../families';
import { MEMBER_CONTENT, PITCH_CONTENT, type MemberContent } from '../../judges';
import { exerciseItemSet, exerciseSetId } from '../../sets';
import { landingBar, mutedBarsFrom, type Accompaniment } from '../../time/accompaniment';
import type { Figure, FigureNote } from '../../time/figure';
import { Fraction } from '../../time/fraction';
import { BEAT_RESOLUTION, barLength, beatsOf, sameMeter, type Meter } from '../../time/meter';
import {
	figureExpectations,
	validateRoundPlan,
	type Expectation,
	type ExpectationWindow,
	type ExpectedContent,
	type PairingPolicy,
	type RoundPlan
} from '../../time/plan';
import type { PlannedItem } from '../../types';
import { resolvedParamsOf } from '../levels';
import type { ExerciseDefinition } from '../types';
import {
	FIGURE_CONTENT,
	isFigureEntry,
	isSelectionContent,
	type FigureExpectationTemplate,
	type FigureRef,
	type FilterTemplate,
	type Num,
	type PointExpectationTemplate,
	type Position,
	type RoundTemplate,
	type SelectionTemplate,
	type WindowTemplate
} from './types';

/**
 * What a caller compiling many rounds of one exercise keeps between them: the params resolved at
 * a level and the accompaniment of an exercise level depend on the level only, so they are
 * resolved once. Held by the caller for as long as the exercise does not change.
 */
export type ResolutionCache = Map<string, unknown>;

function memo<T>(cache: ResolutionCache | undefined, key: string, make: () => T): T {
	if (cache === undefined) return make();
	if (!cache.has(key)) cache.set(key, make());
	return cache.get(key) as T;
}

/**
 * The params a template reads: the item's resolved params (`resolvedParamsOf`: the exercise's, its
 * exercise level's, its item level's), the item's lead and the preview.
 */
export function roundParamsOf(
	definition: ExerciseDefinition,
	item: PlannedItem,
	resolved: { previewBeats: number; cache?: ResolutionCache }
): Readonly<Record<string, unknown>> {
	const at = { exerciseLevel: item.exerciseLevel, itemLevel: item.level ?? null };
	return {
		...memo(resolved.cache, `p:${at.exerciseLevel}:${at.itemLevel}`, () =>
			resolvedParamsOf(definition, at)
		),
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

function itemKeyOf(context: Context): string {
	try {
		return exerciseItemSet(context.definition).itemKey(context.item.item);
	} catch {
		return JSON.stringify(context.item.item);
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
	const set = exerciseSetId(context.definition);
	if (!reads.includes(set)) {
		fail(context, field, `${what} "${name}" which reads ${reads.join(', ')}, not ${set}`);
	}
}

/** The value a dotted path of `params` gives, undefined when it gives none. */
export function paramValue(params: Readonly<Record<string, unknown>>, path: string): unknown {
	let found: unknown = params;
	for (const key of path.split('.')) found = isRecord(found) ? found[key] : undefined;
	return found;
}

function num(context: Context, field: string, value: Num): number {
	if (typeof value === 'number') return value;
	if ('param' in value) {
		const found = paramValue(context.params, value.param);
		if (typeof found !== 'number' || !Number.isFinite(found)) {
			fail(
				context,
				field,
				`reads param "${value.param}", absent for ${exerciseSetId(context.definition)} item ${itemKeyOf(context)}`
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

function windowOf(context: Context, field: string, window: WindowTemplate): ExpectationWindow {
	if ('ms' in window) return { ms: num(context, `${field}.ms`, window.ms) };
	if ('ofGap' in window) return { ofGap: fractionOf(context, `${field}.ofGap`, window.ofGap) };
	const found = paramValue(context.params, window.param);
	if (isRecord(found) && typeof found.ms === 'number' && Number.isFinite(found.ms)) {
		return { ms: found.ms };
	}
	if (isRecord(found) && found.ofGap instanceof Fraction) return { ofGap: found.ofGap };
	if (isRecord(found) && typeof found.ofGap === 'string') {
		return { ofGap: fractionOf(context, `${field}.param`, found.ofGap) };
	}
	return fail(
		context,
		field,
		`reads param "${window.param}", which gives no window ({ ms } or { ofGap }) for ${exerciseSetId(context.definition)} item ${itemKeyOf(context)}`
	);
}

/** What a derivation gives for the item; a failure names the exercise, the field and the item. */
function derive(context: Context, field: string, from: string): { kind: string; value: unknown } {
	const derivation = Object.hasOwn(CONTENT_DERIVATIONS, from)
		? CONTENT_DERIVATIONS[from]
		: undefined;
	if (!derivation) return fail(context, field, `derives unknown content "${from}"`);
	readsFrom(context, field, from, derivation.reads, 'derives');
	try {
		return {
			kind: derivation.kind,
			value: derivation.derive(context.item.item, context.definition)
		};
	} catch (error) {
		return fail(
			context,
			field,
			`derives "${from}" for ${exerciseSetId(context.definition)} item ${itemKeyOf(context)}: ${(error as Error).message}`
		);
	}
}

function contentOf(context: Context, field: string, from: string): ExpectedContent {
	if (Object.hasOwn(CONTENT_DERIVATIONS, from) && CONTENT_DERIVATIONS[from].list) {
		fail(context, field, `derives "${from}", a list, which only a figure spreads over its notes`);
	}
	return derive(context, field, from);
}

/** What a filter value is when the item carries none: the filter is left out. */
const ABSENT: unique symbol = Symbol('absent');

/** A filter's value: written, the param's, or the item's (`ITEM_VALUES`; `ABSENT` when it carries none). */
function filterValue(context: Context, field: string, value: unknown): unknown {
	if (!isNum(value)) return value;
	if ('param' in value) {
		const found = paramValue(context.params, value.param);
		if (found === undefined) {
			fail(
				context,
				field,
				`reads param "${value.param}", absent for ${exerciseSetId(context.definition)} item ${itemKeyOf(context)}`
			);
		}
		return found;
	}
	const reader = Object.hasOwn(ITEM_VALUES, value.item) ? ITEM_VALUES[value.item] : undefined;
	if (!reader) fail(context, field, `reads unknown item value "${value.item}"`);
	readsFrom(context, field, value.item, reader.reads, 'reads');
	return reader.valueOf(context.item.item) ?? ABSENT;
}

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/** A filter with its values resolved; null when a value the item does not carry leaves it out. */
function filterOf(context: Context, field: string, filter: FilterTemplate): Filter | null {
	if ('at' in filter) {
		const at = filterValue(context, `${field}.at`, filter.at);
		if (at === ABSENT) return null;
		if (!isFiniteNumber(at))
			fail(context, `${field}.at`, `must be a fret, got ${JSON.stringify(at)}`);
		return { at };
	}
	if (!('in' in filter)) return filter;
	let strings: readonly number[] | undefined;
	let frets: readonly [number, number] | undefined;
	if (filter.in.strings !== undefined) {
		const found = filterValue(context, `${field}.in.strings`, filter.in.strings);
		if (found === ABSENT) return null;
		const list = isFiniteNumber(found) ? [found] : found;
		if (!Array.isArray(list) || !list.every(isFiniteNumber)) {
			fail(context, `${field}.in.strings`, `must be strings, got ${JSON.stringify(found)}`);
		}
		strings = list;
	}
	if (filter.in.frets !== undefined) {
		const found = filterValue(context, `${field}.in.frets`, filter.in.frets);
		if (found === ABSENT) return null;
		const pair = Array.isArray(found)
			? found.map((v, i) => filterValue(context, `${field}.in.frets[${i}]`, v))
			: found;
		if (Array.isArray(pair) && pair.includes(ABSENT)) return null;
		if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(isFiniteNumber)) {
			fail(context, `${field}.in.frets`, `must be two frets, got ${JSON.stringify(found)}`);
		}
		frets = [pair[0], pair[1]];
	}
	return { in: { ...(strings && { strings }), ...(frets && { frets }) } };
}

/**
 * A selection compiled for the item: its index derived, its filters' values resolved (a filter
 * whose value the item does not carry left out), its take counted. No member is enumerated: the
 * judge admits them.
 */
function selectionOf(
	context: Context,
	field: string,
	template: SelectionTemplate
): ExpectedContent {
	const family = familyNamed(template.family);
	if (!family) fail(context, field, `names family "${template.family}", which is not registered`);
	const set = exerciseSetId(context.definition);
	const derivation = indexDerivation(template.family, set, template.of);
	if (!derivation) {
		return template.of === undefined
			? fail(context, field, `set ${set} gives no index of ${template.family}`)
			: fail(
					context,
					`${field}.of`,
					`"${template.of}" gives no index of ${template.family} from ${set}`
				);
	}
	let index: unknown;
	try {
		index = derivation.index(context.item.item);
	} catch (error) {
		fail(
			context,
			field,
			`gives no index of ${template.family} for ${set} item ${itemKeyOf(context)}: ${(error as Error).message}`
		);
	}
	const where = template.where?.flatMap((filter, i) => {
		const resolved = filterOf(context, `${field}.where[${i}]`, filter);
		return resolved === null ? [] : [resolved];
	});
	let take: number | undefined;
	if (template.take !== undefined) {
		take = num(context, `${field}.take`, template.take);
		if (!Number.isInteger(take) || take < 1) {
			fail(context, `${field}.take`, `must be a positive whole number, got ${take}`);
		}
	}
	const selection: Selection = {
		family: template.family,
		...(where && { where }),
		...(template.order && { order: [...template.order] }),
		...(take !== undefined && { take })
	};
	const problem = selectionProblem(family, selection);
	if (problem !== null) fail(context, field, problem);
	const value: MemberContent = { family: template.family, index, selection };
	return { kind: MEMBER_CONTENT, value };
}

function expectationOf(
	context: Context,
	template: PointExpectationTemplate,
	i: number
): Expectation {
	const field = `expectations[${i}]`;
	return {
		at: template.at && position(context, `${field}.at`, template.at),
		span: template.until ? { until: position(context, `${field}.until`, template.until) } : 'point',
		role: template.role ?? 'target',
		sensor: template.sensor,
		content:
			template.content &&
			(isSelectionContent(template.content)
				? selectionOf(context, `${field}.content`, template.content)
				: contentOf(context, `${field}.content`, template.content.from)),
		window: windowOf(context, `${field}.window`, template.window),
		bar: template.bar ?? 0
	};
}

/** The figure a reference names, among the exercise's, in the meter played. */
function figureOf(context: Context, field: string, ref: FigureRef): { id: string; figure: Figure } {
	let id: string;
	if ('id' in ref) {
		id = ref.id;
	} else if ('param' in ref) {
		const found = paramValue(context.params, ref.param);
		if (typeof found !== 'string') {
			fail(
				context,
				field,
				`reads param "${ref.param}", which names no figure for ${exerciseSetId(context.definition)} item ${itemKeyOf(context)}`
			);
		}
		id = found;
	} else {
		const reader = Object.hasOwn(ITEM_FIGURES, ref.item) ? ITEM_FIGURES[ref.item] : undefined;
		if (!reader) fail(context, field, `reads unknown item figure "${ref.item}"`);
		readsFrom(context, field, ref.item, reader.reads, 'reads');
		id = reader.figureOf(context.item.item);
	}
	const figures = context.definition.figures ?? [];
	const found = figures.find((written) => written.id === id);
	if (!found) {
		fail(
			context,
			field,
			`names figure "${id}", which the exercise does not write (${figures.map((f) => f.id).join(', ') || 'none'})`
		);
	}
	if (!sameMeter(found.figure.meter, context.meter)) {
		fail(context, field, `names figure "${id}", which is not in the meter played`);
	}
	return found;
}

/** What the `k`-th note a figure entry plays must play. */
type NoteContent = (k: number, note: FigureNote) => ExpectedContent | null;

function figureContentOf(
	context: Context,
	field: string,
	content: FigureExpectationTemplate['content'],
	figureId: string
): NoteContent {
	if (content === null) return () => null;
	if (isSelectionContent(content)) {
		fail(context, field, 'a figure entry takes its content from a derivation');
	}
	if (content.from === FIGURE_CONTENT) {
		if (content.pattern !== undefined) {
			fail(
				context,
				`${field}.pattern`,
				'spreads a derived list, and the figure writes its own pitches'
			);
		}
		return (k, note) => {
			if (note.pitch === undefined) {
				fail(context, field, `reads the pitches of figure "${figureId}", whose note ${k} has none`);
			}
			return {
				kind: PITCH_CONTENT,
				value:
					note.string === undefined
						? { midi: note.pitch }
						: { midi: note.pitch, string: note.string }
			};
		};
	}
	if (Object.hasOwn(CONTENT_DERIVATIONS, content.from) && !CONTENT_DERIVATIONS[content.from].list) {
		fail(
			context,
			field,
			`derives "${content.from}", not a list: a figure spreads a list over its notes`
		);
	}
	const { kind, value } = derive(context, field, content.from);
	const what = `"${content.from}" for ${exerciseSetId(context.definition)} item ${itemKeyOf(context)}`;
	if (!Array.isArray(value) || value.length === 0) {
		fail(context, field, `derives no element from ${what}`);
	}
	const { pattern } = content;
	for (const index of pattern ?? []) {
		if (!Number.isInteger(index) || index < 1 || index > value.length) {
			fail(
				context,
				`${field}.pattern`,
				`asks note ${index} of ${what}, which gives ${value.length} notes`
			);
		}
	}
	return (k) => ({
		kind,
		value: value[pattern ? pattern[k % pattern.length] - 1 : k % value.length]
	});
}

/**
 * A figure entry unfolded from its place to the end of the round, from bar `startBar` of its
 * loop: it repeats to fill the round, its last loop cut at the round's end.
 */
function figureEntryOf(
	context: Context,
	template: FigureExpectationTemplate,
	i: number,
	length: Fraction,
	startBar: number
): Expectation[] {
	const field = `expectations[${i}]`;
	const { id, figure } = figureOf(context, `${field}.figure`, template.figure);
	const at = position(context, `${field}.at`, template.at);
	const content = figureContentOf(context, `${field}.content`, template.content, id);
	const window = windowOf(context, `${field}.window`, template.window);
	try {
		return figureExpectations({
			figure,
			at,
			length: length.sub(at),
			startBar,
			sensor: template.sensor,
			window,
			content
		});
	} catch (error) {
		// Only the figure's own refusals are told here; a content that fails already names its field.
		if (!(error instanceof RangeError)) throw error;
		return fail(context, `${field}.figure`, error.message);
	}
}

function isAccompaniment(value: unknown): value is Accompaniment {
	return isRecord(value) && isRecord(value.figure) && Array.isArray(value.bars);
}

/**
 * The round's accompaniment at an exercise level (the run's, D7 of H6): the one its template
 * writes or reads in the params; null when it writes none. Throws, naming the exercise and the
 * field, on a param that holds none.
 */
export function roundAccompanimentOf(
	definition: ExerciseDefinition,
	exerciseLevel: number
): Accompaniment | null {
	const written = definition.round?.accompaniment;
	if (written === undefined) return null;
	if (!('param' in written)) return written;
	const found = paramValue(
		resolvedParamsOf(definition, { exerciseLevel, itemLevel: null }),
		written.param
	);
	if (!isAccompaniment(found)) {
		throw new Error(
			`${definition.id}: round.accompaniment reads param "${written.param}", which gives no accompaniment at exercise level ${exerciseLevel}`
		);
	}
	return found;
}

/** The context of `item`'s round, its params resolved at its levels. */
function contextOf(
	definition: ExerciseDefinition,
	item: PlannedItem,
	meter: Meter,
	resolved: { previewBeats: number; cache?: ResolutionCache }
): Context {
	return { definition, item, meter, params: roundParamsOf(definition, item, resolved) };
}

/** The round's first figure entry and its index; null when it writes none. */
function firstFigureEntry(
	template: RoundTemplate | undefined
): { entry: FigureExpectationTemplate; i: number } | null {
	const i = template?.expectations.findIndex(isFigureEntry) ?? -1;
	return i < 0 ? null : { entry: template!.expectations[i] as FigureExpectationTemplate, i };
}

/**
 * The figure the round's first figure entry plays for `item`, among the exercise's, in `meter`;
 * null when the round writes none. Throws as `compileRound` does on a figure it cannot name.
 */
export function roundFigureOf(
	definition: ExerciseDefinition,
	item: PlannedItem,
	meter: Meter
): { id: string; figure: Figure } | null {
	const first = firstFigureEntry(definition.round);
	if (!first) return null;
	const context = contextOf(definition, item, meter, { previewBeats: 0 });
	return figureOf(context, `expectations[${first.i}].figure`, first.entry.figure);
}

/**
 * The items a round that reads its figure on the item (`{ item: <name> }`, `ITEM_FIGURES`) can
 * play at exercise level `exerciseLevel`: one per figure of the exercise, in `meter`, that fills
 * the entry's bars from its place to the round's end a whole number of times, the longest only (a
 * round of two bars plays the two-bar figure, not the bar twice). Null when the round's first
 * figure entry does not read its figure on the item, or it writes none.
 */
export function figureItemsAt(
	definition: ExerciseDefinition,
	exerciseLevel: number,
	meter: Meter
): { id: string; figure: Figure; item: unknown }[] | null {
	const template = definition.round;
	const first = firstFigureEntry(template);
	if (!template || !first || !('item' in first.entry.figure)) return null;
	const name = first.entry.figure.item;
	const reader = Object.hasOwn(ITEM_FIGURES, name) ? ITEM_FIGURES[name] : undefined;
	if (!reader) {
		throw new Error(
			`${definition.id}: round.expectations[${first.i}].figure reads unknown item figure "${name}"`
		);
	}
	const bar = barLength(meter);
	const fitting = (definition.figures ?? []).flatMap(({ id, figure }) => {
		const item = reader.itemOf(id, exerciseLevel);
		const planned: PlannedItem = {
			exerciseId: definition.id,
			skill: definition.practices,
			exerciseLevel,
			item,
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		};
		const context = contextOf(definition, planned, meter, { previewBeats: 0 });
		const from = position(context, `expectations[${first.i}].at`, first.entry.at);
		const bars = lengthOf(context, template.length).sub(from).div(bar);
		const fills =
			sameMeter(figure.meter, meter) && bars.d === 1 && bars.n > 0 && bars.n % figure.bars === 0;
		return fills ? [{ id, figure, item }] : [];
	});
	const longest = Math.max(0, ...fitting.map(({ figure }) => figure.bars));
	return fitting.filter(({ figure }) => figure.bars === longest);
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
	resolved: { previewBeats: number; fromRunStart: number | null; cache?: ResolutionCache }
): RoundPlan {
	const template = definition.round;
	if (!template) throw new Error(`${definition.id}: the exercise has no round template`);
	const context = contextOf(definition, item, meter, resolved);
	let prompt: Fraction | null = null;
	if (template.prompt) {
		const lead = num(context, 'prompt.lead', template.prompt.lead);
		try {
			prompt = lead === 0 ? Fraction.ZERO : beatsOf(meter, -lead);
		} catch (error) {
			return fail(context, 'prompt.lead', (error as Error).message);
		}
	}
	const length = lengthOf(context, template.length);
	const accompaniment = memo(resolved.cache, `a:${item.exerciseLevel}`, () =>
		roundAccompanimentOf(definition, item.exerciseLevel)
	);
	// Where the round starts in the loops of its figures and its accompaniment.
	const startBar = resolved.fromRunStart ?? landingBar(accompaniment);
	const bars = Math.ceil(length.div(barLength(meter)).toNumber());
	const plan: RoundPlan = {
		prompt,
		expectations: template.expectations.flatMap((e, i) =>
			isFigureEntry(e)
				? figureEntryOf(context, e, i, length, startBar)
				: [expectationOf(context, e, i)]
		),
		length,
		mutedBars: template.mutedBars
			? [...template.mutedBars]
			: accompaniment
				? mutedBarsFrom(accompaniment.bars, startBar, bars)
				: [],
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
