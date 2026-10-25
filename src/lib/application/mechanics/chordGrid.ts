import type { ChordCandidate, ChordExpectation } from '$lib/application/ports';
import type { LaneEntry, ShapeView } from '$lib/application/session/contract';
import { linkShapes } from '$lib/domain/gesture/passages';
import { gridById, triadOf, type GridChange } from '$lib/domain/grid';
import {
	admittedShapes,
	chordGridRules,
	climbDirection,
	closestShape,
	expectedShape,
	parseTriadId,
	rootPosition,
	shapePosition,
	triadId,
	triadShapes,
	type ChordGridConfusion,
	type ChordGridData,
	type ChordGridItem,
	type ChordReading
} from '$lib/domain/mechanics';
import {
	formatSpelledNote,
	pitchOfSpelled,
	qualityById,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId, occurrenceOfId } from '$lib/domain/triads';
import type { ResponseValue } from '$lib/domain/time';
import {
	DEFAULT_SETTINGS,
	type AidLevel,
	type ChordDiagramStyle,
	type Locale,
	type ResponseVerdict
} from '$lib/domain/types';
import { CHORD_GRID_MESSAGES } from './chordGridMessages';
import { TRIAD_MESSAGES, TRIAD_STRING_NAMES } from './triadMessages';
import type { MechanicPresenter, StagePlace } from './types';

/** How far around the shapes expected a look-alike stays a candidate, in frets. To calibrate. */
export const NEIGHBOUR_FRETS = 2;

/** Between the strings of a set and the frets of a shape: a hyphen that never breaks the line. */
const SEPARATOR = '‑';

/** The cue of a gesture exercise, shown with the grid. */
export type GridCue =
	| { kind: 'link'; set: string; inversion: string }
	| { kind: 'climb'; set: string; direction: 'up' | 'down' }
	| { kind: 'zone'; from: number; to: number }
	| { kind: 'jam' };

/** A tile of the link's lane: the root on the first of a series, then the way to the next shape. */
export type LinkTile = 'root' | 'up' | 'down';

/** A note of a shape drawn by the link's aid: « G# » on its string and fret. */
export interface LinkAidNote {
	string: StringNumber;
	fret: number;
	name: string;
}

/** The screen model of a link tour, read by the `link-lane` view (spec 2026-10-10, second redesign). */
export interface LinkLaneModel {
	kind: 'link-lane';
	/** The chord, as the chart writes it: « E ». */
	root: string;
	/** « majeur ». */
	quality: string;
	/** « sol · si · mi ». */
	set: string;
	/** The strings of the set, low first, with their names. */
	strings: { string: StringNumber; name: string }[];
	/** One per change of the tour. */
	tiles: LinkTile[];
	/** The tiles of a chained tour, drawn after the last bar: the tour may go on. */
	following: LinkTile[];
	changes: readonly GridChange[];
	/** The change on show. */
	index: number;
	beatsPerBar: 4;
	/** The notes of the shapes to play now and next, when the change is aided. */
	aid: { now: LinkAidNote[]; next: LinkAidNote[] | null } | null;
	/** The beat of the change's target, in the map's beats from the series' start; null before. */
	anchorBeat: number | null;
	/** The changes played so far, with their verdicts. */
	history: readonly LaneEntry[];
	/** After a miss, until the next change: what was heard and expected. */
	miss: DrawnMiss | null;
}

/** A miss drawn as the old verdict drew it: the shape heard, the shape asked, what parts them. */
export interface DrawnMiss {
	heard: ShapeView | null;
	expected: ShapeView | null;
	gap: string | null;
	/** How the shapes are drawn. */
	style: ChordDiagramStyle;
}

/** The screen model of a chord grid, read by its views (`grid-scroll`). */
export interface GridStageModel {
	title: string;
	beatsPerBar: 4;
	changes: readonly GridChange[];
	/** The change on show. */
	index: number;
	cue: GridCue;
	/** The shape to play at the next change, when the passage is aided. */
	aid: ShapeView | null;
	/** The beat of the change's target, in the map's beats from the series' start; null before. */
	anchorBeat: number | null;
	/** The changes played so far, with their verdicts. */
	history: readonly LaneEntry[];
	/** After a miss, until the next change: what was heard and expected. */
	miss: DrawnMiss | null;
}

function shapeView(occurrence: VoicingOccurrence): ShapeView {
	return { notes: occurrence.notes.map(({ string, fret }) => ({ string, fret })) };
}

function fretsOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes.map((note) => note.fret).join(SEPARATOR);
}

/** "sol‑si‑mi", "G‑B‑E": the strings of a set, low first. */
function setLabel(set: readonly StringNumber[], locale: Locale): string {
	return set.map((string) => TRIAD_STRING_NAMES[locale][string]).join(SEPARATOR);
}

/** The pitches a shape sounds, low first: two shapes alike sound the same. */
function pitchesOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes
		.map((note) => note.midi)
		.sort((a, b) => a - b)
		.join();
}

function heardOf(answer: unknown): VoicingOccurrence | null {
	const decided = (answer as ChordReading | null)?.decided ?? null;
	return decided === null ? null : occurrenceOfId(decided);
}

/** The element's grid, for a grid passage; null for a link. */
function gridOf(item: ChordGridItem): { title: string } | null {
	if (item.rule === 'link') return null;
	const [, gridId] = item.element.split(':');
	return gridById(gridId);
}

/** The shapes of a link tour, a chained one without its lowest. */
function tourShapes(item: ChordGridItem): VoicingOccurrence[] {
	return linkShapes(parseTriadId(item.chord), item.sets[0], item.continued === true);
}

/** The shape a link asks at `index` of the passage. */
function linkShape(item: ChordGridItem, index: number): VoicingOccurrence | null {
	return tourShapes(item)[index] ?? null;
}

function cueOf(item: ChordGridItem, locale: Locale): GridCue {
	switch (item.rule) {
		case 'link': {
			const shape = item.shape ? occurrenceOfId(item.shape) : null;
			const root = shape ? rootPosition(shape.voicing).string : item.sets[0][0];
			return {
				kind: 'link',
				set: setLabel(item.sets[0], locale),
				inversion: TRIAD_MESSAGES[locale].rootOn(TRIAD_STRING_NAMES[locale][root])
			};
		}
		case 'climb':
			return {
				kind: 'climb',
				set: setLabel(item.sets[0], locale),
				direction: item.direction ?? 'up'
			};
		case 'zone':
			return { kind: 'zone', from: item.zone?.from ?? 0, to: item.zone?.to ?? 0 };
		case 'jam':
			return { kind: 'jam' };
	}
}

function cueText(cue: GridCue, locale: Locale): string {
	const messages = CHORD_GRID_MESSAGES[locale];
	switch (cue.kind) {
		case 'link':
			return cue.inversion;
		case 'climb':
			return cue.direction === 'up' ? messages.up : messages.down;
		case 'zone':
			return messages.zone(cue.from, cue.to);
		case 'jam':
			return '';
	}
}

/**
 * The next change of the passage, as the selector will serve it, the shape `heard` ringing
 * (else the one that rang before), a climb turned where the neck runs out; null after the last.
 */
function nextChange(item: ChordGridItem, heard: string | null): ChordGridItem | null {
	const index = item.index + 1;
	const change = item.changes[index];
	if (!change) return null;
	const shape = item.rule === 'link' ? linkShape(item, index) : null;
	const next: ChordGridItem = {
		...item,
		index,
		symbol: change.symbol,
		chord: item.rule === 'link' ? item.chord : triadId(triadOf(change.symbol)),
		...(shape && { shape: occurrenceId(shape) }),
		previous: heard ?? item.previous
	};
	// A climb turns where the neck runs out, as the selector will turn it.
	return next.rule === 'climb' ? { ...next, direction: climbDirection(next) } : next;
}

/**
 * The shape to play at the next change: link, the shape asked; climb, the admitted shape closest
 * to the one just heard, in the direction the climb goes then (else the one before; the lowest going up, the highest going down
 * without any); zone, the lowest in the zone; jam, none.
 */
function aidFor(item: ChordGridItem, heard: string | null): VoicingOccurrence | null {
	const next = nextChange(item, heard);
	if (!next || next.rule === 'jam') return null;
	const admitted = admittedShapes(next);
	if (next.rule === 'climb') {
		const reference = next.previous === null ? null : occurrenceOfId(next.previous);
		if (!reference && next.direction === 'down') return admitted.at(-1) ?? null;
		return closestShape(admitted, reference);
	}
	return admitted[0] ?? null;
}

function toCandidate(kind: string, occurrence: VoicingOccurrence): ChordCandidate {
	return {
		id: occurrenceId(occurrence),
		kind,
		notes: occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
	};
}

/** The other quality a chord may be mistaken for: major and minor, each for the other. */
const OTHER_QUALITY: Readonly<Record<string, string>> = { maj: 'min', min: 'maj' };

/**
 * What the chord sensor listens for in a change (spec 2026-10-10, section 3): the shapes the rule
 * admits on the passage's sets; then, within NEIGHBOUR_FRETS of their frets (anywhere in a jam),
 * the other shapes of the chord, those of its other quality and those of the other chords of the
 * grid. Never the shape still ringing, nor a shape of the same pitches.
 */
export function gridExpectation(item: ChordGridItem, opensAt: number): ChordExpectation {
	const ringing = item.previous === null ? null : occurrenceOfId(item.previous);
	const silent = (o: VoicingOccurrence) => !ringing || pitchesOf(o) !== pitchesOf(ringing);
	const expected = admittedShapes(item).filter(silent);
	const frets = expected.flatMap((o) => o.notes.map((note) => note.fret));
	const near = (o: VoicingOccurrence) =>
		item.rule === 'jam' ||
		frets.length === 0 ||
		o.notes.every(
			(note) =>
				note.fret >= Math.min(...frets) - NEIGHBOUR_FRETS &&
				note.fret <= Math.max(...frets) + NEIGHBOUR_FRETS
		);
	const asked = parseTriadId(item.chord);
	const others = new Map<string, string>();
	const other = OTHER_QUALITY[asked.quality.id];
	if (other) {
		others.set(triadId({ root: asked.root, quality: qualityById(other) }), 'other-quality');
	}
	const samePitch = (chord: string) => {
		const { root, quality } = parseTriadId(chord);
		return pitchOfSpelled(root) === pitchOfSpelled(asked.root) && quality.id === asked.quality.id;
	};
	for (const change of item.changes) {
		const chord = triadId(triadOf(change.symbol));
		if (!samePitch(chord) && !others.has(chord)) others.set(chord, 'other-chord');
	}
	const candidates = new Map<string, ChordCandidate>();
	const add = (kind: string, o: VoicingOccurrence) => {
		const candidate = toCandidate(kind, o);
		if (!candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
	};
	expected.forEach((o) => add('expected', o));
	triadShapes(item)
		.filter((o) => silent(o) && near(o))
		.forEach((o) => add('other-shape', o));
	for (const [chord, kind] of others) {
		triadShapes({ chord, sets: item.sets })
			.filter((o) => silent(o) && near(o))
			.forEach((o) => add(kind, o));
	}
	return {
		opensAt,
		expected: expected.map(occurrenceId),
		candidates: [...candidates.values()],
		style: 'unknown'
	};
}

function isMiss(verdict: ResponseVerdict): boolean {
	return verdict === 'wrong' || verdict === 'corrected';
}

function aidNotes(occurrence: VoicingOccurrence): LinkAidNote[] {
	return occurrence.notes.map(({ string, fret, note }) => ({
		string,
		fret,
		name: formatSpelledNote(note)
	}));
}

/**
 * The lane of a link tour: the root on its first tile, then whether each shape lies higher or
 * lower than the one before (a chained tour climbs from the lowest, played at the end of the last).
 */
function linkLaneModel(
	item: ChordGridItem,
	locale: Locale,
	aided: boolean,
	place: StagePlace,
	miss: DrawnMiss | null
): LinkLaneModel {
	const [set] = item.sets;
	const shapes = tourShapes(item);
	const lowest = linkShapes(parseTriadId(item.chord), set)[0];
	const tilesOf = (tour: VoicingOccurrence[], chained: boolean) =>
		tour.map((shape, i): LinkTile => {
			const before = i > 0 ? tour[i - 1] : chained ? lowest : null;
			if (!before) return 'root';
			return shapePosition(shape) > shapePosition(before) ? 'up' : 'down';
		});
	const tiles = tilesOf(shapes, item.continued === true);
	const following = tilesOf(linkShapes(parseTriadId(item.chord), set, true), true);
	const now = shapes[item.index];
	const next = shapes[item.index + 1] ?? null;
	return {
		kind: 'link-lane',
		root: item.symbol,
		quality: CHORD_GRID_MESSAGES[locale].quality(parseTriadId(item.chord).quality.id),
		set: set.map((string) => TRIAD_STRING_NAMES[locale][string]).join(' · '),
		strings: set.map((string) => ({ string, name: TRIAD_STRING_NAMES[locale][string] })),
		tiles,
		following,
		changes: item.changes,
		index: item.index,
		beatsPerBar: 4,
		aid: aided && now ? { now: aidNotes(now), next: next && aidNotes(next) } : null,
		anchorBeat: place.anchorBeat,
		history: place.history,
		miss
	};
}

/** No place: the old controller gives its views their placement apart. */
const NO_PLACE: StagePlace = { anchorBeat: null, history: [] };

/** The screen model of a change, the shape `heard` (occurrenceId) once settled. */
function stageModel(
	item: ChordGridItem,
	heard: string | null,
	locale: Locale,
	aid: AidLevel,
	place: StagePlace,
	miss: DrawnMiss | null = null
): LinkLaneModel | GridStageModel {
	if (item.rule === 'link') {
		return linkLaneModel(item, locale, aid === 'show-position', place, miss);
	}
	const shown = aid === 'show-position' ? aidFor(item, heard) : null;
	return {
		title: gridOf(item)?.title ?? item.symbol,
		beatsPerBar: 4,
		changes: item.changes,
		index: item.index,
		cue: cueOf(item, locale),
		aid: shown && shapeView(shown),
		anchorBeat: place.anchorBeat,
		history: place.history,
		miss
	};
}

/** The reading of a response value's only expectation, the chord asked. */
function readingOf(value: ResponseValue): ChordReading | null {
	return (value.expectations[0]?.answer as ChordReading | null | undefined) ?? null;
}

/** What the presenter's feedback draws after a miss of `value`, in `style`; null on a success. */
function drawnMiss(
	item: ChordGridItem,
	value: ResponseValue,
	locale: Locale,
	style: ChordDiagramStyle
): DrawnMiss | null {
	const [asked] = value.expectations;
	const feedback = chordGridPresenter.feedback?.(
		item,
		{ answer: readingOf(value), confusion: asked?.confusion ?? null, verdict: value.verdict },
		locale
	);
	return feedback ? { ...feedback, style } : null;
}

/** A change of a chord grid: its symbol, the cue of its exercise, heard by the chord sensor. */
export const chordGridPresenter: MechanicPresenter<ChordGridItem, ChordReading> = {
	rules: chordGridRules,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	prompt: (item, _aids, locale) => {
		const cue = cueOf(item, locale);
		return {
			primary: item.symbol,
			secondary: cueText(cue, locale),
			...((cue.kind === 'link' || cue.kind === 'climb') && { detail: cue.set }),
			aid: null,
			diagram: null
		};
	},
	answerLabel: (answer) => {
		const heard = heardOf(answer);
		return heard ? fretsOf(heard) : null;
	},
	reveal: () => null,
	feedback: (item, { answer, confusion, verdict }, locale) => {
		if (!isMiss(verdict)) return null;
		const heard = heardOf(answer);
		const expected = expectedShape(item, heard && occurrenceId(heard));
		const kind = (confusion as ChordGridConfusion | null)?.kind;
		const gap = CHORD_GRID_MESSAGES[locale].gap;
		return {
			heard: heard && shapeView(heard),
			expected: expected && shapeView(expected),
			gap: answer === null ? gap.noChordHeard : kind ? gap[kind] : null
		};
	},
	expectation: (item, round) => ({ chord: gridExpectation(item, round.opensAt) }),
	stage: (item, settled, locale, { aid }) => {
		const heard = (settled?.answer as ChordReading | null | undefined)?.decided ?? null;
		return { model: stageModel(item, heard, locale, aid, NO_PLACE) };
	},
	stageOf: (item, settled, locale, { aid }, place, drawing) => {
		const heard = settled === null ? null : (readingOf(settled.value)?.decided ?? null);
		const style = drawing?.chordDiagram ?? DEFAULT_SETTINGS.chordDiagram;
		const miss = settled && drawnMiss(item, settled.value, locale, style);
		return { model: stageModel(item, heard, locale, aid, place, miss) };
	},
	attemptData: (item, value): ChordGridData => {
		const [asked] = value.expectations;
		return {
			item,
			answer: readingOf(value),
			confusion: (asked?.confusion as ChordGridConfusion | null | undefined) ?? null
		};
	}
};

/** The gesture track as the session shows it, by mechanic id. */
export const GESTURE_PRESENTERS: Record<string, MechanicPresenter> = {
	[chordGridPresenter.rules.id]: chordGridPresenter
};
