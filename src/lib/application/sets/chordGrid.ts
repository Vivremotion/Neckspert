import type { ChordExpectation } from '$lib/application/ports';
import {
	chordShapes,
	type ChordGridConfusion,
	type ChordReading
} from '$lib/domain/families/guitar/chordShapes';
import { gridById, gridChanges, type GridChange } from '$lib/domain/grid';
import { MEMBER_CONTENT, type MemberContent } from '$lib/domain/judges';
import { formatSpelledNote, parseVoicingKey } from '$lib/domain/music';
import {
	changeSet,
	placedVoicingSet,
	type ChangeData,
	type ChangeItem,
	type VoicingFigureItem
} from '$lib/domain/sets';
import type { ResponseValue } from '$lib/domain/time';
import type { PlannedPassage } from '$lib/domain/types';
import { changeExpectation } from './changeExpectation';
import type { PresentedRound, SetPresenter } from './types';

/** A round known by its item alone: no passage, no expectation. */
const NO_ROUND: PresentedRound = { passage: null, expectations: [] };

/** The round's chord shapes content: what its chord expectation admits; null when it has none. */
function chordContent(round: Pick<PresentedRound, 'expectations'>): MemberContent | null {
	for (const { sensor, content } of round.expectations) {
		if (sensor !== 'chord' || content?.kind !== MEMBER_CONTENT) continue;
		const member = content.value as MemberContent;
		if (member.family === chordShapes.id) return member;
	}
	return null;
}

/**
 * A grid passage whose params neither climb (`direction`) nor stay in a zone (`zone`): the
 * chord sensor listens for its shapes wherever they lie.
 */
function listensAnywhere(round: PresentedRound): boolean {
	const { direction, zone } = round.passage?.each ?? {};
	return direction !== 'up' && direction !== 'down' && !Array.isArray(zone);
}

/** The changes of a grid passage, the whole grid. */
const gridLine = (item: ChangeItem): GridChange[] => gridChanges(gridById(item.grid));

/** The chord a link plays, as a chord chart writes it: its passage's, else its voicing's. */
function linkSymbol(item: VoicingFigureItem, passage: PlannedPassage | null): string {
	const written = passage?.of.chord;
	if (typeof written === 'string') return written;
	const { chord } = parseVoicingKey(item.voicing);
	return formatSpelledNote(chord.root) + chord.quality.suffix;
}

/** The reading of a response value's only expectation, the chord asked. */
function readingOf(value: ResponseValue): ChordReading | null {
	return (value.expectations[0]?.answer as ChordReading | null | undefined) ?? null;
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
	line: readonly { symbol: string }[],
	anywhere: boolean
): { chord?: ChordExpectation } {
	const content = chordContent(round);
	return content ? { chord: changeExpectation(content, line, anywhere, round.opensAt) } : {};
}

type ChangesPresenter<I> = SetPresenter<I, ChordReading> &
	Required<Pick<SetPresenter<I, ChordReading>, 'expectation' | 'attemptData'>>;

/**
 * A change of a chord grid in a passage, heard by the chord sensor: the shapes its content admits
 * and their look-alikes among the chords of its grid. Its screen is its exercise's presentation,
 * drawn on the passage (`passageStage`).
 */
export const changePresenter: ChangesPresenter<ChangeItem> = {
	set: changeSet,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	expectation: (item, round) => expectationOf(round, gridLine(item), listensAnywhere(round)),
	attemptData: (item, value, round = NO_ROUND) => changeData(item, value, round)
};

/**
 * A shape of a link tour: the placed shape asked, heard by the chord sensor among the shapes of
 * its chord near it. Its screen is its exercise's presentation, drawn on the passage.
 */
export const linkPresenter: ChangesPresenter<VoicingFigureItem> = {
	set: placedVoicingSet,
	scene: 'guitar',
	sensors: ['chord'],
	contestable: true,
	expectation: (item, round) =>
		expectationOf(round, [{ symbol: linkSymbol(item, round.passage ?? null) }], false),
	attemptData: (item, value, round = NO_ROUND) => changeData(item, value, round)
};

/**
 * The presenters found by the view an exercise names, before its set's (`lookUpPresenter`): the
 * link's shapes are placed voicings, which the sequence's figures present otherwise.
 */
export const VIEW_PRESENTERS: Readonly<Record<string, SetPresenter>> = {
	'link-lane': linkPresenter
};
