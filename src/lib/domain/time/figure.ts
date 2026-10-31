import { Fraction } from './fraction';
import { barLength, validateMeter, type Meter } from './meter';

/** The sounds a note can ask for: the click, the figure heard as a demo, the learner's own part. */
export const SOUND_IDS = ['click-accent', 'click', 'demo', 'play-along'] as const;
export type SoundId = (typeof SOUND_IDS)[number];

/** Lowest and highest MIDI numbers a note's `pitch` may take. */
export const MIN_PITCH = 0;
export const MAX_PITCH = 127;
/** The strings a note's `string` may name: 1 is the highest, 6 the lowest. */
export const MIN_STRING = 1;
export const MAX_STRING = 6;

/**
 * One event of a voice. Durations are the sounding ones, as fractions of a whole note:
 * a triplet of eighths is three `1/12`. `content` is what a note carries:
 * the sound it plays in an accompaniment, null in a bare rhythm. `pitch` is its exact
 * MIDI number and `string` the string it is played on (1 to 6), both written by the notation
 * when it has them: plain numbers, so that this domain knows nothing of the fretboard.
 */
export type FigureElement =
	| {
			kind: 'note';
			duration: Fraction;
			tieToNext?: boolean;
			content: null | SoundId;
			pitch?: number;
			string?: number;
	  }
	| { kind: 'rest'; duration: Fraction };

export type FigureNote = Extract<FigureElement, { kind: 'note' }>;

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
	/** 2: notes may carry a pitch and a string. Schema 1 JSON is read and becomes schema 2. */
	schema: 2;
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

function validateNote(note: FigureNote, voiceId: string, index: number): string | null {
	const { pitch, string } = note;
	if (
		pitch !== undefined &&
		!(Number.isInteger(pitch) && pitch >= MIN_PITCH && pitch <= MAX_PITCH)
	) {
		return `voice "${voiceId}": element ${index} has pitch ${pitch}, not a MIDI number (${MIN_PITCH} to ${MAX_PITCH})`;
	}
	if (
		string !== undefined &&
		!(Number.isInteger(string) && string >= MIN_STRING && string <= MAX_STRING)
	) {
		return `voice "${voiceId}": element ${index} has string ${string}, not ${MIN_STRING} to ${MAX_STRING}`;
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
		if (element.kind === 'note') {
			const problem = validateNote(element, voice.id, i);
			if (problem) return problem;
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

/** Each attack of a voice (the first by default; tied notes once): its position and its note. */
export function attackNotes(
	figure: Figure,
	voiceId?: string
): { at: Fraction; note: FigureNote }[] {
	const voice =
		voiceId === undefined ? figure.voices[0] : figure.voices.find((v) => v.id === voiceId);
	if (!voice) throw new RangeError(`figure has no voice "${voiceId}"`);
	const attacks: { at: Fraction; note: FigureNote }[] = [];
	let at = Fraction.ZERO;
	let tied = false;
	for (const element of voice.elements) {
		if (element.kind === 'note') {
			if (!tied) attacks.push({ at, note: element });
			tied = element.tieToNext === true;
		} else {
			tied = false;
		}
		at = at.add(element.duration);
	}
	return attacks;
}

/** Where each note of a voice (the first by default) starts, skipping notes tied from the previous one. */
export function attackPositions(figure: Figure, voiceId?: string): Fraction[] {
	return attackNotes(figure, voiceId).map(({ at }) => at);
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
							content: element.content,
							...(element.pitch !== undefined ? { pitch: element.pitch } : {}),
							...(element.string !== undefined ? { string: element.string } : {})
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
	if (e.pitch !== undefined) asInteger(e.pitch, `${where} pitch`);
	if (e.string !== undefined) asInteger(e.string, `${where} string`);
	return {
		kind: 'note',
		duration,
		...(e.tieToNext ? { tieToNext: true } : {}),
		content: e.content as null | SoundId,
		...(e.pitch !== undefined ? { pitch: e.pitch as number } : {}),
		...(e.string !== undefined ? { string: e.string as number } : {})
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
	if (f.schema !== 1 && f.schema !== 2)
		throw new Error(`unsupported figure schema: ${JSON.stringify(f.schema)}`);
	const m = asObject(f.meter, 'figure meter');
	const meter: Meter = {
		count: asInteger(m.count, 'figure meter count'),
		unit: asFraction(m.unit, 'figure meter unit'),
		grouping: asArray(m.grouping, 'figure meter grouping').map((g) =>
			asInteger(g, 'figure meter grouping')
		)
	};
	const figure: Figure = {
		schema: 2,
		meter,
		bars: asInteger(f.bars, 'figure bars'),
		voices: asArray(f.voices, 'figure voices').map((v, i) => voiceFromJson(v, `voice ${i}`))
	};
	const problem = validateFigure(figure);
	if (problem) throw new Error(`invalid figure: ${problem}`);
	return figure;
}

/**
 * The figure as a span of `length` (from its start, in whole notes) plays it, looped from bar
 * `startBar` of its loop: its bars in turn, its last loop cut at `length`, the notes that start
 * at or after it written as rests of their length, so its last bar stays whole. Its attacks are
 * those `figureExpectations` places over the same span, one for one: a tie into a cut note is
 * dropped, and a note held from a bar left out of the span starts as a rest. A tuplet is kept
 * when it lies within one bar. The figure itself when the span is exactly one loop from its
 * first bar.
 */
export function loopFigure(figure: Figure, span: { length: Fraction; startBar: number }): Figure {
	const { length, startBar } = span;
	if (length.compare(Fraction.ZERO) <= 0) {
		throw new RangeError(`the span to fill must be positive, got ${length}`);
	}
	if (!Number.isInteger(startBar) || startBar < 0) {
		throw new RangeError(`startBar must be a non-negative integer, got ${startBar}`);
	}
	const bar = barLength(figure.meter);
	const bars = Math.ceil(length.div(bar).toNumber() - 1e-9);
	const first = startBar % figure.bars;
	if (first === 0 && length.equals(bar.mul(Fraction.of(figure.bars)))) return figure;
	const voice = (source: Voice): Voice => {
		// The elements of each bar of the source, with their index and their place in the bar.
		const inBar: { index: number; from: Fraction }[][] = Array.from(
			{ length: figure.bars },
			() => []
		);
		let at = Fraction.ZERO;
		source.elements.forEach((element, index) => {
			const b = Math.floor(at.div(bar).toNumber());
			inBar[b]?.push({ index, from: at.sub(bar.mul(Fraction.of(b))) });
			at = at.add(element.duration);
		});
		const elements: FigureElement[] = [];
		const tuplets: Tuplet[] = [];
		for (let i = 0; i < bars; i++) {
			const b = (first + i) % figure.bars;
			const origin = bar.mul(Fraction.of(i));
			const base = elements.length;
			for (const { index, from } of inBar[b]) {
				const element = source.elements[index];
				const before = elements.at(-1);
				// Held from a note the span does not hold (a bar left out, or a cut note).
				const heldIn =
					element.kind === 'note' &&
					index > 0 &&
					source.elements[index - 1].kind === 'note' &&
					(source.elements[index - 1] as FigureNote).tieToNext === true &&
					!(before?.kind === 'note' && before.tieToNext === true);
				const cut = origin.add(from).compare(length) >= 0;
				if (cut || heldIn) {
					if (before?.kind === 'note' && before.tieToNext) {
						const { tieToNext: _tie, ...untied } = before;
						elements[elements.length - 1] = untied;
					}
					elements.push({ kind: 'rest', duration: element.duration });
				} else {
					elements.push(element);
				}
			}
			const indexes = inBar[b].map(({ index }) => index);
			for (const tuplet of source.tuplets ?? []) {
				const start = indexes.indexOf(tuplet.from);
				const end = indexes.indexOf(tuplet.to);
				if (start >= 0 && end >= 0) {
					tuplets.push({ ...tuplet, from: base + start, to: base + end });
				}
			}
		}
		// The span ends on a tied note: what it was tied to is left out.
		const last = elements.at(-1);
		if (last?.kind === 'note' && last.tieToNext) {
			const { tieToNext: _tie, ...untied } = last;
			elements[elements.length - 1] = untied;
		}
		const { tuplets: _tuplets, ...rest } = source;
		return { ...rest, elements, ...(tuplets.length > 0 ? { tuplets } : {}) };
	};
	return { ...figure, bars, voices: figure.voices.map(voice) };
}
