import type { ChordExpectation } from '$lib/application/ports';
import type { LaneEntry, ShapeView } from '$lib/application/session/contract';
import { select } from '$lib/domain/families';
import {
	chordShapes,
	closestShape,
	expectedShape,
	type ChordGridConfusion,
	type ChordReading,
	type ChordShape,
	type ChordShapesIndex
} from '$lib/domain/families/guitar/chordShapes';
import { gridById, gridChanges, triadOf, type GridChange } from '$lib/domain/grid';
import { MEMBER_CONTENT, admittedMembers, type MemberContent } from '$lib/domain/judges';
import {
	formatSpelledNote,
	parseVoicingKey,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import {
	changeSet,
	placedVoicingSet,
	type ChangeData,
	type ChangeItem,
	type VoicingFigureItem
} from '$lib/domain/sets';
import { occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { ResponseValue } from '$lib/domain/time';
import {
	DEFAULT_SETTINGS,
	type AidLevel,
	type ChordDiagramStyle,
	type Locale,
	type PlannedPassage,
	type ResponseVerdict
} from '$lib/domain/types';
import { changeExpectation } from './changeExpectation';
import { CHORD_GRID_MESSAGES } from './chordGridMessages';
import { TRIAD_STRING_NAMES } from '$lib/application/presentation/triadMessages';
import type { PresentedRound, SetPresenter, StagePlace } from './types';

/** A round known by its item alone: no passage, no expectation. */
const NO_ROUND: PresentedRound = { passage: null, expectations: [] };

/** Between the strings of a set and the frets of a shape: a hyphen that never breaks the line. */
const SEPARATOR = '‑';

/** Beats of a bar of a link tour: one shape per bar. */
const LINK_BAR_BEATS = 4;

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
	/** How its chord shapes are drawn: the exercise's style, else the player's. */
	chordDiagram: ChordDiagramStyle;
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

/** "sol‑si‑mi", "G‑B‑E": the strings of a set, low first. */
function setLabel(set: readonly StringNumber[], locale: Locale): string {
	return set.map((string) => TRIAD_STRING_NAMES[locale][string]).join(SEPARATOR);
}

/** Where a shape sits: its lowest fretted fret, a shape on open strings only at 0. */
function positionOf(occurrence: VoicingOccurrence): number {
	const position = occurrencePosition(occurrence);
	return position === 'open' ? 0 : position;
}

/** The round's chord shapes content: what its chord expectation admits; null when it has none. */
function chordContent(round: Pick<PresentedRound, 'expectations'>): MemberContent | null {
	for (const { sensor, content } of round.expectations) {
		if (sensor !== 'chord' || content?.kind !== MEMBER_CONTENT) continue;
		const member = content.value as MemberContent;
		if (member.family === chordShapes.id) return member;
	}
	return null;
}

const admittedOf = (content: MemberContent | null) =>
	content === null ? [] : (admittedMembers(content) as ChordShape[]);

/** The passage params of a round as it reads them; none outside a passage. */
const eachOf = (round: PresentedRound) => round.passage?.each ?? {};

/** The kind of cue a grid passage's params give: a direction climbs, a zone stays; else a jam. */
function cueKind(round: PresentedRound): GridCue['kind'] {
	const { direction, zone } = eachOf(round);
	if (direction === 'up' || direction === 'down') return 'climb';
	return Array.isArray(zone) ? 'zone' : 'jam';
}

/** The cue of a grid passage (`cueKind`). */
function cueOf(round: PresentedRound, locale: Locale): GridCue {
	const { direction, zone } = eachOf(round);
	if (direction === 'up' || direction === 'down') {
		const strings = (chordContent(round)?.index as ChordShapesIndex | undefined)?.strings ?? [];
		return { kind: 'climb', set: setLabel(strings, locale), direction };
	}
	if (Array.isArray(zone)) return { kind: 'zone', from: zone[0], to: zone[1] };
	return { kind: 'jam' };
}

/** The changes of a grid passage, the whole grid. */
const gridLine = (item: ChangeItem): GridChange[] => gridChanges(gridById(item.grid));

/** The shapes of a link tour, from its passage's items (the one asked alone outside a passage). */
function tourShapes(item: VoicingFigureItem, passage: PlannedPassage | null): VoicingOccurrence[] {
	const items = (passage?.items ?? [item]) as VoicingFigureItem[];
	return items.flatMap((each) => occurrenceOfId(placedVoicingSet.itemKey(each)) ?? []);
}

/** The chord a link plays, as a chord chart writes it: its passage's, else its voicing's. */
function linkSymbol(item: VoicingFigureItem, passage: PlannedPassage | null): string {
	const written = passage?.of.chord;
	if (typeof written === 'string') return written;
	const { chord } = parseVoicingKey(item.voicing);
	return formatSpelledNote(chord.root) + chord.quality.suffix;
}

/** A link tour as a line of changes: one shape per bar. */
function linkLine(item: VoicingFigureItem, passage: PlannedPassage | null): GridChange[] {
	const symbol = linkSymbol(item, passage);
	return tourShapes(item, passage).map((_, i) => ({
		at: i * LINK_BAR_BEATS,
		length: LINK_BAR_BEATS,
		symbol
	}));
}

/**
 * The shape to play at the next change of a grid passage, the shape `heard` ringing (else the
 * one that rang before): climb, the shape admitted closest to it in the direction the climb goes
 * then (without one: the lowest going up, the highest going down); zone, the lowest admitted;
 * jam, none.
 */
function aidFor(item: ChangeItem, round: PresentedRound, heard: string | null): ChordShape | null {
	const cue = cueKind(round);
	const content = chordContent(round);
	const next = gridLine(item)[item.index + 1];
	if (cue === 'jam' || !content || !next) return null;
	const index = { ...(content.index as ChordShapesIndex), chord: triadOf(next.symbol) };
	const ringing = heard ?? round.passage?.previous ?? null;
	const previous = ringing === null ? null : chordShapes.member(ringing);
	const { admitted, turned } = select(chordShapes, index, content.selection, { previous });
	if (cue === 'climb') {
		const direction = eachOf(round).direction;
		const going = turned ? (direction === 'up' ? 'down' : 'up') : direction;
		if (!previous && going === 'down') return admitted.at(-1) ?? null;
		return closestShape(admitted, previous);
	}
	return admitted[0] ?? null;
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

/** The lane of a link tour: the root on its first tile, then whether each shape lies higher or lower than the one before. */
function linkLaneModel(
	item: VoicingFigureItem,
	round: PresentedRound,
	locale: Locale,
	aided: boolean,
	place: StagePlace,
	miss: DrawnMiss | null
): LinkLaneModel {
	const voicing = parseVoicingKey(item.voicing);
	const set = voicing.strings.map((s) => s.string);
	const shapes = tourShapes(item, round.passage ?? null);
	const index = round.passage?.rank ?? 0;
	const tiles = shapes.map((shape, i): LinkTile => {
		if (i === 0) return 'root';
		return positionOf(shape) > positionOf(shapes[i - 1]) ? 'up' : 'down';
	});
	const now = shapes[index];
	const next = shapes[index + 1] ?? null;
	return {
		kind: 'link-lane',
		root: linkSymbol(item, round.passage ?? null),
		quality: CHORD_GRID_MESSAGES[locale].quality(voicing.chord.quality.id),
		set: set.map((string) => TRIAD_STRING_NAMES[locale][string]).join(' · '),
		strings: set.map((string) => ({ string, name: TRIAD_STRING_NAMES[locale][string] })),
		tiles,
		// A tour never chains to another: a failed one comes back after a counted bar.
		following: [],
		changes: linkLine(item, round.passage ?? null),
		index,
		beatsPerBar: 4,
		aid: aided && now ? { now: aidNotes(now), next: next && aidNotes(next) } : null,
		anchorBeat: place.anchorBeat,
		history: place.history,
		miss
	};
}

/** The screen model of a grid's change, the shape `heard` (its id) once settled, drawn in `style`. */
function gridStageModel(
	item: ChangeItem,
	round: PresentedRound,
	heard: string | null,
	locale: Locale,
	aid: AidLevel,
	place: StagePlace,
	style: ChordDiagramStyle,
	miss: DrawnMiss | null
): GridStageModel {
	const shown = aid === 'show-position' ? aidFor(item, round, heard) : null;
	return {
		title: gridById(item.grid).title,
		beatsPerBar: 4,
		changes: gridLine(item),
		index: item.index,
		cue: cueOf(round, locale),
		aid: shown && shapeView(shown.occurrence),
		chordDiagram: style,
		anchorBeat: place.anchorBeat,
		history: place.history,
		miss
	};
}

/** The reading of a response value's only expectation, the chord asked. */
function readingOf(value: ResponseValue): ChordReading | null {
	return (value.expectations[0]?.answer as ChordReading | null | undefined) ?? null;
}

/**
 * After a miss: the shape heard, the shape that was due (the one admitted closest to the one
 * heard, else to the one still ringing, else the lowest) and what tells them apart; null on a
 * success. A miss whose confusion says nothing has no gap.
 */
function feedback(
	{ answer, confusion, verdict }: { answer: unknown; confusion: unknown; verdict: ResponseVerdict },
	locale: Locale,
	round: PresentedRound
): { heard: ShapeView | null; expected: ShapeView | null; gap: string | null } | null {
	if (!isMiss(verdict)) return null;
	const decided = (answer as ChordReading | null)?.decided ?? null;
	const heard = decided === null ? null : occurrenceOfId(decided);
	const content = chordContent(round);
	const expected = expectedShape(admittedOf(content), decided, content?.previous ?? null);
	const kind = (confusion as ChordGridConfusion | null)?.kind;
	const gap = CHORD_GRID_MESSAGES[locale].gap;
	return {
		heard: heard && shapeView(heard),
		expected: expected && shapeView(expected.occurrence),
		gap: answer === null ? gap.noChordHeard : kind ? (gap[kind] ?? null) : null
	};
}

/** What the presenter's feedback draws after a miss of `value`, in `style`; null on a success. */
function drawnMiss(
	value: ResponseValue,
	locale: Locale,
	style: ChordDiagramStyle,
	round: PresentedRound
): DrawnMiss | null {
	const [asked] = value.expectations;
	const told = feedback(
		{ answer: readingOf(value), confusion: asked?.confusion ?? null, verdict: value.verdict },
		locale,
		round
	);
	return told ? { ...told, style } : null;
}

/** `Attempt.data` of a change: its item, its passage, the shape heard and what went wrong. */
function changeData(
	item: ChangeData['item'],
	value: ResponseValue,
	round: PresentedRound
): ChangeData {
	const [asked] = value.expectations;
	const passage = round.passage ?? null;
	return {
		item,
		passage: passage && {
			id: passage.id,
			index: passage.index,
			rank: passage.rank,
			each: passage.each
		},
		answer: readingOf(value),
		confusion: (asked?.confusion as ChordGridConfusion | null | undefined) ?? null
	};
}

/** What the chord sensor is told for a change of `line`: nothing when its round has no shapes. */
function expectationOf(
	round: PresentedRound & { opensAt: number },
	line: readonly GridChange[],
	anywhere: boolean
): { chord?: ChordExpectation } {
	const content = chordContent(round);
	return content ? { chord: changeExpectation(content, line, anywhere, round.opensAt) } : {};
}

type ChangesPresenter<I> = SetPresenter<I, ChordReading> &
	Required<Pick<SetPresenter<I, ChordReading>, 'feedback' | 'stageOf' | 'attemptData'>>;

/**
 * A change of a chord grid in a passage: its grid, the cue its passage params give, heard by the
 * chord sensor. Its screen model is its own (`grid-scroll`) until the gesture is a generic view.
 */
export const changePresenter: ChangesPresenter<ChangeItem> = {
	set: changeSet,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	feedback: (_item, outcome, locale, round = NO_ROUND) => feedback(outcome, locale, round),
	expectation: (item, round) => expectationOf(round, gridLine(item), cueKind(round) === 'jam'),
	stageOf: (item, settled, locale, { aid }, place, drawing, _random, round = NO_ROUND) => {
		const heard = settled === null ? null : (readingOf(settled.value)?.decided ?? null);
		const style = drawing?.chordDiagram ?? DEFAULT_SETTINGS.chordDiagram;
		const miss = settled && drawnMiss(settled.value, locale, style, round);
		return { model: gridStageModel(item, round, heard, locale, aid, place, style, miss) };
	},
	attemptData: (item, value, round = NO_ROUND) => changeData(item, value, round)
};

/**
 * A shape of a link tour: the placed shape asked, heard by the chord sensor, drawn on the link's
 * lane (`link-lane`), the tour its passage plays.
 */
export const linkPresenter: ChangesPresenter<VoicingFigureItem> = {
	set: placedVoicingSet,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	feedback: (_item, outcome, locale, round = NO_ROUND) => feedback(outcome, locale, round),
	expectation: (item, round) => expectationOf(round, linkLine(item, round.passage ?? null), false),
	stageOf: (item, settled, locale, { aid }, place, drawing, _random, round = NO_ROUND) => {
		const style = drawing?.chordDiagram ?? DEFAULT_SETTINGS.chordDiagram;
		const miss = settled && drawnMiss(settled.value, locale, style, round);
		return {
			model: linkLaneModel(item, round, locale, aid === 'show-position', place, miss)
		};
	},
	attemptData: (item, value, round = NO_ROUND) => changeData(item, value, round)
};

/**
 * The presenters found by the view an exercise names, before its set's (`lookUpPresenter`): the
 * link's shapes are placed voicings, which the sequence's figures present otherwise.
 */
export const VIEW_PRESENTERS: Readonly<Record<string, SetPresenter>> = {
	'link-lane': linkPresenter
};
