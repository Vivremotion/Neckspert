/**
 * Converts a Guitar Pro 8 MusicXML export into the project's LilyPond subset, and lists the
 * chord shapes of a chord part, so that private exercises can be written in `exercises.local/`.
 *
 *   npm run musicxml -- <file> --part P1      the melody of part P1, as LilyPond
 *   npm run musicxml -- <file> --shapes P2    the shapes of part P2, bar by bar
 *
 * Warnings go to stderr. No XML library: the export is regular, so a small tag reader is enough
 * and the project gets no new dependency.
 *
 * What it reads: each part has two staves, the notation (staff 1) and the TAB (a staff whose clef
 * is `TAB`), every note written twice; the TAB duplicate is ignored. The pitch of a note is the
 * open string of the standard tuning plus its fret (the export writes the guitar an octave up;
 * the tab says what sounds). Durations come from the written type (and dots), `<divisions>`
 * change by bar and are tracked; tuplets come from `<time-modification>`.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** MIDI pitch of the open strings of a guitar in standard tuning, by string number (1 = high E). */
const OPEN_STRINGS = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
const STRING_COUNT = 6;
/**
 * The standard tuning as a staff declares it, lowest string first. A part writes it either as the
 * guitar's written convention (one octave above the sound) or as the sound itself.
 */
const STANDARD_TUNINGS = [
	['E3', 'A3', 'D4', 'G4', 'B4', 'E5'],
	['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
].map((tuning) => tuning.join(' '));
/** The notation writes the guitar this many semitones above what sounds. */
const WRITTEN_OCTAVE_SEMITONES = 12;
const NOTE_TYPES = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16, '32nd': 32 };
const DENOMINATORS = [1, 2, 4, 8, 16, 32];
const MAX_DOTS = 3;
const SHARP_PITCH_NAMES = ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'ais', 'b'];
/** Used when the key signature has flats (`es` and `as` alone are E and A flat, `ees` and `aes` too). */
const FLAT_PITCH_NAMES = ['c', 'des', 'd', 'ees', 'e', 'f', 'ges', 'g', 'aes', 'a', 'bes', 'b'];
/** MIDI number of a LilyPond `c` with no octave mark. */
const C_MIDI = 48;
const SEMITONES_PER_OCTAVE = 12;
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Children of `<technical>` that carry the string and the fret, so no technique to report. */
const KNOWN_TECHNICAL = new Set(['string', 'fret']);
/** Marks of a note the converter does not render, reported once per name. */
const UNRENDERED_NOTATIONS = new Set(['ornaments', 'articulations', 'glissando', 'slide']);

// ---------------------------------------------------------------------------------------------
// Exact fractions of a whole note, as [numerator, denominator]
// ---------------------------------------------------------------------------------------------

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** @returns {[number, number]} */
function frac(n, d = 1) {
	const g = gcd(n, d) || 1;
	const sign = d < 0 ? -1 : 1;
	return [(sign * n) / g, (sign * d) / g];
}
const add = (a, b) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a, b) => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
const compare = (a, b) => a[0] * b[1] - b[0] * a[1];
const ZERO = frac(0);

// ---------------------------------------------------------------------------------------------
// A small tag reader
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{ name: string, attrs: Record<string, string>, children: XmlNode[], text: string }} XmlNode
 */

const TAG = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Guitar Pro hides the string and the fret of some notes in a processing instruction inside
 * `<technical>` (`<?GP <root><string>3</string><fret>2</fret></root>?>`). Only those two
 * elements are kept, in place of the instruction, so the tree reads them like plain ones.
 */
function stringAndFretOf(body) {
	return ['string', 'fret']
		.map((name) => body.match(new RegExp(`<${name}\\b[^>]*>[^<]*</${name}>`))?.[0] ?? '')
		.join('');
}

/** Reads the document into a tree. Text is kept on the element that holds it. */
function readXml(xml) {
	const cleaned = xml
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<\?([\w-]+)([\s\S]*?)\?>/g, (_, target, body) =>
			target === 'xml' ? '' : stringAndFretOf(body)
		)
		.replace(/<!DOCTYPE[^>]*>/g, '');
	/** @type {XmlNode} */
	const root = { name: '#document', attrs: {}, children: [], text: '' };
	/** @type {XmlNode[]} */
	const stack = [root];
	let last = 0;
	for (const match of cleaned.matchAll(TAG)) {
		const top = stack[stack.length - 1];
		top.text += cleaned.slice(last, match.index);
		last = match.index + match[0].length;
		const [, closing, name, rawAttrs, selfClosing] = match;
		if (closing) {
			if (stack.length > 1 && top.name === name) stack.pop();
			else throw new Error(`musicxml: unexpected </${name}>`);
			continue;
		}
		/** @type {Record<string, string>} */
		const attrs = {};
		for (const a of rawAttrs.matchAll(ATTRIBUTE)) attrs[a[1]] = a[2] ?? a[3];
		/** @type {XmlNode} */
		const node = { name, attrs, children: [], text: '' };
		top.children.push(node);
		if (!selfClosing) stack.push(node);
	}
	if (stack.length !== 1)
		throw new Error(`musicxml: <${stack[stack.length - 1].name}> is not closed`);
	return root;
}

/** @returns {XmlNode | undefined} the first child with that name */
const child = (node, name) => node.children.find((c) => c.name === name);
const children = (node, name) => node.children.filter((c) => c.name === name);
/** The first descendant with that name, at any depth. */
function findDeep(node, name) {
	for (const c of node.children) {
		if (c.name === name) return c;
		const found = findDeep(c, name);
		if (found) return found;
	}
	return undefined;
}
const deepNumber = (node, name) => {
	const text = findDeep(node, name)?.text.trim();
	return text === undefined || text === '' ? null : Number(text);
};
/** The trimmed text of a child element, or null when there is none. */
const textOf = (node, name) => {
	const c = child(node, name);
	return c ? c.text.trim() : null;
};
const numberOf = (node, name) => {
	const t = textOf(node, name);
	return t === null || t === '' ? null : Number(t);
};

/** A warning list that holds each message once. `into` may already hold some. */
function makeWarner(into = []) {
	const seen = new Set(into);
	return (message) => {
		if (!seen.has(message)) {
			seen.add(message);
			into.push(message);
		}
	};
}

// ---------------------------------------------------------------------------------------------
// Reading a part
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {{
 *   rest: boolean, forward: boolean, chord: boolean, grace: boolean,
 *   duration: [number, number], staff: number, voice: string | null,
 *   type: string | null, dots: number, modification: [number, number] | null,
 *   tupletStart: boolean, tupletStop: boolean, tieStart: boolean,
 *   string: number | null, fret: number | null, writtenMidi: number | null,
 *   marks: string[]
 * }} PartNote
 * @typedef {{
 *   number: number, implicit: boolean, barLength: [number, number], beatType: number,
 *   flats: boolean, notes: PartNote[]
 * }} PartMeasure
 */

function findPart(root, partId) {
	const score = root.children.find((c) => c.name === 'score-partwise');
	if (!score) throw new Error('musicxml: not a score-partwise document');
	const part = children(score, 'part').find((p) => p.attrs.id === partId);
	if (!part) {
		const ids = children(score, 'part').map((p) => p.attrs.id);
		throw new Error(`musicxml: no part "${partId}" (found: ${ids.join(', ') || 'none'})`);
	}
	return part;
}

/** MIDI number of a written pitch element, or null. */
function writtenMidiOf(pitch) {
	const step = textOf(pitch, 'step');
	const octave = numberOf(pitch, 'octave');
	if (step === null || octave === null || !(step in STEP_SEMITONES)) return null;
	return (
		(octave + 1) * SEMITONES_PER_OCTAVE + STEP_SEMITONES[step] + (numberOf(pitch, 'alter') ?? 0)
	);
}

function noteOfNode(node) {
	const notations = child(node, 'notations');
	const technical = notations ? child(notations, 'technical') : undefined;
	const marks = [];
	if (technical) {
		for (const c of technical.children) if (!KNOWN_TECHNICAL.has(c.name)) marks.push(c.name);
	}
	for (const c of notations?.children ?? []) {
		if (UNRENDERED_NOTATIONS.has(c.name)) marks.push(c.name);
	}
	const modification = child(node, 'time-modification');
	const actual = modification ? numberOf(modification, 'actual-notes') : null;
	const normal = modification ? numberOf(modification, 'normal-notes') : null;
	const tuplets = children(notations ?? { children: [] }, 'tuplet');
	const pitch = child(node, 'pitch');
	return {
		rest: child(node, 'rest') !== undefined,
		forward: false,
		chord: child(node, 'chord') !== undefined,
		grace: child(node, 'grace') !== undefined,
		duration: ZERO,
		staff: numberOf(node, 'staff') ?? 1,
		voice: textOf(node, 'voice') ?? '1',
		type: textOf(node, 'type'),
		dots: children(node, 'dot').length,
		modification: actual && normal ? frac(actual, normal) : null,
		tupletStart: tuplets.some((t) => t.attrs.type === 'start'),
		tupletStop: tuplets.some((t) => t.attrs.type === 'stop'),
		tieStart: children(node, 'tie').some((t) => t.attrs.type === 'start'),
		string: deepNumber(node, 'string'),
		fret: deepNumber(node, 'fret'),
		writtenMidi: pitch ? writtenMidiOf(pitch) : null,
		marks
	};
}

/**
 * The measures of a part with the bar length and the notes of every staff. `tabStaves` are the
 * staves whose clef is `TAB`.
 * @returns {{ measures: PartMeasure[], tabStaves: Set<number> }}
 */
function readPart(root, partId, warn) {
	const part = findPart(root, partId);
	let divisions = 1;
	let beats = 4;
	let beatType = 4;
	const tabStaves = new Set();
	/** @type {PartMeasure[]} */
	const measures = [];
	let metered = false;
	let fifths = 0;
	for (const [index, measureNode] of children(part, 'measure').entries()) {
		const parsedNumber = Number.parseInt(measureNode.attrs.number ?? '', 10);
		const number = Number.isNaN(parsedNumber) ? index + 1 : parsedNumber;
		const notes = [];
		for (const node of measureNode.children) {
			if (node.name === 'attributes') {
				divisions = numberOf(node, 'divisions') ?? divisions;
				const time = child(node, 'time');
				if (time) {
					const nextBeats = numberOf(time, 'beats') ?? beats;
					const nextType = numberOf(time, 'beat-type') ?? beatType;
					if (metered && (nextBeats !== beats || nextType !== beatType)) {
						warn(
							`bar ${number}: meter changes to ${nextBeats}/${nextType}; the figure is read in one meter`
						);
					}
					beats = nextBeats;
					beatType = nextType;
					metered = true;
				}
				const key = child(node, 'key');
				if (key) fifths = numberOf(key, 'fifths') ?? fifths;
				for (const clef of children(node, 'clef')) {
					if (textOf(clef, 'sign') === 'TAB') tabStaves.add(Number(clef.attrs.number ?? 1));
				}
				const details = children(node, 'staff-details').find((d) =>
					tabStaves.has(Number(d.attrs.number ?? 1))
				);
				if (details) checkTuning(details, warn);
			} else if (node.name === 'note') {
				const note = noteOfNode(node);
				const duration = numberOf(node, 'duration');
				note.duration = duration === null ? ZERO : frac(duration, divisions * 4);
				notes.push(note);
			} else if (node.name === 'forward') {
				const duration = numberOf(node, 'duration');
				notes.push({
					...noteOfNode(node),
					rest: true,
					forward: true,
					staff: numberOf(node, 'staff') ?? 1,
					voice: textOf(node, 'voice'),
					duration: duration === null ? ZERO : frac(duration, divisions * 4)
				});
			}
		}
		measures.push({
			number,
			implicit: measureNode.attrs.implicit === 'yes',
			barLength: frac(beats, beatType),
			beatType,
			flats: fifths < 0,
			notes
		});
	}
	return { measures, tabStaves };
}

function checkTuning(details, warn) {
	const tuning = children(details, 'staff-tuning')
		.sort((a, b) => Number(a.attrs.line) - Number(b.attrs.line))
		.map((t) => `${textOf(t, 'tuning-step')}${textOf(t, 'tuning-octave')}`);
	if (tuning.length > 0 && !STANDARD_TUNINGS.includes(tuning.join(' '))) {
		warn(
			`tuning is ${tuning.join(' ')}, not the standard tuning: pitches are read in standard tuning`
		);
	}
}

/** The sounding MIDI pitch of a note: open string plus fret, else its written pitch an octave down. */
function soundingPitch(note, bar, warn) {
	if (note.string !== null && note.fret !== null && note.string in OPEN_STRINGS) {
		return OPEN_STRINGS[note.string] + note.fret;
	}
	if (note.writtenMidi !== null) {
		warn(`bar ${bar}: a note has no string and fret, its written pitch is taken an octave down`);
		return note.writtenMidi - WRITTEN_OCTAVE_SEMITONES;
	}
	throw new Error(`musicxml: bar ${bar}: a note has neither string and fret nor pitch`);
}

// ---------------------------------------------------------------------------------------------
// LilyPond
// ---------------------------------------------------------------------------------------------

function lilyPitch(midi, flats) {
	const octave = Math.floor(midi / SEMITONES_PER_OCTAVE) - C_MIDI / SEMITONES_PER_OCTAVE;
	const marks = octave >= 0 ? "'".repeat(octave) : ','.repeat(-octave);
	const names = flats ? FLAT_PITCH_NAMES : SHARP_PITCH_NAMES;
	return `${names[midi % SEMITONES_PER_OCTAVE]}${marks}`;
}

/** The written duration (`4`, `8.`) of a note: its type and dots, else worked out from its length. */
function writtenDuration(note, bar) {
	if (note.type !== null && note.type in NOTE_TYPES) {
		return `${NOTE_TYPES[note.type]}${'.'.repeat(note.dots)}`;
	}
	if (note.type !== null) {
		throw new Error(
			`musicxml: bar ${bar}: unsupported note type "${note.type}" (use whole to 32nd)`
		);
	}
	const written = note.modification ? mul(note.duration, note.modification) : note.duration;
	for (const denominator of DENOMINATORS) {
		for (let dots = 0; dots <= MAX_DOTS; dots++) {
			const length = frac(2 ** (dots + 1) - 1, denominator * 2 ** dots);
			if (compare(length, written) === 0) return `${denominator}${'.'.repeat(dots)}`;
		}
	}
	throw new Error(
		`musicxml: bar ${bar}: a note of ${written[0]}/${written[1]} has no written duration`
	);
}

/** Rests that fill `gap`, longest first (a pickup bar is filled before its notes). */
function fillWithRests(gap) {
	const rests = [];
	for (const denominator of DENOMINATORS) {
		const piece = frac(1, denominator);
		while (compare(gap, piece) >= 0) {
			rests.push(`r${denominator}`);
			gap = sub(gap, piece);
		}
	}
	return { rests, left: gap };
}

/**
 * The notes of the staff and the voice a part is read on, in order, with what is left out
 * reported: the TAB staff (the duplicate of the notation) silently, another staff, a grace
 * note, or another voice with a warning. `state.mainVoice` is the first voice met on the staff.
 * A `<forward>` (no voice of its own) counts as time in the main voice.
 */
function mainNotes(measure, tabStaves, state, warn) {
	const kept = [];
	for (const note of measure.notes) {
		if (tabStaves.has(note.staff)) continue;
		if (note.staff !== 1) {
			warn(`bar ${measure.number}: notes on staff ${note.staff} are ignored`);
			continue;
		}
		if (note.grace) {
			warn(`bar ${measure.number}: a grace note is ignored`);
			continue;
		}
		if (note.voice !== null) {
			state.mainVoice ??= note.voice;
			if (note.voice !== state.mainVoice) {
				warn(
					`bar ${measure.number}: voice ${note.voice} is ignored (only voice ${state.mainVoice} is read)`
				);
				continue;
			}
		}
		kept.push(note);
	}
	return kept;
}

/**
 * One part of one voice to our LilyPond (pitch from string and fret, standard tuning), plus
 * warnings. A bar per line; a pickup bar is filled with rests in front of its notes. Pitches are
 * spelled with sharps, or with flats in a key signature of flats.
 * @param {string} xml
 * @param {string} partId
 * @returns {{ lilypond: string, warnings: string[] }}
 */
export function convertMelody(xml, partId) {
	const warnings = [];
	const warn = makeWarner(warnings);
	const { measures, tabStaves } = readPart(readXml(xml), partId, warn);
	const state = { mainVoice: null };
	const lines = [];
	for (const [index, measure] of measures.entries()) {
		const events = [];
		let length = ZERO;
		for (const note of mainNotes(measure, tabStaves, state, warn)) {
			if (note.chord) {
				warn(`bar ${measure.number}: a chord in a melody part, only its first note is kept`);
				continue;
			}
			if (note.forward) warn(`bar ${measure.number}: <forward> is read as a rest`);
			for (const mark of note.marks) warn(`technique "${mark}" is not converted`);
			length = add(length, note.duration);
			if (note.rest) {
				events.push(restEvent(note, measure.number, warn));
				continue;
			}
			const duration = writtenDuration(note, measure.number);
			const midi = soundingPitch(note, measure.number, warn);
			const string = note.string !== null && note.string in OPEN_STRINGS ? `\\${note.string}` : '';
			events.push({
				text: `${lilyPitch(midi, measure.flats)}${duration}${string}${note.tieStart ? '~' : ''}`,
				note
			});
		}
		const tokens = [];
		const pickup = index === 0 && (measure.number === 0 || measure.implicit);
		if (compare(length, measure.barLength) < 0) {
			const { rests, left } = fillWithRests(sub(measure.barLength, length));
			if (left[0] !== 0)
				warn(`bar ${measure.number}: ${left[0]}/${left[1]} of the bar is not filled`);
			if (pickup) {
				tokens.push(...rests);
			} else {
				warn(`bar ${measure.number}: the bar is short, it is filled with rests at its end`);
			}
			tokens.push(...groupTuplets(events, measure.number, warn));
			if (!pickup) tokens.push(...rests);
		} else {
			if (compare(length, measure.barLength) > 0) {
				warn(`bar ${measure.number}: the bar is longer than its meter`);
			}
			tokens.push(...groupTuplets(events, measure.number, warn));
		}
		if (tokens.length > 0) lines.push(`${tokens.join(' ')} |`);
	}
	return { lilypond: lines.join('\n'), warnings };
}

/** A rest as an event; one that has no written value (5/4 in one rest) is written as several. */
function restEvent(note, bar, warn) {
	try {
		return { text: `r${writtenDuration(note, bar)}`, note };
	} catch {
		const { rests, left } = fillWithRests(note.duration);
		warn(
			`bar ${bar}: a rest of ${note.duration[0]}/${note.duration[1]} is written as ${rests.join(' ')}`
		);
		if (left[0] !== 0) warn(`bar ${bar}: ${left[0]}/${left[1]} of a rest is left out`);
		return { text: rests.join(' '), note: { ...note, modification: null } };
	}
}

/**
 * The events of a bar as tokens, with `\tuplet a/b { … }` around the notes of a tuplet. A tuplet
 * that its stop mark does not close is still written, and reported: the figure will not parse.
 */
function groupTuplets(events, bar, warn) {
	const tokens = [];
	let open = null;
	let group = [];
	let stopped = false;
	const close = () => {
		if (open) {
			if (!stopped) warn(`bar ${bar}: a tuplet is not closed by a stop mark, it will not parse`);
			tokens.push(`\\tuplet ${open[0]}/${open[1]} { ${group.join(' ')} }`);
		}
		open = null;
		group = [];
		stopped = false;
	};
	for (const { text, note } of events) {
		const ratio = note.modification;
		if (ratio === null) {
			close();
			tokens.push(text);
			continue;
		}
		if (open && (compare(open, ratio) !== 0 || note.tupletStart)) close();
		open ??= ratio;
		group.push(text);
		if (note.tupletStop) {
			stopped = true;
			close();
		}
	}
	close();
	return tokens;
}

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

/**
 * One part of chords to the shapes bar by bar: `frets[i]` is the fret on string `i + 1`
 * (1 = high E), null when the string does not sound. `bar` is the bar number as the export writes
 * it (a pickup bar is 0), `beat` counts from 1 in beats of the meter (2.5 is the half-way point).
 * Only the first voice of the staff is positioned; another voice is left out with a warning.
 * @param {string} xml
 * @param {string} partId
 * @param {string[]} [warnings] receives what the converter had to leave out
 * @returns {{ bar: number, beat: number, frets: (number | null)[] }[]}
 */
export function listShapes(xml, partId, warnings = []) {
	const warn = makeWarner(warnings);
	const { measures, tabStaves } = readPart(readXml(xml), partId, warn);
	const state = { mainVoice: null };
	const shapes = [];
	for (const [index, measure] of measures.entries()) {
		const kept = mainNotes(measure, tabStaves, state, warn);
		const length = kept.filter((n) => !n.chord).reduce((sum, n) => add(sum, n.duration), ZERO);
		const pickup = index === 0 && (measure.number === 0 || measure.implicit);
		let position =
			pickup && compare(length, measure.barLength) < 0 ? sub(measure.barLength, length) : ZERO;
		let current = null;
		for (const note of kept) {
			if (!note.chord) {
				current = null;
				if (!note.rest) {
					current = {
						bar: measure.number,
						beat: 1 + (position[0] * measure.beatType) / position[1],
						frets: new Array(STRING_COUNT).fill(null)
					};
					shapes.push(current);
				}
				position = add(position, note.duration);
			}
			if (!current || note.rest) continue;
			if (note.string === null || note.fret === null || !(note.string in OPEN_STRINGS)) {
				warn(`bar ${measure.number}: a note has no string and fret, it is left out of the shape`);
				continue;
			}
			if (current.frets[note.string - 1] !== null) {
				warn(`bar ${measure.number}: two notes on string ${note.string}, the first is kept`);
				continue;
			}
			current.frets[note.string - 1] = note.fret;
		}
	}
	return shapes;
}

// ---------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------

/** One shape per line: bar.beat, the frets from the lowest string, then `string:fret` keys. */
function shapeLine({ bar, beat, frets }) {
	const lowToHigh = [...frets].reverse().map((f) => (f === null ? 'x' : String(f)));
	const keys = frets
		.map((fret, i) => (fret === null ? null : `${i + 1}:${fret}`))
		.filter((k) => k !== null)
		.reverse();
	return `bar ${bar} beat ${beat}\t${lowToHigh.join(' ')}\t${keys.join(' ')}`;
}

function main(argv) {
	const [file, ...flags] = argv;
	const option = (name) => {
		const at = flags.indexOf(name);
		return at >= 0 ? flags[at + 1] : undefined;
	};
	const part = option('--part');
	const shapesPart = option('--shapes');
	if (!file || (!part && !shapesPart)) {
		console.error('usage: npm run musicxml -- <file> --part P1 | --shapes P2');
		return 2;
	}
	const xml = readFileSync(file, 'utf8');
	if (part) {
		const { lilypond, warnings } = convertMelody(xml, part);
		for (const w of warnings) console.error(`warning: ${w}`);
		console.log(lilypond);
	} else {
		const warnings = [];
		const shapes = listShapes(xml, shapesPart, warnings);
		for (const w of warnings) console.error(`warning: ${w}`);
		console.log('# strings from the lowest (x = not played), then string:fret');
		for (const shape of shapes) console.log(shapeLine(shape));
	}
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
