// The one place that knows VexFlow: it engraves a rhythm figure as one-line staves. The Bravura
// font comes bundled with the package (`vexflow/bravura`), so nothing is fetched at run time.
import {
	Beam,
	Dot,
	Formatter,
	Fraction as VexFraction,
	Renderer,
	Stave,
	StaveNote,
	StaveTie,
	Stem,
	Tuplet,
	Voice
} from 'vexflow/bravura';
import {
	barLength,
	Fraction,
	validateFigure,
	type Figure,
	type FigureElement,
	type Meter,
	type Voice as FigureVoice
} from '$lib/domain/time';

/** Where the engraving put things, in CSS pixels from the host's top left corner. */
export interface FigureLayout {
	/**
	 * The centre of each attack of the first voice, in time order (tied notes count once, rests
	 * never); on a wrapped figure the x restarts at each line.
	 */
	noteX: number[];
	/** The left edge of each bar (restarting at each line). */
	barX: number[];
	width: number;
	height: number;
	/** The line each attack of `noteX` is on (0 is the first line), parallel to `noteX`. */
	noteLine: number[];
	/** The top y of each line, in output pixels; a line holds one row per voice. */
	lineY: number[];
	/** The height of one voice's row within a line, in output pixels. */
	rowHeight: number;
	/** The width of a bar (all bars are equally wide), in output pixels. */
	barWidth: number;
}

export interface RenderOptions {
	/** The widest the drawing may be, in CSS pixels. */
	maxWidth: number;
	/** Zoom of the drawing, 1 by default. */
	scale?: number;
}

/** Spacing in the engraving's own units (VexFlow's staff line spacing is 10). */
const LINE_SPACING = 10;
const LINES_ABOVE = 6;
const LINES_BELOW = 2;
const ROW_HEIGHT = (LINES_ABOVE + LINES_BELOW + 1) * LINE_SPACING;
/** Room for the shortest note of a bar, so that a bar of eighths is not packed head to head. */
const SLOT_PX = 18;
/** Room kept clear on the left and right so strokes at the edge are not cut. */
const EDGE = 1;
/** Room between the last note of a bar and its closing bar line. */
const BAR_END_PADDING = 16;
/** The pitch every note sits on: the one that falls on the staff's single line (as a treble clef writes it). */
const KEY = 'f/5';
const INK = 'currentColor';

// Note values a single VexFlow note can carry: a power of two, dotted up to twice.
const NOTE_VALUES = ['w', 'h', 'q', '8', '16', '32', '64'] as const;
const MAX_DOTS = 2;

interface NoteValue {
	name: (typeof NOTE_VALUES)[number];
	dots: number;
	value: Fraction;
}

const SINGLE_NOTE_VALUES: NoteValue[] = NOTE_VALUES.flatMap((name, k) =>
	Array.from({ length: MAX_DOTS + 1 }, (_, dots) => ({
		name,
		dots,
		// 2^-k, dotted `dots` times: 2^-k * (2^(dots+1) - 1) / 2^dots
		value: Fraction.of(2 ** (dots + 1) - 1, 2 ** (k + dots))
	}))
).sort((a, b) => b.value.compare(a.value));

/** The note values that add up to `written`, largest first (one entry when it is a single value). */
function splitIntoNoteValues(written: Fraction): NoteValue[] {
	const pieces: NoteValue[] = [];
	let left = written;
	while (left.n > 0) {
		const fit = SINGLE_NOTE_VALUES.find((candidate) => candidate.value.compare(left) <= 0);
		if (!fit) throw new RangeError(`${written} is too short to engrave`);
		pieces.push(fit);
		left = left.sub(fit.value);
	}
	return pieces;
}

interface Head {
	note: StaveNote;
	/** True for the note that starts the sound (not for the tail of a split or a tied note). */
	attack: boolean;
	/** Whether this head is tied to the next one of the voice. */
	tieNext: boolean;
}

interface EngravedBar {
	heads: Head[];
	tuplets: Tuplet[];
	voice: Voice;
	formatter: Formatter;
	minWidth: number;
	beams: Beam[];
}

/** The beat groups of the meter, as VexFlow fractions of a whole note. */
function beamGroups(meter: Meter): VexFraction[] {
	return meter.grouping.map((units) => new VexFraction(units * meter.unit.n, meter.unit.d));
}

/** An element of a bar, with its place in the voice and whether a tie leads into it. */
interface BarElement {
	element: FigureElement;
	index: number;
	tiedIn: boolean;
}

function engraveBar(
	elements: BarElement[],
	tuplets: FigureVoice['tuplets'],
	meter: Meter
): EngravedBar {
	const bar = barLength(meter);
	const heads: Head[] = [];
	const notesOfElement = new Map<number, StaveNote[]>();

	for (const { element, index, tiedIn } of elements) {
		const tuplet = (tuplets ?? []).find((t) => t.from <= index && index <= t.to);
		const written = tuplet
			? element.duration.mul(Fraction.of(tuplet.ratio[0], tuplet.ratio[1]))
			: element.duration;
		const pieces = splitIntoNoteValues(written);
		const notes: StaveNote[] = [];
		for (const [i, piece] of pieces.entries()) {
			const note = new StaveNote({
				keys: [KEY],
				duration: `${piece.name}${element.kind === 'rest' ? 'r' : ''}`,
				dots: piece.dots,
				stemDirection: Stem.UP,
				autoStem: false
			});
			if (piece.dots > 0) Dot.buildAndAttach([note], { all: true });
			notes.push(note);
			const last = i === pieces.length - 1;
			heads.push({
				note,
				attack: element.kind === 'note' && i === 0 && !tiedIn,
				tieNext: element.kind === 'note' && (!last || element.tieToNext === true)
			});
		}
		notesOfElement.set(index, notes);
	}

	// A tuplet is drawn per bar: one that runs over a bar line is cut at it.
	const barTuplets: Tuplet[] = [];
	for (const t of tuplets ?? []) {
		const notes = elements
			.filter(({ index }) => t.from <= index && index <= t.to)
			.flatMap(({ index }) => notesOfElement.get(index) ?? []);
		if (notes.length > 0) {
			barTuplets.push(new Tuplet(notes, { numNotes: t.ratio[0], notesOccupied: t.ratio[1] }));
		}
	}

	const voice = new Voice({ numBeats: bar.n, beatValue: bar.d }).setMode(Voice.Mode.SOFT);
	const notes = heads.map((head) => head.note);
	voice.addTickables(notes);
	const beams = Beam.generateBeams(notes, {
		groups: beamGroups(meter),
		stemDirection: Stem.UP,
		beamRests: false,
		maintainStemDirections: true
	});
	const formatter = new Formatter().joinVoices([voice]);
	// VexFlow's tightest packing is unreadable: give each slot of the shortest note room to breathe.
	const shortest = elements.reduce(
		(min, { element }) => (element.duration.compare(min) < 0 ? element.duration : min),
		bar
	);
	const minWidth = Math.max(
		formatter.preCalculateMinTotalWidth([voice]),
		Math.ceil(bar.div(shortest).toNumber()) * SLOT_PX
	);
	return { heads, tuplets: barTuplets, voice, formatter, minWidth, beams };
}

/** Splits a voice's elements by the bar they fall in. */
function elementsByBar(voice: FigureVoice, meter: Meter, bars: number): BarElement[][] {
	const bar = barLength(meter);
	const byBar = Array.from({ length: bars }, () => [] as BarElement[]);
	let at = Fraction.ZERO;
	for (const [index, element] of voice.elements.entries()) {
		const before = voice.elements[index - 1];
		const tiedIn = before?.kind === 'note' && before.tieToNext === true;
		byBar[Math.floor(at.div(bar).toNumber())].push({ element, index, tiedIn });
		at = at.add(element.duration);
	}
	return byBar;
}

/** The signature as VexFlow writes it, or null when the meter's unit is not `1/n`. */
function timeSignature(meter: Meter): string | null {
	return meter.unit.n === 1 ? `${meter.count}/${meter.unit.d}` : null;
}

function newStave(x: number, y: number, width: number, signature: string | null): Stave {
	const stave = new Stave(x, y, width, {
		numLines: 1,
		spaceAboveStaffLn: LINES_ABOVE,
		spaceBelowStaffLn: LINES_BELOW
	});
	if (signature) stave.addTimeSignature(signature);
	return stave.setStyle({ fillStyle: INK, strokeStyle: INK });
}

/** The music font the package registers when it loads; glyph widths are measured on it. */
const MUSIC_FONT = 'Bravura';

/**
 * Resolves once the embedded music font can be measured. Engrave after it: a figure engraved
 * before measures its glyphs on a fallback font, and its spacing and `noteX` are off. Never
 * rejects: where fonts cannot be awaited (or fail), engraving goes on as it can.
 */
export async function notationReady(): Promise<void> {
	if (typeof document === 'undefined' || typeof document.fonts?.load !== 'function') return;
	try {
		await document.fonts.load(`30px ${MUSIC_FONT}`);
	} catch {
		// Engraved anyway, on whatever font there is.
	}
}

/**
 * Draws a figure (one rhythmic line per voice, bars wrapped to `maxWidth`) into `host`, replacing
 * what it held; returns where each note and bar landed. Every bar gets the same width, as many
 * to a line as fit. A bar wider than `maxWidth` on its own is drawn anyway, past it.
 */
export function renderFigure(
	host: HTMLElement,
	figure: Figure,
	options: RenderOptions
): FigureLayout {
	const problem = validateFigure(figure);
	if (problem) throw new RangeError(`cannot engrave an invalid figure: ${problem}`);
	const scale = options.scale ?? 1;
	if (!(scale > 0) || !(options.maxWidth > 0)) {
		throw new RangeError('maxWidth and scale must be positive');
	}
	const { meter, bars } = figure;
	const signature = timeSignature(meter);

	const engraved = figure.voices.map((voice) =>
		elementsByBar(voice, meter, bars).map((elements) => engraveBar(elements, voice.tuplets, meter))
	);

	// The widest a bar needs to be, the time signature of the first one included.
	const probe = newStave(0, 0, 100, signature);
	const overhead = probe.getNoteStartX() - probe.getX();
	const needed =
		Math.max(...engraved.flat().map((bar) => bar.minWidth)) + overhead + BAR_END_PADDING;
	const available = options.maxWidth / scale - 2 * EDGE;
	const perLine = Math.max(1, Math.min(bars, Math.floor(available / needed)));
	const barWidth = Math.floor(available / perLine);
	const lines = Math.ceil(bars / perLine);

	host.replaceChildren();
	const width = Math.ceil((perLine * barWidth + 2 * EDGE) * scale);
	const height = Math.ceil(lines * figure.voices.length * ROW_HEIGHT * scale);
	const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
	renderer.resize(width, height);
	const ctx = renderer.getContext();
	ctx.scale(scale, scale);
	ctx.setFillStyle(INK);
	ctx.setStrokeStyle(INK);

	const noteX: number[] = [];
	const noteLine: number[] = [];
	const barX: number[] = [];
	// The rows of lines hold one stave per voice, voice after voice.
	const lineOf = (bar: number) => Math.floor(bar / perLine);
	for (const [v, voiceBars] of engraved.entries()) {
		const heads: { head: Head; line: number }[] = [];
		for (const [b, bar] of voiceBars.entries()) {
			const line = lineOf(b);
			const x = EDGE + (b % perLine) * barWidth;
			const y = (line * figure.voices.length + v) * ROW_HEIGHT;
			const stave = newStave(x, y, barWidth, b === 0 ? signature : null);
			stave.setContext(ctx).draw();
			const room = stave.getNoteEndX() - stave.getNoteStartX() - BAR_END_PADDING;
			bar.formatter.format([bar.voice], room);
			for (const head of bar.heads) head.note.setStyle({ fillStyle: INK, strokeStyle: INK });
			bar.voice.draw(ctx, stave);
			for (const beam of bar.beams)
				beam.setStyle({ fillStyle: INK, strokeStyle: INK }).setContext(ctx).draw();
			for (const tuplet of bar.tuplets) tuplet.setContext(ctx).draw();
			for (const head of bar.heads) heads.push({ head, line });
			if (v === 0) {
				barX.push(x * scale);
				for (const head of bar.heads) {
					if (head.attack) {
						noteX.push((head.note.getAbsoluteX() + head.note.getGlyphWidth() / 2) * scale);
						noteLine.push(line);
					}
				}
			}
		}
		drawTies(ctx, heads);
	}

	const rowHeight = ROW_HEIGHT * scale;
	const lineY = Array.from({ length: lines }, (_, line) => line * figure.voices.length * rowHeight);
	return { noteX, barX, width, height, noteLine, lineY, rowHeight, barWidth: barWidth * scale };
}

/** Ties each head flagged for it to the next one; across a line break, two half ties. */
function drawTies(ctx: ReturnType<Renderer['getContext']>, heads: { head: Head; line: number }[]) {
	for (const [i, { head, line }] of heads.entries()) {
		const next = heads[i + 1];
		if (!head.tieNext || !next) continue;
		const opts = { firstIndexes: [0], lastIndexes: [0] };
		const ties =
			next.line === line
				? [{ firstNote: head.note, lastNote: next.head.note, ...opts }]
				: [
						{ firstNote: head.note, lastNote: null, ...opts },
						{ firstNote: null, lastNote: next.head.note, ...opts }
					];
		for (const notes of ties) {
			new StaveTie(notes).setStyle({ fillStyle: INK, strokeStyle: INK }).setContext(ctx).draw();
		}
	}
}
