// The one place that knows VexFlow: it engraves a figure as one-line rhythm staves, or as a staff
// and a tablature (either or both). The Bravura font comes bundled with the package
// (`vexflow/bravura`), so nothing is fetched at run time.
import {
	Accidental,
	Beam,
	Dot,
	Formatter,
	Fraction as VexFraction,
	Renderer,
	Stave,
	StaveConnector,
	StaveNote,
	StaveTie,
	Stem,
	TabNote,
	TabStave,
	TimeSignature,
	Tuplet,
	Voice,
	type StemmableNote
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
import type { Notation } from '$lib/domain/exercise/figureParams';
import { CHROMATIC_NOTES, STANDARD_TUNING, type StringNumber } from '$lib/domain/music/types';

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
	/** The top y of each line, in output pixels; a line holds one system per voice. */
	lineY: number[];
	/**
	 * The height of one voice's system within a line, in output pixels: its rhythm line, or its
	 * staff and its tab.
	 */
	rowHeight: number;
	/** The width of a bar (all bars are equally wide), in output pixels. */
	barWidth: number;
}

export interface RenderOptions {
	/** The widest the drawing may be, in CSS pixels. */
	maxWidth: number;
	/** Zoom of the drawing, 1 by default. */
	scale?: number;
	/** A staff, a tab, or both, joined; absent, or neither: the one-line rhythm. */
	notation?: Notation;
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

/** Spaces above and below the five lines of the staff: room for ledger lines and stems. */
const STAFF_ABOVE = 4;
const STAFF_BELOW = 4;
const STAFF_ROW = (STAFF_ABOVE + 4 + STAFF_BELOW + 1) * LINE_SPACING;
/** The staff's note for a rest, and for a note of no pitch (with a cross for head): its middle line. */
const STAFF_MIDDLE = 'b/4';
/** Written an octave above the sound, as the guitar is (the treble clef with an 8 below). */
const WRITTEN_OCTAVE_UP = 12;

/** The tab's lines (one per string) and the spaces around them, in its own line spacing. */
const TAB_LINES = 6;
const TAB_ABOVE = 1;
const TAB_BELOW = 4;
/** VexFlow's tab line spacing, widened when the fret numbers are larger than it holds. */
const TAB_SPACING = 13;
const TAB_SPACING_PER_FRET_UNIT = 0.8;
/** The fret numbers' size in the engraving's units, at least `MIN_TEXT_PX` once scaled. */
const FRET_UNITS = 14;
/** The fret numbers are text, not music: the music font's digits are a size too small. */
const FRET_FAMILY = 'system-ui, sans-serif';
/** Room on the left of a joined staff and tab for their bracket, in the engraving's units. */
const BRACKET_ROOM = 10;
/** No text of the screen is smaller (the fret numbers included), in CSS pixels. */
const MIN_TEXT_PX = 16;

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

/** A row of a system: the one-line rhythm, the staff, or the tab. */
type Row = 'rhythm' | 'staff' | 'tab';

/** The rows of a voice's system: its staff over its tab, or the rhythm line when neither. */
function rowsOf(notation: Notation | undefined): Row[] {
	const rows: Row[] = [];
	if (notation?.staff) rows.push('staff');
	if (notation?.tab) rows.push('tab');
	return rows.length > 0 ? rows : ['rhythm'];
}

/** How the tab is drawn at a scale: its fret numbers never under `MIN_TEXT_PX` once scaled. */
interface TabLook {
	/** The fret numbers' size, in the engraving's units. */
	fretUnits: number;
	/** The space between two strings, in the engraving's units. */
	spacing: number;
}

function tabLook(scale: number): TabLook {
	const fretUnits = Math.max(FRET_UNITS, MIN_TEXT_PX / scale);
	return { fretUnits, spacing: Math.max(TAB_SPACING, fretUnits * TAB_SPACING_PER_FRET_UNIT) };
}

function rowHeight(row: Row, tab: TabLook): number {
	if (row === 'rhythm') return ROW_HEIGHT;
	if (row === 'staff') return STAFF_ROW;
	return (TAB_ABOVE + TAB_LINES - 1 + TAB_BELOW) * tab.spacing;
}

/**
 * A tab note whose fret numbers have a size of their own and stand, with its stem, `shift` to
 * the right: under the centre of a staff's note head at the same time.
 */
class FretNote extends TabNote {
	constructor(
		struct: ConstructorParameters<typeof TabNote>[0],
		private readonly look: { fretUnits: number; shift: number }
	) {
		super(struct, true);
		this.setXShift(look.shift);
		this.sizeFrets();
	}

	override setGhost(ghost: boolean): this {
		super.setGhost(ghost);
		this.sizeFrets();
		return this;
	}

	private sizeFrets(): void {
		if (!this.look) return;
		for (const fret of this.fretElement) {
			fret.setFont(FRET_FAMILY, `${this.look.fretUnits}px`);
			fret.setYShift(fret.getHeight() / 2);
			fret.setXShift(this.look.shift);
		}
		this.width = Math.max(0, ...this.fretElement.map((fret) => fret.getWidth()));
	}
}

/** The staff's key of a sounding pitch, written an octave up, spelled with sharps. */
function staffKey(pitch: number): string {
	const written = pitch + WRITTEN_OCTAVE_UP;
	const name = CHROMATIC_NOTES[((written % 12) + 12) % 12].toLowerCase();
	return `${name}/${Math.floor(written / 12) - 1}`;
}

/** The fret of a note on its string; throws when it has none to give. */
function fretOf(element: FigureNote, where: string): { str: number; fret: number } {
	const { pitch, string } = element;
	if (string === undefined)
		throw new RangeError(`cannot engrave the tab of ${where}: it has no string`);
	if (pitch === undefined)
		throw new RangeError(`cannot engrave the tab of ${where}: it has no pitch`);
	const open = STANDARD_TUNING[string as StringNumber];
	if (open === undefined || pitch < open) {
		throw new RangeError(
			`cannot engrave the tab of ${where}: pitch ${pitch} is below string ${string} (${open})`
		);
	}
	return { str: string, fret: pitch - open };
}

type FigureNote = Extract<FigureElement, { kind: 'note' }>;

interface Head {
	note: StemmableNote;
	/** True for the note that starts the sound (not for the tail of a split or a tied note). */
	attack: boolean;
	/** Whether this head is tied to the next one of the voice. */
	tieNext: boolean;
	/** Where its centre stands from the note's own x: the rhythm's and staff's head, the tab's number. */
	centre: number;
}

interface EngravedRow {
	row: Row;
	heads: Head[];
	tuplets: Tuplet[];
	voice: Voice;
	beams: Beam[];
}

interface EngravedBar {
	rows: EngravedRow[];
	formatter: Formatter;
	minWidth: number;
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

/** The note of one piece of an element on a row; `half` is half the width of its note head. */
function pieceNote(
	row: Row,
	element: FigureElement,
	piece: NoteValue,
	tail: boolean,
	look: { fretUnits: number; half: number },
	where: string
): StemmableNote {
	const rest = element.kind === 'rest';
	const duration = `${piece.name}${rest ? 'r' : ''}`;
	if (row === 'rhythm') {
		return new StaveNote({
			keys: [KEY],
			duration,
			dots: piece.dots,
			stemDirection: Stem.UP,
			autoStem: false
		});
	}
	if (row === 'staff' || rest) {
		const pitch = element.kind === 'note' ? element.pitch : undefined;
		const key = rest ? STAFF_MIDDLE : pitch === undefined ? `${STAFF_MIDDLE}/x2` : staffKey(pitch);
		return new StaveNote({ keys: [key], duration, dots: piece.dots, autoStem: true });
	}
	const note = new FretNote(
		{
			positions: [fretOf(element, where)],
			duration,
			dots: piece.dots,
			stemDirection: Stem.DOWN
		},
		{ fretUnits: look.fretUnits, shift: look.half }
	);
	// The tail of a split or a tied note: its fret again, in brackets.
	if (tail) note.setGhost(true);
	return note;
}

function engraveRow(
	row: Row,
	elements: BarElement[],
	tuplets: FigureVoice['tuplets'],
	meter: Meter,
	voiceId: string,
	tab: TabLook
): EngravedRow {
	const bar = barLength(meter);
	const heads: Head[] = [];
	const notesOfElement = new Map<number, StemmableNote[]>();

	for (const { element, index, tiedIn } of elements) {
		const tuplet = (tuplets ?? []).find((t) => t.from <= index && index <= t.to);
		const written = tuplet
			? element.duration.mul(Fraction.of(tuplet.ratio[0], tuplet.ratio[1]))
			: element.duration;
		const pieces = splitIntoNoteValues(written);
		const notes: StemmableNote[] = [];
		for (const [i, piece] of pieces.entries()) {
			// Half the width of the head this piece has on a staff: where the tab's number goes.
			const half =
				row === 'tab'
					? new StaveNote({ keys: [KEY], duration: piece.name }).getGlyphWidth() / 2
					: 0;
			const tail = i > 0 || tiedIn;
			const where = `note ${index + 1} of voice "${voiceId}"`;
			const note = pieceNote(row, element, piece, tail, { fretUnits: tab.fretUnits, half }, where);
			if (piece.dots > 0) Dot.buildAndAttach([note], { all: true });
			notes.push(note);
			const last = i === pieces.length - 1;
			heads.push({
				note,
				attack: element.kind === 'note' && !tail,
				tieNext: element.kind === 'note' && (!last || element.tieToNext === true),
				centre: note instanceof FretNote ? half : note.getGlyphWidth() / 2
			});
		}
		notesOfElement.set(index, notes);
	}

	// A tuplet is drawn per bar: one that runs over a bar line is cut at it; on the tab, below.
	const barTuplets: Tuplet[] = [];
	for (const t of tuplets ?? []) {
		const notes = elements
			.filter(({ index }) => t.from <= index && index <= t.to)
			.flatMap(({ index }) => notesOfElement.get(index) ?? []);
		if (notes.length > 0) {
			barTuplets.push(
				new Tuplet(notes, {
					numNotes: t.ratio[0],
					notesOccupied: t.ratio[1],
					...(row === 'tab' ? { location: Tuplet.LOCATION_BOTTOM } : {})
				})
			);
		}
	}

	const voice = new Voice({ numBeats: bar.n, beatValue: bar.d }).setMode(Voice.Mode.SOFT);
	const notes = heads.map((head) => head.note);
	voice.addTickables(notes);
	// No key signature: each altered note carries its accidental, for the rest of its bar.
	if (row === 'staff') Accidental.applyAccidentals([voice], 'C');
	const beams = Beam.generateBeams(notes, {
		groups: beamGroups(meter),
		beamRests: false,
		...(row === 'staff'
			? {}
			: { stemDirection: row === 'tab' ? Stem.DOWN : Stem.UP, maintainStemDirections: true })
	});
	return { row, heads, tuplets: barTuplets, voice, beams };
}

function engraveBar(
	elements: BarElement[],
	voice: FigureVoice,
	meter: Meter,
	rows: Row[],
	tab: TabLook
): EngravedBar {
	const bar = barLength(meter);
	const engraved = rows.map((row) =>
		engraveRow(row, elements, voice.tuplets, meter, voice.id, tab)
	);
	// The rows of a bar share their ticks: a note of the staff and its fret stand at one x.
	const formatter = new Formatter();
	for (const row of engraved) formatter.joinVoices([row.voice]);
	// VexFlow's tightest packing is unreadable: give each slot of the shortest note room to breathe.
	const shortest = elements.reduce(
		(min, { element }) => (element.duration.compare(min) < 0 ? element.duration : min),
		bar
	);
	const minWidth = Math.max(
		formatter.preCalculateMinTotalWidth(engraved.map((row) => row.voice)),
		Math.ceil(bar.div(shortest).toNumber()) * SLOT_PX
	);
	return { rows: engraved, formatter, minWidth };
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

function rhythmStave(x: number, y: number, width: number, signature: string | null): Stave {
	const stave = new Stave(x, y, width, {
		numLines: 1,
		spaceAboveStaffLn: LINES_ABOVE,
		spaceBelowStaffLn: LINES_BELOW
	});
	if (signature) {
		// VexFlow sets the digits on lines 1 and 3 of a five-line staff, centred on its middle
		// line; our single line is line 0: one digit just above it, one just below.
		const time = new TimeSignature(signature);
		time.topLine = -1;
		time.bottomLine = 1;
		stave.addModifier(time);
	}
	return stave;
}

/**
 * The staves of one bar of a voice, a row each, from `y` down: the clef and the tab sign when the
 * bar opens its line, the time signature on the first bar (on the tab when it stands alone).
 * Their notes start at one x.
 */
function barStaves(
	rows: Row[],
	place: { x: number; y: number; width: number },
	start: { line: boolean; signature: string | null },
	tab: TabLook
): Stave[] {
	const { x, width } = place;
	let y = place.y;
	const staves = rows.map((row) => {
		const top = y;
		y += rowHeight(row, tab);
		if (row === 'rhythm') return rhythmStave(x, top, width, start.signature);
		if (row === 'staff') {
			const staff = new Stave(x, top, width, {
				spaceAboveStaffLn: STAFF_ABOVE,
				spaceBelowStaffLn: STAFF_BELOW
			});
			if (start.line) staff.addClef('treble', undefined, '8vb');
			if (start.signature) staff.addTimeSignature(start.signature);
			return staff;
		}
		const stave = new TabStave(x, top, width, {
			numLines: TAB_LINES,
			spacingBetweenLinesPx: tab.spacing,
			spaceAboveStaffLn: TAB_ABOVE,
			spaceBelowStaffLn: TAB_BELOW
		});
		if (start.line) stave.addTabGlyph();
		if (start.signature && !rows.includes('staff')) stave.addTimeSignature(start.signature);
		return stave;
	});
	const noteStart = Math.max(...staves.map((stave) => stave.getNoteStartX()));
	for (const stave of staves) {
		stave.setNoteStartX(noteStart);
		stave.setStyle({ fillStyle: INK, strokeStyle: INK });
	}
	return staves;
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
 * Draws a figure into `host`, replacing what it held, and returns where each note and bar
 * landed: one system per voice and line, its one-line rhythm, or its staff (`treble_8`, no key
 * signature) over its tab (six strings, the frets read from each note's pitch and string, the
 * rhythm on its stems), joined, as `notation` asks; bars wrapped to `maxWidth`. Every bar gets
 * the same width, as many to a line as fit. A bar wider than `maxWidth` on its own is drawn
 * anyway, past it. Throws on a tab note without a string or a fret.
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
	const rows = rowsOf(options.notation);
	const tab = tabLook(scale);
	const systemHeight = rows.reduce((sum, row) => sum + rowHeight(row, tab), 0);

	const engraved = figure.voices.map((voice) =>
		elementsByBar(voice, meter, bars).map((elements) =>
			engraveBar(elements, voice, meter, rows, tab)
		)
	);

	// The widest a bar needs to be, the clef and the time signature of the first one included.
	const probe = barStaves(rows, { x: 0, y: 0, width: 100 }, { line: true, signature }, tab);
	const overhead = probe[0].getNoteStartX() - probe[0].getX();
	const needed =
		Math.max(...engraved.flat().map((bar) => bar.minWidth)) + overhead + BAR_END_PADDING;
	// A staff and a tab joined keep room on their left for their bracket.
	const left = EDGE + (rows.length > 1 ? BRACKET_ROOM : 0);
	const available = options.maxWidth / scale - left - EDGE;
	const perLine = Math.max(1, Math.min(bars, Math.floor(available / needed)));
	const barWidth = Math.floor(available / perLine);
	const lines = Math.ceil(bars / perLine);

	host.replaceChildren();
	const width = Math.ceil((left + perLine * barWidth + EDGE) * scale);
	const height = Math.ceil(lines * figure.voices.length * systemHeight * scale);
	const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
	renderer.resize(width, height);
	const ctx = renderer.getContext();
	ctx.scale(scale, scale);
	ctx.setFillStyle(INK);
	ctx.setStrokeStyle(INK);

	const noteX: number[] = [];
	const noteLine: number[] = [];
	const barX: number[] = [];
	// The lines hold one system per voice, voice after voice.
	const lineOf = (bar: number) => Math.floor(bar / perLine);
	for (const [v, voiceBars] of engraved.entries()) {
		// The heads of the voice's first row, which carries its ties.
		const heads: { head: Head; line: number }[] = [];
		for (const [b, bar] of voiceBars.entries()) {
			const line = lineOf(b);
			const x = left + (b % perLine) * barWidth;
			const y = (line * figure.voices.length + v) * systemHeight;
			const opensLine = b % perLine === 0;
			const staves = barStaves(
				rows,
				{ x, y, width: barWidth },
				{ line: opensLine, signature: b === 0 ? signature : null },
				tab
			);
			for (const stave of staves) stave.setContext(ctx).draw();
			if (opensLine && staves.length > 1) joinStaves(ctx, staves[0], staves[staves.length - 1]);
			const room =
				Math.min(...staves.map((stave) => stave.getNoteEndX() - stave.getNoteStartX())) -
				BAR_END_PADDING;
			bar.formatter.format(
				bar.rows.map((row) => row.voice),
				room
			);
			for (const [r, row] of bar.rows.entries()) {
				for (const head of row.heads) head.note.setStyle({ fillStyle: INK, strokeStyle: INK });
				row.voice.draw(ctx, staves[r]);
				for (const beam of row.beams)
					beam.setStyle({ fillStyle: INK, strokeStyle: INK }).setContext(ctx).draw();
				for (const tuplet of row.tuplets) tuplet.setContext(ctx).draw();
			}
			const [first] = bar.rows;
			if (first.row !== 'tab') for (const head of first.heads) heads.push({ head, line });
			if (v === 0) {
				barX.push(x * scale);
				for (const head of first.heads) {
					if (head.attack) {
						noteX.push((head.note.getAbsoluteX() + head.centre) * scale);
						noteLine.push(line);
					}
				}
			}
		}
		drawTies(ctx, heads);
	}

	const rowHeightPx = systemHeight * scale;
	const lineY = Array.from(
		{ length: lines },
		(_, line) => line * figure.voices.length * rowHeightPx
	);
	return {
		noteX,
		barX,
		width,
		height,
		noteLine,
		lineY,
		rowHeight: rowHeightPx,
		barWidth: barWidth * scale
	};
}

type Context = ReturnType<Renderer['getContext']>;

/** Joins a line's staff and tab: a bracket and a line on their left. */
function joinStaves(ctx: Context, top: Stave, bottom: Stave): void {
	for (const type of ['bracket', 'singleLeft'] as const) {
		ctx.openGroup('staveconnector');
		new StaveConnector(top, bottom)
			.setType(type)
			.setStyle({ fillStyle: INK, strokeStyle: INK })
			.setContext(ctx)
			.drawWithStyle();
		ctx.closeGroup();
	}
}

/** Ties each head flagged for it to the next one; across a line break, two half ties. */
function drawTies(ctx: Context, heads: { head: Head; line: number }[]) {
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
			new StaveTie(notes as ConstructorParameters<typeof StaveTie>[0])
				.setStyle({ fillStyle: INK, strokeStyle: INK })
				.setContext(ctx)
				.draw();
		}
	}
}
