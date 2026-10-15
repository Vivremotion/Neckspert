import { Fraction } from './fraction';
import { barLength, validateMeter, type Meter } from './meter';

/** The sounds a note can ask for: the click, the figure heard as a demo, the learner's own part. */
export const SOUND_IDS = ['click-accent', 'click', 'demo', 'play-along'] as const;
export type SoundId = (typeof SOUND_IDS)[number];

/**
 * One event of a voice. Durations are the sounding ones, as fractions of a whole note:
 * a triplet of eighths is three `1/12`. `content` is what a note carries:
 * the sound it plays in an accompaniment, null in a bare rhythm (a chord, a string... later).
 */
export type FigureElement =
	| { kind: 'note'; duration: Fraction; tieToNext?: boolean; content: null | SoundId }
	| { kind: 'rest'; duration: Fraction };

/** `from` and `to` are element indexes (both included); `ratio` is [played, in the time of]. */
export interface Tuplet {
	from: number;
	to: number;
	ratio: [number, number];
}

export interface Voice {
	id: string;
	elements: FigureElement[];
	tuplets?: Tuplet[];
}

/** A rhythm figure: `bars` bars of `meter`, one or more voices that each fill them. */
export interface Figure {
	schema: 1;
	meter: Meter;
	bars: number;
	voices: Voice[];
}

function validateTuplets(voice: Voice): string | null {
	let lastTo = -1;
	const sorted = [...(voice.tuplets ?? [])].sort((a, b) => a.from - b.from);
	for (const t of sorted) {
		const [played, inTimeOf] = t.ratio;
		if (!Number.isInteger(played) || !Number.isInteger(inTimeOf) || played < 1 || inTimeOf < 1) {
			return `voice "${voice.id}": tuplet ratio must be two positive integers`;
		}
		if (!Number.isInteger(t.from) || !Number.isInteger(t.to) || t.from < 0 || t.to < t.from) {
			return `voice "${voice.id}": tuplet ${t.from}-${t.to} is not a range of elements`;
		}
		if (t.to >= voice.elements.length) {
			return `voice "${voice.id}": tuplet ${t.from}-${t.to} runs past the last element`;
		}
		if (t.from <= lastTo)
			return `voice "${voice.id}": tuplet ${t.from}-${t.to} overlaps another tuplet`;
		lastTo = t.to;
	}
	return null;
}

function validateVoice(voice: Voice, meter: Meter, bars: number): string | null {
	const bar = barLength(meter);
	const total = Fraction.of(bars).mul(bar);
	let at = Fraction.ZERO;
	for (const [i, element] of voice.elements.entries()) {
		if (element.duration.n <= 0) {
			return `voice "${voice.id}": element ${i} has a non-positive duration (${element.duration})`;
		}
		if (element.kind === 'note' && element.tieToNext) {
			const next = voice.elements[i + 1];
			if (next?.kind !== 'note') {
				return `voice "${voice.id}": element ${i} has a tie to ${next ? 'a rest' : 'nothing'}`;
			}
		}
		const end = at.add(element.duration);
		const barIndex = Math.floor(at.div(bar).toNumber());
		if (end.compare(Fraction.of(barIndex + 1).mul(bar)) > 0) {
			return `voice "${voice.id}": element ${i} crosses the end of bar ${barIndex + 1}`;
		}
		at = end;
	}
	const cmp = at.compare(total);
	if (cmp < 0) {
		return `voice "${voice.id}": bar ${Math.floor(at.div(bar).toNumber()) + 1} is not filled (${at} of ${total})`;
	}
	if (cmp > 0) {
		return `voice "${voice.id}": runs past the figure's ${bars} bars (${at} of ${total})`;
	}
	return validateTuplets(voice);
}

/** Null when the figure is valid, else a readable reason naming the voice and bar. */
export function validateFigure(figure: Figure): string | null {
	const meterProblem = validateMeter(figure.meter);
	if (meterProblem) return meterProblem;
	if (!Number.isInteger(figure.bars) || figure.bars < 1) {
		return `figure bars must be a positive integer, got ${figure.bars}`;
	}
	if (figure.voices.length === 0) return 'figure needs at least one voice';
	const seen = new Set<string>();
	for (const voice of figure.voices) {
		if (seen.has(voice.id)) return `figure has two voices named "${voice.id}"`;
		seen.add(voice.id);
	}
	for (const voice of figure.voices) {
		const problem = validateVoice(voice, figure.meter, figure.bars);
		if (problem) return problem;
	}
	return null;
}

/** Where each note of a voice (the first by default) starts, skipping notes tied from the previous one. */
export function attackPositions(figure: Figure, voiceId?: string): Fraction[] {
	const voice =
		voiceId === undefined ? figure.voices[0] : figure.voices.find((v) => v.id === voiceId);
	if (!voice) throw new RangeError(`figure has no voice "${voiceId}"`);
	const attacks: Fraction[] = [];
	let at = Fraction.ZERO;
	let tied = false;
	for (const element of voice.elements) {
		if (element.kind === 'note') {
			if (!tied) attacks.push(at);
			tied = element.tieToNext === true;
		} else {
			tied = false;
		}
		at = at.add(element.duration);
	}
	return attacks;
}

export function figureToJson(figure: Figure): unknown {
	return {
		schema: figure.schema,
		meter: {
			count: figure.meter.count,
			unit: figure.meter.unit.toString(),
			grouping: [...figure.meter.grouping]
		},
		bars: figure.bars,
		voices: figure.voices.map((voice) => ({
			id: voice.id,
			elements: voice.elements.map((element) =>
				element.kind === 'rest'
					? { kind: 'rest', duration: element.duration.toString() }
					: {
							kind: 'note',
							duration: element.duration.toString(),
							...(element.tieToNext ? { tieToNext: true } : {}),
							content: element.content
						}
			),
			...(voice.tuplets
				? { tuplets: voice.tuplets.map((t) => ({ from: t.from, to: t.to, ratio: [...t.ratio] })) }
				: {})
		}))
	};
}

type Json = Record<string, unknown>;

function asObject(value: unknown, what: string): Json {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${what} must be an object`);
	}
	return value as Json;
}

function asArray(value: unknown, what: string): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${what} must be an array`);
	return value;
}

function asInteger(value: unknown, what: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new Error(`${what} must be an integer`);
	}
	return value;
}

function asFraction(value: unknown, what: string): Fraction {
	if (typeof value !== 'string') throw new Error(`${what} must be a fraction such as "1/8"`);
	try {
		return Fraction.parse(value);
	} catch {
		throw new Error(`${what} must be a fraction such as "1/8", got "${value}"`);
	}
}

function elementFromJson(value: unknown, where: string): FigureElement {
	const e = asObject(value, where);
	const duration = asFraction(e.duration, `${where} duration`);
	if (e.kind === 'rest') return { kind: 'rest', duration };
	if (e.kind !== 'note') throw new Error(`${where} kind must be "note" or "rest"`);
	if (e.content !== null && !SOUND_IDS.some((id) => id === e.content)) {
		throw new Error(`${where} content must be null or one of ${SOUND_IDS.join(', ')}`);
	}
	if (e.tieToNext !== undefined && typeof e.tieToNext !== 'boolean') {
		throw new Error(`${where} tieToNext must be a boolean`);
	}
	return {
		kind: 'note',
		duration,
		...(e.tieToNext ? { tieToNext: true } : {}),
		content: e.content as null | SoundId
	};
}

function voiceFromJson(value: unknown, where: string): Voice {
	const v = asObject(value, where);
	if (typeof v.id !== 'string') throw new Error(`${where} id must be a string`);
	const elements = asArray(v.elements, `${where} elements`).map((e, i) =>
		elementFromJson(e, `${where} element ${i}`)
	);
	const voice: Voice = { id: v.id, elements };
	if (v.tuplets !== undefined) {
		voice.tuplets = asArray(v.tuplets, `${where} tuplets`).map((raw, i) => {
			const t = asObject(raw, `${where} tuplet ${i}`);
			const ratio = asArray(t.ratio, `${where} tuplet ${i} ratio`);
			if (ratio.length !== 2) throw new Error(`${where} tuplet ${i} ratio must have two numbers`);
			return {
				from: asInteger(t.from, `${where} tuplet ${i} from`),
				to: asInteger(t.to, `${where} tuplet ${i} to`),
				ratio: [
					asInteger(ratio[0], `${where} tuplet ${i} ratio`),
					asInteger(ratio[1], `${where} tuplet ${i} ratio`)
				]
			};
		});
	}
	return voice;
}

/** Reads a figure from its JSON form. Throws an `Error` with a readable message on anything invalid. */
export function figureFromJson(value: unknown): Figure {
	const f = asObject(value, 'figure');
	if (f.schema !== 1) throw new Error(`unsupported figure schema: ${JSON.stringify(f.schema)}`);
	const m = asObject(f.meter, 'figure meter');
	const meter: Meter = {
		count: asInteger(m.count, 'figure meter count'),
		unit: asFraction(m.unit, 'figure meter unit'),
		grouping: asArray(m.grouping, 'figure meter grouping').map((g) =>
			asInteger(g, 'figure meter grouping')
		)
	};
	const figure: Figure = {
		schema: 1,
		meter,
		bars: asInteger(f.bars, 'figure bars'),
		voices: asArray(f.voices, 'figure voices').map((v, i) => voiceFromJson(v, `voice ${i}`))
	};
	const problem = validateFigure(figure);
	if (problem) throw new Error(`invalid figure: ${problem}`);
	return figure;
}
