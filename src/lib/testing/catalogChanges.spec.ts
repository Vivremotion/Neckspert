/**
 * The four exercises of the changes as their passages write them (plan 4b), judged, heard, opened
 * and served as the rule they replace (keyed by `params.rule`, deleted at Task 5) decided. Before
 * that rule was deleted, every change of every passage of the catalog was compared both ways in every
 * context (no shape before, every shape of the chord before and of another chord, each direction,
 * each zone): passages, 796 998 judgements, the climb's turns, what the chord sensor was told
 * (10 788 changes, expected shapes and candidates), the opening of every index on 200 draws of
 * cards, and the old selector and the passage source driven side by side over 1 680 rounds; all
 * equal (the chord sensor once the old rule's « silent » filter was kept). These rows, captured
 * from the old code while it still ran, keep it pinned.
 */
import { describe, expect, it } from 'vitest';
import { changeExpectation } from '$lib/application/sets/changeExpectation';
import { roundMemberContents } from '$lib/domain/exercise/passage/contents';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { indexOpen } from '$lib/domain/exercise/passage/opens';
import { firstEach, passageRound } from '$lib/domain/exercise/passage/round';
import type { PassageIndex } from '$lib/domain/exercise/passage/types';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { familyNamed, passageDerivation, select, type Family } from '$lib/domain/families';
import { expectedShape, type ChordShape } from '$lib/domain/families/guitar/chordShapes';
import type { GridChangeMember } from '$lib/domain/families/music/gridChanges';
import { gridById, gridChanges } from '$lib/domain/grid';
import { admittedMembers, type MemberContent } from '$lib/domain/judges';
import { memberJudge } from '$lib/domain/judges/member';
import { itemSet } from '$lib/domain/sets';
import { createPassageSource } from '$lib/domain/session/passageSource';
import { SESSION_MS } from '$lib/domain/session/policy';
import { occurrenceOfId } from '$lib/domain/triads';
import { cardKey, type CardState, type PlannedItem } from '$lib/domain/types';
import { responseAttempt } from './attempts';
import { CHANGES_EXERCISES } from './changesPassages';

type Name = 'link' | 'climb' | 'zone' | 'jam';
type Each = Record<string, unknown>;

const BY_NAME = Object.fromEntries(
	(['link', 'climb', 'zone', 'jam'] as const).map((name, i) => [name, CHANGES_EXERCISES[i]])
) as Record<Name, ExerciseDefinition>;

const indexOf = (definition: ExerciseDefinition, key: string): PassageIndex =>
	passageIndices(definition).find((index) => index.key === key)!;

/** The items of the passage of `key`, at the passage params `each`. */
function itemsOf(definition: ExerciseDefinition, key: string, each: Each = firstEach(definition)) {
	const derivation = passageDerivation(definition.passages!.members.family)!;
	return passageMembers(definition, indexOf(definition, key), each).map((member) =>
		derivation.itemOf(member)
	);
}

/** The key an attempt of the item keeps, through its exercise's set. */
function keyOf(definition: ExerciseDefinition, item: unknown): string {
	const derivation = passageDerivation(definition.passages!.members.family)!;
	return itemSet(derivation.set).itemKey(item);
}

/** The member content of a change, `previous` heard before it. */
function contentOf(name: Name, key: string, rank: number, each: Each, previous: string | null) {
	const definition = BY_NAME[name];
	const items = itemsOf(definition, key, { ...firstEach(definition), ...each });
	const round = passageRound(
		definition,
		indexOf(definition, key),
		each,
		items[rank],
		rank,
		items.length
	);
	const served = { ...round, passage: { ...round.passage, id: 'p', previous } };
	const [{ content }] = roundMemberContents(definition, served);
	return content as MemberContent;
}

/** The symbols a passage plays: its grid's changes, else its chord's. */
function lineOf(name: Name, key: string): { symbol: string }[] {
	const { grid, chord } = indexOf(BY_NAME[name], key).of as { grid?: string; chord?: string };
	if (grid !== undefined) return gridChanges(gridById(grid));
	return itemsOf(BY_NAME[name], key).map(() => ({ symbol: chord! }));
}

/** The indices of each exercise, in the order the old rule listed its elements. */
// prettier-ignore
const INDICES: Record<Name, string[]> = {
	"link": ["chord=C;strings=3,2,1", "chord=C;strings=4,3,2", "chord=Cm;strings=3,2,1", "chord=Cm;strings=4,3,2", "chord=C#;strings=3,2,1", "chord=C#;strings=4,3,2", "chord=C#m;strings=3,2,1", "chord=C#m;strings=4,3,2", "chord=D;strings=3,2,1", "chord=D;strings=4,3,2", "chord=Dm;strings=3,2,1", "chord=Dm;strings=4,3,2", "chord=Eb;strings=3,2,1", "chord=Eb;strings=4,3,2", "chord=Ebm;strings=3,2,1", "chord=Ebm;strings=4,3,2", "chord=E;strings=3,2,1", "chord=E;strings=4,3,2", "chord=Em;strings=3,2,1", "chord=Em;strings=4,3,2", "chord=F;strings=3,2,1", "chord=F;strings=4,3,2", "chord=Fm;strings=3,2,1", "chord=Fm;strings=4,3,2", "chord=F#;strings=3,2,1", "chord=F#;strings=4,3,2", "chord=F#m;strings=3,2,1", "chord=F#m;strings=4,3,2", "chord=G;strings=3,2,1", "chord=G;strings=4,3,2", "chord=Gm;strings=3,2,1", "chord=Gm;strings=4,3,2", "chord=Ab;strings=3,2,1", "chord=Ab;strings=4,3,2", "chord=Abm;strings=3,2,1", "chord=Abm;strings=4,3,2", "chord=A;strings=3,2,1", "chord=A;strings=4,3,2", "chord=Am;strings=3,2,1", "chord=Am;strings=4,3,2", "chord=Bb;strings=3,2,1", "chord=Bb;strings=4,3,2", "chord=Bbm;strings=3,2,1", "chord=Bbm;strings=4,3,2", "chord=B;strings=3,2,1", "chord=B;strings=4,3,2", "chord=Bm;strings=3,2,1", "chord=Bm;strings=4,3,2"],
	"climb": ["grid=iohefy-a;strings=3,2,1", "grid=iohefy-a;strings=4,3,2", "grid=blues-f;strings=3,2,1", "grid=blues-f;strings=4,3,2"],
	"zone": ["grid=iohefy-a", "grid=blues-f"],
	"jam": ["grid=iohefy-a", "grid=blues-f"],
};

/** The seven rounds of a link tour, by the key each attempt keeps (the placed shape). */
// prettier-ignore
const LINK_TOURS: { index: string; keys: string[] }[] = [
	{"index": "chord=C;strings=3,2,1", "keys": ["C|maj|3:5,2:1,1:3@0-1-0", "C|maj|3:1,2:3,1:5@5-5-3", "C|maj|3:3,2:5,1:1@9-8-8", "C|maj|3:5,2:1,1:3@12-13-12", "C|maj|3:3,2:5,1:1@9-8-8", "C|maj|3:1,2:3,1:5@5-5-3", "C|maj|3:5,2:1,1:3@0-1-0"]},
	{"index": "chord=Ebm;strings=4,3,2", "keys": ["D#|min|4:b3,3:5,2:1@4-3-4", "D#|min|4:5,3:1,2:b3@8-8-7", "D#|min|4:1,3:b3,2:5@13-11-11", "D#|min|4:b3,3:5,2:1@16-15-16", "D#|min|4:1,3:b3,2:5@13-11-11", "D#|min|4:5,3:1,2:b3@8-8-7", "D#|min|4:b3,3:5,2:1@4-3-4"]},
	{"index": "chord=F#;strings=3,2,1", "keys": ["F#|maj|3:3,2:5,1:1@3-2-2", "F#|maj|3:5,2:1,1:3@6-7-6", "F#|maj|3:1,2:3,1:5@11-11-9", "F#|maj|3:3,2:5,1:1@15-14-14", "F#|maj|3:1,2:3,1:5@11-11-9", "F#|maj|3:5,2:1,1:3@6-7-6", "F#|maj|3:3,2:5,1:1@3-2-2"]},
	{"index": "chord=Bm;strings=4,3,2", "keys": ["B|min|4:5,3:1,2:b3@4-4-3", "B|min|4:1,3:b3,2:5@9-7-7", "B|min|4:b3,3:5,2:1@12-11-12", "B|min|4:5,3:1,2:b3@16-16-15", "B|min|4:b3,3:5,2:1@12-11-12", "B|min|4:1,3:b3,2:5@9-7-7", "B|min|4:5,3:1,2:b3@4-4-3"]},
];

/** The rounds of a grid passage: the key each attempt keeps, its symbol, its length in beats. */
// prettier-ignore
const GRID_PASSAGES: { grid: string; rounds: [string, string, number][] }[] = [
	{"grid": "iohefy-a", "rounds": [["iohefy-a#0", "Dm7", 4], ["iohefy-a#1", "G7", 4], ["iohefy-a#2", "Dm7", 4], ["iohefy-a#3", "G7", 4], ["iohefy-a#4", "Cmaj7", 6], ["iohefy-a#5", "F7", 2], ["iohefy-a#6", "Em7", 4], ["iohefy-a#7", "Ebm7", 2], ["iohefy-a#8", "Ab7", 2]]},
	{"grid": "blues-f", "rounds": [["blues-f#0", "F7", 4], ["blues-f#1", "Bb7", 4], ["blues-f#2", "F7", 8], ["blues-f#3", "Bb7", 8], ["blues-f#4", "F7", 8], ["blues-f#5", "C7", 4], ["blues-f#6", "Bb7", 4], ["blues-f#7", "F7", 4], ["blues-f#8", "C7", 4]]},
];

/** The thirteen zones of the old rotation, in its order. */
// prettier-ignore
const ZONES: [number, number][] = [
	[1, 5],
	[6, 10],
	[11, 15],
	[3, 7],
	[8, 12],
	[13, 17],
	[5, 9],
	[10, 14],
	[2, 6],
	[7, 11],
	[12, 16],
	[4, 8],
	[9, 13],
];

/** By grid, the zones the old rotation skipped (a chord without a shape there): none. */
// prettier-ignore
const ZONES_SKIPPED: [string, [number, number][]][] = [
	["iohefy-a", []],
	["blues-f", []],
];

/** [exercise, index, rank, passage params, shape before, shape heard, the old confusion (null: right)]. */
// prettier-ignore
const JUDGED: [Name, string, number, Each, string | null, string | null, string | null][] = [
	["link", "chord=C;strings=3,2,1", 0, {}, null, "C|maj|4:3,3:5,2:1@2-0-1", "other-set"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "C|maj|3:5,2:1,1:3@0-1-0", null],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "C|maj|3:1,2:3,1:5@5-5-3", "other-shape"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "C|min|6:5,5:1,4:b3@3-3-1", "other-quality"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "D|maj|6:3,5:5,4:1@2-0-0", "other-chord"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, null, "none"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "not a shape", "none"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "C|maj|4:3,3:5,2:1@2-0-1", "other-set"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "C|maj|3:5,2:1,1:3@0-1-0", null],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "C|maj|3:1,2:3,1:5@5-5-3", "other-shape"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "C|min|6:5,5:1,4:b3@3-3-1", "other-quality"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "other-chord"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "none"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "none"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "C|maj|4:3,3:5,2:1@2-0-1", "other-set"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "C|maj|3:5,2:1,1:3@0-1-0", "other-shape"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "C|maj|3:1,2:3,1:5@5-5-3", null],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "C|min|6:5,5:1,4:b3@3-3-1", "other-quality"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "D|maj|6:3,5:5,4:1@2-0-0", "other-chord"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", null, "none"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "D|min|3:5,2:1,1:b3@2-3-1", null],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, null, "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:5,2:1,1:b3@2-3-1", "not-higher"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:1,2:b3,1:5@7-6-5", null],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, "D|min|3:5,2:1,1:b3@2-3-1", null],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, null, "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:5,2:1,1:b3@2-3-1", null],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:1,2:b3,1:5@7-6-5", "not-lower"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", "other-set"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|3:3,2:5,1:1@4-3-3", null],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "other-quality"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "other-chord"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", null, "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:1,2:b3,1:5@7-6-5", "G|maj|3:3,2:5,1:1@4-3-3", "not-higher"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", "other-set"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|3:3,2:5,1:1@4-3-3", null],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "other-quality"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "other-chord"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", null, "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "none"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:1,2:b3,1:5@7-6-5", "G|maj|3:5,2:1,1:3@7-8-7", "not-lower"],
	["climb", "grid=iohefy-a;strings=3,2,1", 4, {"direction": "up"}, "G|maj|3:3,2:5,1:1@16-15-15", "C|maj|3:1,2:3,1:5@17-17-15", "not-lower"],
	["climb", "grid=iohefy-a;strings=3,2,1", 5, {"direction": "down"}, "C|maj|3:5,2:1,1:3@0-1-0", "F|maj|3:3,2:5,1:1@2-1-1", "not-higher"],
	["climb", "grid=iohefy-a;strings=3,2,1", 7, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@15-14-14", "D#|min|3:5,2:1,1:b3@15-16-14", "not-lower"],
	["climb", "grid=iohefy-a;strings=3,2,1", 7, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D#|min|3:5,2:1,1:b3@3-4-2", "not-higher"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|min|3:5,2:1,1:b3@2-3-1", null],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|min|5:1,4:b3,3:5@5-3-2", "other-set"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|min|3:1,2:b3,1:5@7-6-5", "out-of-zone"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|maj|5:1,4:3,3:5@5-4-2", "other-quality"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "E|min|6:b3,5:5,4:1@3-2-2", "other-chord"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, null, "none"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "not a shape", "none"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:5,2:1,1:b3@2-3-1", null],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|5:1,4:b3,3:5@5-3-2", "other-set"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:1,2:b3,1:5@7-6-5", "out-of-zone"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|5:1,4:3,3:5@5-4-2", "other-quality"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|6:b3,5:5,4:1@3-2-2", "other-chord"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "none"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "none"],
	["zone", "grid=iohefy-a", 0, {"zone": [2, 6]}, null, "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["zone", "grid=iohefy-a", 0, {"zone": [2, 6]}, null, "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["zone", "grid=iohefy-a", 0, {"zone": [2, 6]}, null, "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["zone", "grid=iohefy-a", 0, {"zone": [2, 6]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["zone", "grid=iohefy-a", 0, {"zone": [2, 6]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["zone", "grid=iohefy-a", 0, {"zone": [2, 6]}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, null, "G|maj|4:5,3:1,2:3@0-0-0", null],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", null],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|6:1,5:3,4:5@3-2-0", "other-set"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:1,3:3,2:5@5-4-3", null],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|5:5,4:1,3:3@5-5-4", "other-set"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:3,3:5,2:1@9-7-8", "out-of-zone"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "other-quality"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|5:5,4:1,3:b3@5-5-3", "other-quality"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "other-chord"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|3:1,2:3,1:5@2-2-0", "other-chord"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", null, "none"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "none"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "G|maj|4:5,3:1,2:3@0-0-0", null],
	["zone", "grid=iohefy-a", 1, {"zone": [2, 6]}, null, "G|maj|4:5,3:1,2:3@0-0-0", "out-of-zone"],
	["zone", "grid=iohefy-a", 1, {"zone": [2, 6]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", "out-of-zone"],
	["zone", "grid=iohefy-a", 1, {"zone": [2, 6]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|6:1,5:3,4:5@3-2-0", "other-set"],
	["zone", "grid=iohefy-a", 1, {"zone": [2, 6]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "other-quality"],
	["zone", "grid=iohefy-a", 1, {"zone": [2, 6]}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|3:1,2:3,1:5@2-2-0", "other-chord"],
	["zone", "grid=iohefy-a", 1, {"zone": [2, 6]}, "F#|maj|3:3,2:5,1:1@3-2-2", "G|maj|4:5,3:1,2:3@0-0-0", "out-of-zone"],
	["jam", "grid=iohefy-a", 0, {}, null, "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["jam", "grid=iohefy-a", 0, {}, null, "D|min|3:5,2:1,1:b3@2-3-1", null],
	["jam", "grid=iohefy-a", 0, {}, null, "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["jam", "grid=iohefy-a", 0, {}, null, "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["jam", "grid=iohefy-a", 0, {}, null, null, "none"],
	["jam", "grid=iohefy-a", 0, {}, null, "not a shape", "none"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "other-set"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|3:5,2:1,1:b3@2-3-1", null],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "other-quality"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "other-chord"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "none"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "none"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", null],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|6:1,5:3,4:5@3-2-0", "other-set"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "other-quality"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "other-chord"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", null, "none"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "none"],
];

/** [climb, index, rank, passage params, shape before, the direction the old rule played]. */
// prettier-ignore
const TURNS: [Name, string, number, Each, string | null, 'up' | 'down'][] = [
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "up"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "up"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@15-14-14", "down"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|4:1,3:3,2:5@16-15-14", "down"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, null, "down"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "down"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|3:5,2:1,1:b3@2-3-1", "up"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "down"}, "D|min|4:b3,3:5,2:1@3-2-3", "up"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "up"}, null, "up"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "up"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@15-14-14", "down"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "up"}, "F#|maj|4:1,3:3,2:5@16-15-14", "down"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "down"}, null, "down"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "down"}, "F#|maj|3:5,2:1,1:3@6-7-6", "down"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "up"],
	["climb", "grid=iohefy-a;strings=4,3,2", 0, {"direction": "down"}, "F#|maj|4:1,3:3,2:5@4-3-2", "up"],
	["climb", "grid=blues-f;strings=3,2,1", 0, {"direction": "up"}, null, "up"],
	["climb", "grid=blues-f;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "up"],
	["climb", "grid=blues-f;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@15-14-14", "down"],
	["climb", "grid=blues-f;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|4:1,3:3,2:5@16-15-14", "down"],
	["climb", "grid=blues-f;strings=3,2,1", 0, {"direction": "down"}, null, "down"],
	["climb", "grid=blues-f;strings=3,2,1", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "down"],
	["climb", "grid=blues-f;strings=3,2,1", 1, {"direction": "down"}, "F|maj|3:3,2:5,1:1@2-1-1", "up"],
	["climb", "grid=blues-f;strings=3,2,1", 1, {"direction": "down"}, "F|maj|4:1,3:3,2:5@3-2-1", "up"],
	["climb", "grid=blues-f;strings=4,3,2", 0, {"direction": "up"}, null, "up"],
	["climb", "grid=blues-f;strings=4,3,2", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "up"],
	["climb", "grid=blues-f;strings=4,3,2", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@15-14-14", "down"],
	["climb", "grid=blues-f;strings=4,3,2", 0, {"direction": "up"}, "F#|maj|4:1,3:3,2:5@16-15-14", "down"],
	["climb", "grid=blues-f;strings=4,3,2", 0, {"direction": "down"}, null, "down"],
	["climb", "grid=blues-f;strings=4,3,2", 0, {"direction": "down"}, "F#|maj|3:3,2:5,1:1@3-2-2", "down"],
	["climb", "grid=blues-f;strings=4,3,2", 1, {"direction": "down"}, "F|maj|3:3,2:5,1:1@2-1-1", "up"],
	["climb", "grid=blues-f;strings=4,3,2", 1, {"direction": "down"}, "F|maj|4:1,3:3,2:5@3-2-1", "up"],
];

/** [exercise, index, rank, passage params, shape before, expected, candidates as [kind, id]]. */
// prettier-ignore
const SENSOR: [Name, string, number, Each, string | null, string[], [string, string][]][] = [
	["link", "chord=C;strings=3,2,1", 0, {}, null, ["C|maj|3:5,2:1,1:3@0-1-0"], [["expected", "C|maj|3:5,2:1,1:3@0-1-0"]]],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", ["C|maj|3:5,2:1,1:3@0-1-0"], [["expected", "C|maj|3:5,2:1,1:3@0-1-0"]]],
	["link", "chord=C;strings=3,2,1", 1, {}, null, ["C|maj|3:1,2:3,1:5@5-5-3"], [["expected", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-quality", "C|min|3:1,2:b3,1:5@5-4-3"]]],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", ["C|maj|3:1,2:3,1:5@5-5-3"], [["expected", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-quality", "C|min|3:1,2:b3,1:5@5-4-3"]]],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:1,2:3,1:5@5-5-3", [], [["other-shape", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-shape", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-shape", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-shape", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-quality", "C|min|3:1,2:b3,1:5@5-4-3"], ["other-quality", "C|min|3:b3,2:5,1:1@8-8-8"], ["other-quality", "C|min|3:5,2:1,1:b3@12-13-11"], ["other-quality", "C|min|3:1,2:b3,1:5@17-16-15"]]],
	["link", "chord=C;strings=3,2,1", 1, {}, "F#|maj|3:3,2:5,1:1@3-2-2", ["C|maj|3:1,2:3,1:5@5-5-3"], [["expected", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-quality", "C|min|3:1,2:b3,1:5@5-4-3"]]],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, ["D|min|3:5,2:1,1:b3@2-3-1", "D|min|3:1,2:b3,1:5@7-6-5", "D|min|3:b3,2:5,1:1@10-10-10", "D|min|3:5,2:1,1:b3@14-15-13"], [["expected", "D|min|3:5,2:1,1:b3@2-3-1"], ["expected", "D|min|3:1,2:b3,1:5@7-6-5"], ["expected", "D|min|3:b3,2:5,1:1@10-10-10"], ["expected", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-quality", "D|maj|3:5,2:1,1:3@2-3-2"], ["other-quality", "D|maj|3:1,2:3,1:5@7-7-5"], ["other-quality", "D|maj|3:3,2:5,1:1@11-10-10"], ["other-quality", "D|maj|3:5,2:1,1:3@14-15-14"], ["other-chord", "G|maj|3:3,2:5,1:1@4-3-3"], ["other-chord", "G|maj|3:5,2:1,1:3@7-8-7"], ["other-chord", "G|maj|3:1,2:3,1:5@12-12-10"], ["other-chord", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", ["D|min|3:1,2:b3,1:5@7-6-5", "D|min|3:b3,2:5,1:1@10-10-10", "D|min|3:5,2:1,1:b3@14-15-13"], [["expected", "D|min|3:1,2:b3,1:5@7-6-5"], ["expected", "D|min|3:b3,2:5,1:1@10-10-10"], ["expected", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-quality", "D|maj|3:1,2:3,1:5@7-7-5"], ["other-quality", "D|maj|3:3,2:5,1:1@11-10-10"], ["other-quality", "D|maj|3:5,2:1,1:3@14-15-14"], ["other-chord", "G|maj|3:3,2:5,1:1@4-3-3"], ["other-chord", "G|maj|3:5,2:1,1:3@7-8-7"], ["other-chord", "G|maj|3:1,2:3,1:5@12-12-10"], ["other-chord", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, null, ["G|maj|3:3,2:5,1:1@4-3-3", "G|maj|3:5,2:1,1:3@7-8-7", "G|maj|3:1,2:3,1:5@12-12-10", "G|maj|3:3,2:5,1:1@16-15-15"], [["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|3:5,2:1,1:3@7-8-7"], ["expected", "G|maj|3:1,2:3,1:5@12-12-10"], ["expected", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|3:5,2:1,1:b3@7-8-6"], ["other-quality", "G|min|3:1,2:b3,1:5@12-11-10"], ["other-quality", "G|min|3:b3,2:5,1:1@15-15-15"], ["other-chord", "D|min|3:5,2:1,1:b3@2-3-1"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|3:b3,2:5,1:1@10-10-10"], ["other-chord", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", ["G|maj|3:3,2:5,1:1@4-3-3", "G|maj|3:5,2:1,1:3@7-8-7", "G|maj|3:1,2:3,1:5@12-12-10", "G|maj|3:3,2:5,1:1@16-15-15"], [["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|3:5,2:1,1:3@7-8-7"], ["expected", "G|maj|3:1,2:3,1:5@12-12-10"], ["expected", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|3:5,2:1,1:b3@7-8-6"], ["other-quality", "G|min|3:1,2:b3,1:5@12-11-10"], ["other-quality", "G|min|3:b3,2:5,1:1@15-15-15"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|3:b3,2:5,1:1@10-10-10"], ["other-chord", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", ["G|maj|3:3,2:5,1:1@4-3-3", "G|maj|3:5,2:1,1:3@7-8-7", "G|maj|3:1,2:3,1:5@12-12-10", "G|maj|3:3,2:5,1:1@16-15-15"], [["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|3:5,2:1,1:3@7-8-7"], ["expected", "G|maj|3:1,2:3,1:5@12-12-10"], ["expected", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|3:5,2:1,1:b3@7-8-6"], ["other-quality", "G|min|3:1,2:b3,1:5@12-11-10"], ["other-quality", "G|min|3:b3,2:5,1:1@15-15-15"], ["other-chord", "D|min|3:5,2:1,1:b3@2-3-1"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|3:b3,2:5,1:1@10-10-10"], ["other-chord", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, ["D|min|3:5,2:1,1:b3@2-3-1", "D|min|4:b3,3:5,2:1@3-2-3"], [["expected", "D|min|3:5,2:1,1:b3@2-3-1"], ["expected", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-quality", "D|maj|3:5,2:1,1:3@2-3-2"], ["other-quality", "D|maj|4:3,3:5,2:1@4-2-3"], ["other-chord", "G|maj|4:5,3:1,2:3@0-0-0"], ["other-chord", "G|maj|3:3,2:5,1:1@4-3-3"], ["other-chord", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"]]],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", ["D|min|3:5,2:1,1:b3@2-3-1", "D|min|4:b3,3:5,2:1@3-2-3"], [["expected", "D|min|3:5,2:1,1:b3@2-3-1"], ["expected", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-quality", "D|maj|3:5,2:1,1:3@2-3-2"], ["other-quality", "D|maj|4:3,3:5,2:1@4-2-3"], ["other-chord", "G|maj|4:5,3:1,2:3@0-0-0"], ["other-chord", "G|maj|3:3,2:5,1:1@4-3-3"], ["other-chord", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"]]],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, null, ["G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3", "G|maj|4:1,3:3,2:5@5-4-3"], [["expected", "G|maj|4:5,3:1,2:3@0-0-0"], ["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|4:1,3:b3,2:5@5-3-3"], ["other-chord", "D|min|3:5,2:1,1:b3@2-3-1"], ["other-chord", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|4:5,3:1,2:b3@7-7-6"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"]]],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", ["G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3", "G|maj|4:1,3:3,2:5@5-4-3"], [["expected", "G|maj|4:5,3:1,2:3@0-0-0"], ["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|4:1,3:b3,2:5@5-3-3"], ["other-chord", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"]]],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", ["G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3", "G|maj|4:1,3:3,2:5@5-4-3"], [["expected", "G|maj|4:5,3:1,2:3@0-0-0"], ["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|4:1,3:b3,2:5@5-3-3"], ["other-chord", "D|min|3:5,2:1,1:b3@2-3-1"], ["other-chord", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|4:5,3:1,2:b3@7-7-6"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"]]],
	["jam", "grid=iohefy-a", 0, {}, null, ["D|min|3:5,2:1,1:b3@2-3-1", "D|min|4:b3,3:5,2:1@3-2-3", "D|min|3:1,2:b3,1:5@7-6-5", "D|min|4:5,3:1,2:b3@7-7-6", "D|min|3:b3,2:5,1:1@10-10-10", "D|min|4:1,3:b3,2:5@12-10-10", "D|min|3:5,2:1,1:b3@14-15-13", "D|min|4:b3,3:5,2:1@15-14-15"], [["expected", "D|min|3:5,2:1,1:b3@2-3-1"], ["expected", "D|min|4:b3,3:5,2:1@3-2-3"], ["expected", "D|min|3:1,2:b3,1:5@7-6-5"], ["expected", "D|min|4:5,3:1,2:b3@7-7-6"], ["expected", "D|min|3:b3,2:5,1:1@10-10-10"], ["expected", "D|min|4:1,3:b3,2:5@12-10-10"], ["expected", "D|min|3:5,2:1,1:b3@14-15-13"], ["expected", "D|min|4:b3,3:5,2:1@15-14-15"], ["other-quality", "D|maj|3:5,2:1,1:3@2-3-2"], ["other-quality", "D|maj|4:3,3:5,2:1@4-2-3"], ["other-quality", "D|maj|3:1,2:3,1:5@7-7-5"], ["other-quality", "D|maj|4:5,3:1,2:3@7-7-7"], ["other-quality", "D|maj|3:3,2:5,1:1@11-10-10"], ["other-quality", "D|maj|4:1,3:3,2:5@12-11-10"], ["other-quality", "D|maj|3:5,2:1,1:3@14-15-14"], ["other-quality", "D|maj|4:3,3:5,2:1@16-14-15"], ["other-chord", "G|maj|4:5,3:1,2:3@0-0-0"], ["other-chord", "G|maj|3:3,2:5,1:1@4-3-3"], ["other-chord", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-chord", "G|maj|3:5,2:1,1:3@7-8-7"], ["other-chord", "G|maj|4:3,3:5,2:1@9-7-8"], ["other-chord", "G|maj|3:1,2:3,1:5@12-12-10"], ["other-chord", "G|maj|4:5,3:1,2:3@12-12-12"], ["other-chord", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-chord", "G|maj|4:1,3:3,2:5@17-16-15"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|4:1,3:3,2:5@10-9-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|4:3,3:5,2:1@14-12-13"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "C|maj|4:5,3:1,2:3@17-17-17"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|4:5,3:1,2:3@10-10-10"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "F|maj|4:1,3:3,2:5@15-14-13"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|4:5,3:1,2:b3@9-9-8"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|4:1,3:b3,2:5@14-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "E|min|4:b3,3:5,2:1@17-16-17"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|4:5,3:1,2:b3@8-8-7"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|4:1,3:b3,2:5@13-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "D#|min|4:b3,3:5,2:1@16-15-16"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|4:3,3:5,2:1@10-8-9"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|4:5,3:1,2:3@13-13-13"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", ["D|min|3:5,2:1,1:b3@2-3-1", "D|min|4:b3,3:5,2:1@3-2-3", "D|min|3:1,2:b3,1:5@7-6-5", "D|min|4:5,3:1,2:b3@7-7-6", "D|min|3:b3,2:5,1:1@10-10-10", "D|min|4:1,3:b3,2:5@12-10-10", "D|min|3:5,2:1,1:b3@14-15-13", "D|min|4:b3,3:5,2:1@15-14-15"], [["expected", "D|min|3:5,2:1,1:b3@2-3-1"], ["expected", "D|min|4:b3,3:5,2:1@3-2-3"], ["expected", "D|min|3:1,2:b3,1:5@7-6-5"], ["expected", "D|min|4:5,3:1,2:b3@7-7-6"], ["expected", "D|min|3:b3,2:5,1:1@10-10-10"], ["expected", "D|min|4:1,3:b3,2:5@12-10-10"], ["expected", "D|min|3:5,2:1,1:b3@14-15-13"], ["expected", "D|min|4:b3,3:5,2:1@15-14-15"], ["other-quality", "D|maj|3:5,2:1,1:3@2-3-2"], ["other-quality", "D|maj|4:3,3:5,2:1@4-2-3"], ["other-quality", "D|maj|3:1,2:3,1:5@7-7-5"], ["other-quality", "D|maj|4:5,3:1,2:3@7-7-7"], ["other-quality", "D|maj|3:3,2:5,1:1@11-10-10"], ["other-quality", "D|maj|4:1,3:3,2:5@12-11-10"], ["other-quality", "D|maj|3:5,2:1,1:3@14-15-14"], ["other-quality", "D|maj|4:3,3:5,2:1@16-14-15"], ["other-chord", "G|maj|4:5,3:1,2:3@0-0-0"], ["other-chord", "G|maj|3:3,2:5,1:1@4-3-3"], ["other-chord", "G|maj|4:1,3:3,2:5@5-4-3"], ["other-chord", "G|maj|3:5,2:1,1:3@7-8-7"], ["other-chord", "G|maj|4:3,3:5,2:1@9-7-8"], ["other-chord", "G|maj|3:1,2:3,1:5@12-12-10"], ["other-chord", "G|maj|4:5,3:1,2:3@12-12-12"], ["other-chord", "G|maj|3:3,2:5,1:1@16-15-15"], ["other-chord", "G|maj|4:1,3:3,2:5@17-16-15"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|4:1,3:3,2:5@10-9-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|4:3,3:5,2:1@14-12-13"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "C|maj|4:5,3:1,2:3@17-17-17"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|4:5,3:1,2:3@10-10-10"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "F|maj|4:1,3:3,2:5@15-14-13"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|4:5,3:1,2:b3@9-9-8"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|4:1,3:b3,2:5@14-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "E|min|4:b3,3:5,2:1@17-16-17"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|4:5,3:1,2:b3@8-8-7"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|4:1,3:b3,2:5@13-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "D#|min|4:b3,3:5,2:1@16-15-16"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|4:3,3:5,2:1@10-8-9"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|4:5,3:1,2:3@13-13-13"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["jam", "grid=iohefy-a", 1, {}, null, ["G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3", "G|maj|4:1,3:3,2:5@5-4-3", "G|maj|3:5,2:1,1:3@7-8-7", "G|maj|4:3,3:5,2:1@9-7-8", "G|maj|3:1,2:3,1:5@12-12-10", "G|maj|4:5,3:1,2:3@12-12-12", "G|maj|3:3,2:5,1:1@16-15-15", "G|maj|4:1,3:3,2:5@17-16-15"], [["expected", "G|maj|4:5,3:1,2:3@0-0-0"], ["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|4:1,3:3,2:5@5-4-3"], ["expected", "G|maj|3:5,2:1,1:3@7-8-7"], ["expected", "G|maj|4:3,3:5,2:1@9-7-8"], ["expected", "G|maj|3:1,2:3,1:5@12-12-10"], ["expected", "G|maj|4:5,3:1,2:3@12-12-12"], ["expected", "G|maj|3:3,2:5,1:1@16-15-15"], ["expected", "G|maj|4:1,3:3,2:5@17-16-15"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|4:1,3:b3,2:5@5-3-3"], ["other-quality", "G|min|3:5,2:1,1:b3@7-8-6"], ["other-quality", "G|min|4:b3,3:5,2:1@8-7-8"], ["other-quality", "G|min|3:1,2:b3,1:5@12-11-10"], ["other-quality", "G|min|4:5,3:1,2:b3@12-12-11"], ["other-quality", "G|min|3:b3,2:5,1:1@15-15-15"], ["other-quality", "G|min|4:1,3:b3,2:5@17-15-15"], ["other-chord", "D|min|3:5,2:1,1:b3@2-3-1"], ["other-chord", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|4:5,3:1,2:b3@7-7-6"], ["other-chord", "D|min|3:b3,2:5,1:1@10-10-10"], ["other-chord", "D|min|4:1,3:b3,2:5@12-10-10"], ["other-chord", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-chord", "D|min|4:b3,3:5,2:1@15-14-15"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|4:1,3:3,2:5@10-9-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|4:3,3:5,2:1@14-12-13"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "C|maj|4:5,3:1,2:3@17-17-17"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|4:5,3:1,2:3@10-10-10"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "F|maj|4:1,3:3,2:5@15-14-13"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|4:5,3:1,2:b3@9-9-8"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|4:1,3:b3,2:5@14-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "E|min|4:b3,3:5,2:1@17-16-17"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|4:5,3:1,2:b3@8-8-7"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|4:1,3:b3,2:5@13-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "D#|min|4:b3,3:5,2:1@16-15-16"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|4:3,3:5,2:1@10-8-9"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|4:5,3:1,2:3@13-13-13"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", ["G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3", "G|maj|4:1,3:3,2:5@5-4-3", "G|maj|3:5,2:1,1:3@7-8-7", "G|maj|4:3,3:5,2:1@9-7-8", "G|maj|3:1,2:3,1:5@12-12-10", "G|maj|4:5,3:1,2:3@12-12-12", "G|maj|3:3,2:5,1:1@16-15-15", "G|maj|4:1,3:3,2:5@17-16-15"], [["expected", "G|maj|4:5,3:1,2:3@0-0-0"], ["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|4:1,3:3,2:5@5-4-3"], ["expected", "G|maj|3:5,2:1,1:3@7-8-7"], ["expected", "G|maj|4:3,3:5,2:1@9-7-8"], ["expected", "G|maj|3:1,2:3,1:5@12-12-10"], ["expected", "G|maj|4:5,3:1,2:3@12-12-12"], ["expected", "G|maj|3:3,2:5,1:1@16-15-15"], ["expected", "G|maj|4:1,3:3,2:5@17-16-15"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|4:1,3:b3,2:5@5-3-3"], ["other-quality", "G|min|3:5,2:1,1:b3@7-8-6"], ["other-quality", "G|min|4:b3,3:5,2:1@8-7-8"], ["other-quality", "G|min|3:1,2:b3,1:5@12-11-10"], ["other-quality", "G|min|4:5,3:1,2:b3@12-12-11"], ["other-quality", "G|min|3:b3,2:5,1:1@15-15-15"], ["other-quality", "G|min|4:1,3:b3,2:5@17-15-15"], ["other-chord", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|3:b3,2:5,1:1@10-10-10"], ["other-chord", "D|min|4:1,3:b3,2:5@12-10-10"], ["other-chord", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-chord", "D|min|4:b3,3:5,2:1@15-14-15"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|4:1,3:3,2:5@10-9-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|4:3,3:5,2:1@14-12-13"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "C|maj|4:5,3:1,2:3@17-17-17"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|4:5,3:1,2:3@10-10-10"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "F|maj|4:1,3:3,2:5@15-14-13"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|4:5,3:1,2:b3@9-9-8"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|4:1,3:b3,2:5@14-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "E|min|4:b3,3:5,2:1@17-16-17"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|4:5,3:1,2:b3@8-8-7"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|4:1,3:b3,2:5@13-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "D#|min|4:b3,3:5,2:1@16-15-16"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|4:3,3:5,2:1@10-8-9"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|4:5,3:1,2:3@13-13-13"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
	["jam", "grid=iohefy-a", 1, {}, "F#|maj|3:3,2:5,1:1@3-2-2", ["G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3", "G|maj|4:1,3:3,2:5@5-4-3", "G|maj|3:5,2:1,1:3@7-8-7", "G|maj|4:3,3:5,2:1@9-7-8", "G|maj|3:1,2:3,1:5@12-12-10", "G|maj|4:5,3:1,2:3@12-12-12", "G|maj|3:3,2:5,1:1@16-15-15", "G|maj|4:1,3:3,2:5@17-16-15"], [["expected", "G|maj|4:5,3:1,2:3@0-0-0"], ["expected", "G|maj|3:3,2:5,1:1@4-3-3"], ["expected", "G|maj|4:1,3:3,2:5@5-4-3"], ["expected", "G|maj|3:5,2:1,1:3@7-8-7"], ["expected", "G|maj|4:3,3:5,2:1@9-7-8"], ["expected", "G|maj|3:1,2:3,1:5@12-12-10"], ["expected", "G|maj|4:5,3:1,2:3@12-12-12"], ["expected", "G|maj|3:3,2:5,1:1@16-15-15"], ["expected", "G|maj|4:1,3:3,2:5@17-16-15"], ["other-quality", "G|min|3:b3,2:5,1:1@3-3-3"], ["other-quality", "G|min|4:1,3:b3,2:5@5-3-3"], ["other-quality", "G|min|3:5,2:1,1:b3@7-8-6"], ["other-quality", "G|min|4:b3,3:5,2:1@8-7-8"], ["other-quality", "G|min|3:1,2:b3,1:5@12-11-10"], ["other-quality", "G|min|4:5,3:1,2:b3@12-12-11"], ["other-quality", "G|min|3:b3,2:5,1:1@15-15-15"], ["other-quality", "G|min|4:1,3:b3,2:5@17-15-15"], ["other-chord", "D|min|3:5,2:1,1:b3@2-3-1"], ["other-chord", "D|min|4:b3,3:5,2:1@3-2-3"], ["other-chord", "D|min|3:1,2:b3,1:5@7-6-5"], ["other-chord", "D|min|4:5,3:1,2:b3@7-7-6"], ["other-chord", "D|min|3:b3,2:5,1:1@10-10-10"], ["other-chord", "D|min|4:1,3:b3,2:5@12-10-10"], ["other-chord", "D|min|3:5,2:1,1:b3@14-15-13"], ["other-chord", "D|min|4:b3,3:5,2:1@15-14-15"], ["other-chord", "C|maj|3:5,2:1,1:3@0-1-0"], ["other-chord", "C|maj|4:3,3:5,2:1@2-0-1"], ["other-chord", "C|maj|3:1,2:3,1:5@5-5-3"], ["other-chord", "C|maj|4:5,3:1,2:3@5-5-5"], ["other-chord", "C|maj|3:3,2:5,1:1@9-8-8"], ["other-chord", "C|maj|4:1,3:3,2:5@10-9-8"], ["other-chord", "C|maj|3:5,2:1,1:3@12-13-12"], ["other-chord", "C|maj|4:3,3:5,2:1@14-12-13"], ["other-chord", "C|maj|3:1,2:3,1:5@17-17-15"], ["other-chord", "C|maj|4:5,3:1,2:3@17-17-17"], ["other-chord", "F|maj|3:3,2:5,1:1@2-1-1"], ["other-chord", "F|maj|4:1,3:3,2:5@3-2-1"], ["other-chord", "F|maj|3:5,2:1,1:3@5-6-5"], ["other-chord", "F|maj|4:3,3:5,2:1@7-5-6"], ["other-chord", "F|maj|3:1,2:3,1:5@10-10-8"], ["other-chord", "F|maj|4:5,3:1,2:3@10-10-10"], ["other-chord", "F|maj|3:3,2:5,1:1@14-13-13"], ["other-chord", "F|maj|4:1,3:3,2:5@15-14-13"], ["other-chord", "E|min|3:b3,2:5,1:1@0-0-0"], ["other-chord", "E|min|4:1,3:b3,2:5@2-0-0"], ["other-chord", "E|min|3:5,2:1,1:b3@4-5-3"], ["other-chord", "E|min|4:b3,3:5,2:1@5-4-5"], ["other-chord", "E|min|3:1,2:b3,1:5@9-8-7"], ["other-chord", "E|min|4:5,3:1,2:b3@9-9-8"], ["other-chord", "E|min|3:b3,2:5,1:1@12-12-12"], ["other-chord", "E|min|4:1,3:b3,2:5@14-12-12"], ["other-chord", "E|min|3:5,2:1,1:b3@16-17-15"], ["other-chord", "E|min|4:b3,3:5,2:1@17-16-17"], ["other-chord", "D#|min|3:5,2:1,1:b3@3-4-2"], ["other-chord", "D#|min|4:b3,3:5,2:1@4-3-4"], ["other-chord", "D#|min|3:1,2:b3,1:5@8-7-6"], ["other-chord", "D#|min|4:5,3:1,2:b3@8-8-7"], ["other-chord", "D#|min|3:b3,2:5,1:1@11-11-11"], ["other-chord", "D#|min|4:1,3:b3,2:5@13-11-11"], ["other-chord", "D#|min|3:5,2:1,1:b3@15-16-14"], ["other-chord", "D#|min|4:b3,3:5,2:1@16-15-16"], ["other-chord", "G#|maj|4:5,3:1,2:3@1-1-1"], ["other-chord", "G#|maj|3:3,2:5,1:1@5-4-4"], ["other-chord", "G#|maj|4:1,3:3,2:5@6-5-4"], ["other-chord", "G#|maj|3:5,2:1,1:3@8-9-8"], ["other-chord", "G#|maj|4:3,3:5,2:1@10-8-9"], ["other-chord", "G#|maj|3:1,2:3,1:5@13-13-11"], ["other-chord", "G#|maj|4:5,3:1,2:3@13-13-13"], ["other-chord", "G#|maj|3:3,2:5,1:1@17-16-16"]]],
];

/** [exercise, index, rank, passage params, shape before, shape heard, the shape drawn as due]. */
// prettier-ignore
const EXPECTED: [Name, string, number, Each, string | null, string | null, string | null][] = [
	["link", "chord=C;strings=3,2,1", 0, {}, null, "C|maj|4:3,3:5,2:1@2-0-1", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "C|min|6:5,5:1,4:b3@3-3-1", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "D|maj|6:3,5:5,4:1@2-0-0", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, null, "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, null, "not a shape", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "C|maj|4:3,3:5,2:1@2-0-1", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "C|min|6:5,5:1,4:b3@3-3-1", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "C|maj|3:5,2:1,1:3@0-1-0"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "C|maj|4:3,3:5,2:1@2-0-1", "C|maj|3:1,2:3,1:5@5-5-3"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "C|min|6:5,5:1,4:b3@3-3-1", "C|maj|3:1,2:3,1:5@5-5-3"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "D|maj|6:3,5:5,4:1@2-0-0", "C|maj|3:1,2:3,1:5@5-5-3"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", null, "C|maj|3:1,2:3,1:5@5-5-3"],
	["link", "chord=C;strings=3,2,1", 1, {}, "C|maj|3:5,2:1,1:3@0-1-0", "not a shape", "C|maj|3:1,2:3,1:5@5-5-3"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "D|min|6:b3,5:5,4:1@1-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "D|maj|6:3,5:5,4:1@2-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "E|min|3:b3,2:5,1:1@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, null, "D|min|3:5,2:1,1:b3@2-3-1"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, null, "not a shape", "D|min|3:5,2:1,1:b3@2-3-1"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "D|min|3:1,2:b3,1:5@7-6-5"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "D|min|3:1,2:b3,1:5@7-6-5"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "D|min|3:1,2:b3,1:5@7-6-5"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "D|min|3:1,2:b3,1:5@7-6-5"],
	["climb", "grid=iohefy-a;strings=3,2,1", 0, {"direction": "up"}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "D|min|3:1,2:b3,1:5@7-6-5"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", "G|maj|3:3,2:5,1:1@4-3-3"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "G|maj|3:3,2:5,1:1@4-3-3"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "G|maj|3:3,2:5,1:1@4-3-3"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", null, "G|maj|3:3,2:5,1:1@4-3-3"],
	["climb", "grid=iohefy-a;strings=3,2,1", 1, {"direction": "up"}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "G|maj|3:3,2:5,1:1@4-3-3"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|min|6:b3,5:5,4:1@1-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "D|maj|6:3,5:5,4:1@2-0-0", "D|min|4:b3,3:5,2:1@3-2-3"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "E|min|3:b3,2:5,1:1@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, null, "D|min|3:5,2:1,1:b3@2-3-1"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, null, "not a shape", "D|min|3:5,2:1,1:b3@2-3-1"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "D|min|4:b3,3:5,2:1@3-2-3"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "D|min|4:b3,3:5,2:1@3-2-3"],
	["zone", "grid=iohefy-a", 0, {"zone": [1, 5]}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "D|min|4:b3,3:5,2:1@3-2-3"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|6:1,5:3,4:5@3-2-0", "G|maj|3:3,2:5,1:1@4-3-3"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "G|maj|4:5,3:1,2:3@0-0-0"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "G|maj|3:3,2:5,1:1@4-3-3"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", null, "G|maj|4:5,3:1,2:3@0-0-0"],
	["zone", "grid=iohefy-a", 1, {"zone": [1, 5]}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "G|maj|4:5,3:1,2:3@0-0-0"],
	["jam", "grid=iohefy-a", 0, {}, null, "D|min|6:b3,5:5,4:1@1-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["jam", "grid=iohefy-a", 0, {}, null, "D|maj|6:3,5:5,4:1@2-0-0", "D|min|4:b3,3:5,2:1@3-2-3"],
	["jam", "grid=iohefy-a", 0, {}, null, "E|min|3:b3,2:5,1:1@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["jam", "grid=iohefy-a", 0, {}, null, null, "D|min|3:5,2:1,1:b3@2-3-1"],
	["jam", "grid=iohefy-a", 0, {}, null, "not a shape", "D|min|3:5,2:1,1:b3@2-3-1"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|min|6:b3,5:5,4:1@1-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "D|maj|6:3,5:5,4:1@2-0-0", "D|min|4:b3,3:5,2:1@3-2-3"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "E|min|3:b3,2:5,1:1@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", null, "D|min|4:b3,3:5,2:1@3-2-3"],
	["jam", "grid=iohefy-a", 0, {}, "F#|maj|3:3,2:5,1:1@3-2-2", "not a shape", "D|min|4:b3,3:5,2:1@3-2-3"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|6:1,5:3,4:5@3-2-0", "G|maj|3:3,2:5,1:1@4-3-3"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "G|min|6:1,5:b3,4:5@3-1-0", "G|maj|4:5,3:1,2:3@0-0-0"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "A|maj|6:1,5:3,4:5@5-4-2", "G|maj|3:3,2:5,1:1@4-3-3"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", null, "G|maj|4:5,3:1,2:3@0-0-0"],
	["jam", "grid=iohefy-a", 1, {}, "D|min|3:5,2:1,1:b3@2-3-1", "not a shape", "G|maj|4:5,3:1,2:3@0-0-0"],
];

/** Sets of acquired cards. */
// prettier-ignore
const CARD_SETS: Record<string, string[]> = {
	"none": [],
	"every": ["chord-anchor:C|maj|3:5,2:1,1:3", "chord-anchor:C|maj|3:1,2:3,1:5", "chord-anchor:C|maj|3:3,2:5,1:1", "chord-anchor:C|min|3:1,2:b3,1:5", "chord-anchor:C|min|3:b3,2:5,1:1", "chord-anchor:C|min|3:5,2:1,1:b3", "chord-anchor:D|maj|3:5,2:1,1:3", "chord-anchor:D|maj|3:1,2:3,1:5", "chord-anchor:D|maj|3:3,2:5,1:1", "chord-anchor:D|min|3:5,2:1,1:b3", "chord-anchor:D|min|3:1,2:b3,1:5", "chord-anchor:D|min|3:b3,2:5,1:1", "chord-anchor:E|maj|3:3,2:5,1:1", "chord-anchor:E|maj|3:5,2:1,1:3", "chord-anchor:E|maj|3:1,2:3,1:5", "chord-anchor:E|min|3:b3,2:5,1:1", "chord-anchor:E|min|3:5,2:1,1:b3", "chord-anchor:E|min|3:1,2:b3,1:5", "chord-anchor:F|maj|3:3,2:5,1:1", "chord-anchor:F|maj|3:5,2:1,1:3", "chord-anchor:F|maj|3:1,2:3,1:5", "chord-anchor:F|min|3:b3,2:5,1:1", "chord-anchor:F|min|3:5,2:1,1:b3", "chord-anchor:F|min|3:1,2:b3,1:5", "chord-anchor:G|maj|3:3,2:5,1:1", "chord-anchor:G|maj|3:5,2:1,1:3", "chord-anchor:G|maj|3:1,2:3,1:5", "chord-anchor:G|min|3:b3,2:5,1:1", "chord-anchor:G|min|3:5,2:1,1:b3", "chord-anchor:G|min|3:1,2:b3,1:5", "chord-anchor:A|maj|3:1,2:3,1:5", "chord-anchor:A|maj|3:3,2:5,1:1", "chord-anchor:A|maj|3:5,2:1,1:3", "chord-anchor:A|min|3:1,2:b3,1:5", "chord-anchor:A|min|3:b3,2:5,1:1", "chord-anchor:A|min|3:5,2:1,1:b3", "chord-anchor:B|maj|3:1,2:3,1:5", "chord-anchor:B|maj|3:3,2:5,1:1", "chord-anchor:B|maj|3:5,2:1,1:3", "chord-anchor:B|min|3:1,2:b3,1:5", "chord-anchor:B|min|3:b3,2:5,1:1", "chord-anchor:B|min|3:5,2:1,1:b3", "chord-anchor:C#|maj|3:5,2:1,1:3", "chord-anchor:C#|maj|3:1,2:3,1:5", "chord-anchor:C#|maj|3:3,2:5,1:1", "chord-anchor:C#|min|3:5,2:1,1:b3", "chord-anchor:C#|min|3:1,2:b3,1:5", "chord-anchor:C#|min|3:b3,2:5,1:1", "chord-anchor:D#|maj|3:5,2:1,1:3", "chord-anchor:D#|maj|3:1,2:3,1:5", "chord-anchor:D#|maj|3:3,2:5,1:1", "chord-anchor:D#|min|3:5,2:1,1:b3", "chord-anchor:D#|min|3:1,2:b3,1:5", "chord-anchor:D#|min|3:b3,2:5,1:1", "chord-anchor:F#|maj|3:3,2:5,1:1", "chord-anchor:F#|maj|3:5,2:1,1:3", "chord-anchor:F#|maj|3:1,2:3,1:5", "chord-anchor:F#|min|3:b3,2:5,1:1", "chord-anchor:F#|min|3:5,2:1,1:b3", "chord-anchor:F#|min|3:1,2:b3,1:5", "chord-anchor:G#|maj|3:3,2:5,1:1", "chord-anchor:G#|maj|3:5,2:1,1:3", "chord-anchor:G#|maj|3:1,2:3,1:5", "chord-anchor:G#|min|3:b3,2:5,1:1", "chord-anchor:G#|min|3:5,2:1,1:b3", "chord-anchor:G#|min|3:1,2:b3,1:5", "chord-anchor:A#|maj|3:1,2:3,1:5", "chord-anchor:A#|maj|3:3,2:5,1:1", "chord-anchor:A#|maj|3:5,2:1,1:3", "chord-anchor:A#|min|3:1,2:b3,1:5", "chord-anchor:A#|min|3:b3,2:5,1:1", "chord-anchor:A#|min|3:5,2:1,1:b3", "chord-anchor:C|maj|4:3,3:5,2:1", "chord-anchor:C|maj|4:5,3:1,2:3", "chord-anchor:C|maj|4:1,3:3,2:5", "chord-anchor:C|min|4:b3,3:5,2:1", "chord-anchor:C|min|4:5,3:1,2:b3", "chord-anchor:C|min|4:1,3:b3,2:5", "chord-anchor:D|maj|4:3,3:5,2:1", "chord-anchor:D|maj|4:5,3:1,2:3", "chord-anchor:D|maj|4:1,3:3,2:5", "chord-anchor:D|min|4:b3,3:5,2:1", "chord-anchor:D|min|4:5,3:1,2:b3", "chord-anchor:D|min|4:1,3:b3,2:5", "chord-anchor:E|maj|4:1,3:3,2:5", "chord-anchor:E|maj|4:3,3:5,2:1", "chord-anchor:E|maj|4:5,3:1,2:3", "chord-anchor:E|min|4:1,3:b3,2:5", "chord-anchor:E|min|4:b3,3:5,2:1", "chord-anchor:E|min|4:5,3:1,2:b3", "chord-anchor:F|maj|4:1,3:3,2:5", "chord-anchor:F|maj|4:3,3:5,2:1", "chord-anchor:F|maj|4:5,3:1,2:3", "chord-anchor:F|min|4:1,3:b3,2:5", "chord-anchor:F|min|4:b3,3:5,2:1", "chord-anchor:F|min|4:5,3:1,2:b3", "chord-anchor:G|maj|4:5,3:1,2:3", "chord-anchor:G|maj|4:1,3:3,2:5", "chord-anchor:G|maj|4:3,3:5,2:1", "chord-anchor:G|min|4:1,3:b3,2:5", "chord-anchor:G|min|4:b3,3:5,2:1", "chord-anchor:G|min|4:5,3:1,2:b3", "chord-anchor:A|maj|4:5,3:1,2:3", "chord-anchor:A|maj|4:1,3:3,2:5", "chord-anchor:A|maj|4:3,3:5,2:1", "chord-anchor:A|min|4:5,3:1,2:b3", "chord-anchor:A|min|4:1,3:b3,2:5", "chord-anchor:A|min|4:b3,3:5,2:1", "chord-anchor:B|maj|4:5,3:1,2:3", "chord-anchor:B|maj|4:1,3:3,2:5", "chord-anchor:B|maj|4:3,3:5,2:1", "chord-anchor:B|min|4:5,3:1,2:b3", "chord-anchor:B|min|4:1,3:b3,2:5", "chord-anchor:B|min|4:b3,3:5,2:1", "chord-anchor:C#|maj|4:3,3:5,2:1", "chord-anchor:C#|maj|4:5,3:1,2:3", "chord-anchor:C#|maj|4:1,3:3,2:5", "chord-anchor:C#|min|4:b3,3:5,2:1", "chord-anchor:C#|min|4:5,3:1,2:b3", "chord-anchor:C#|min|4:1,3:b3,2:5", "chord-anchor:D#|maj|4:3,3:5,2:1", "chord-anchor:D#|maj|4:5,3:1,2:3", "chord-anchor:D#|maj|4:1,3:3,2:5", "chord-anchor:D#|min|4:b3,3:5,2:1", "chord-anchor:D#|min|4:5,3:1,2:b3", "chord-anchor:D#|min|4:1,3:b3,2:5", "chord-anchor:F#|maj|4:1,3:3,2:5", "chord-anchor:F#|maj|4:3,3:5,2:1", "chord-anchor:F#|maj|4:5,3:1,2:3", "chord-anchor:F#|min|4:1,3:b3,2:5", "chord-anchor:F#|min|4:b3,3:5,2:1", "chord-anchor:F#|min|4:5,3:1,2:b3", "chord-anchor:G#|maj|4:5,3:1,2:3", "chord-anchor:G#|maj|4:1,3:3,2:5", "chord-anchor:G#|maj|4:3,3:5,2:1", "chord-anchor:G#|min|4:5,3:1,2:b3", "chord-anchor:G#|min|4:1,3:b3,2:5", "chord-anchor:G#|min|4:b3,3:5,2:1", "chord-anchor:A#|maj|4:5,3:1,2:3", "chord-anchor:A#|maj|4:1,3:3,2:5", "chord-anchor:A#|maj|4:3,3:5,2:1", "chord-anchor:A#|min|4:5,3:1,2:b3", "chord-anchor:A#|min|4:1,3:b3,2:5", "chord-anchor:A#|min|4:b3,3:5,2:1", "chord-zone:C|maj|3:5,2:1,1:3", "chord-zone:C|maj|3:1,2:3,1:5", "chord-zone:C|maj|3:3,2:5,1:1", "chord-zone:C|min|3:1,2:b3,1:5", "chord-zone:C|min|3:b3,2:5,1:1", "chord-zone:C|min|3:5,2:1,1:b3", "chord-zone:D|maj|3:5,2:1,1:3", "chord-zone:D|maj|3:1,2:3,1:5", "chord-zone:D|maj|3:3,2:5,1:1", "chord-zone:D|min|3:5,2:1,1:b3", "chord-zone:D|min|3:1,2:b3,1:5", "chord-zone:D|min|3:b3,2:5,1:1", "chord-zone:E|maj|3:3,2:5,1:1", "chord-zone:E|maj|3:5,2:1,1:3", "chord-zone:E|maj|3:1,2:3,1:5", "chord-zone:E|min|3:b3,2:5,1:1", "chord-zone:E|min|3:5,2:1,1:b3", "chord-zone:E|min|3:1,2:b3,1:5", "chord-zone:F|maj|3:3,2:5,1:1", "chord-zone:F|maj|3:5,2:1,1:3", "chord-zone:F|maj|3:1,2:3,1:5", "chord-zone:F|min|3:b3,2:5,1:1", "chord-zone:F|min|3:5,2:1,1:b3", "chord-zone:F|min|3:1,2:b3,1:5", "chord-zone:G|maj|3:3,2:5,1:1", "chord-zone:G|maj|3:5,2:1,1:3", "chord-zone:G|maj|3:1,2:3,1:5", "chord-zone:G|min|3:b3,2:5,1:1", "chord-zone:G|min|3:5,2:1,1:b3", "chord-zone:G|min|3:1,2:b3,1:5", "chord-zone:A|maj|3:1,2:3,1:5", "chord-zone:A|maj|3:3,2:5,1:1", "chord-zone:A|maj|3:5,2:1,1:3", "chord-zone:A|min|3:1,2:b3,1:5", "chord-zone:A|min|3:b3,2:5,1:1", "chord-zone:A|min|3:5,2:1,1:b3", "chord-zone:B|maj|3:1,2:3,1:5", "chord-zone:B|maj|3:3,2:5,1:1", "chord-zone:B|maj|3:5,2:1,1:3", "chord-zone:B|min|3:1,2:b3,1:5", "chord-zone:B|min|3:b3,2:5,1:1", "chord-zone:B|min|3:5,2:1,1:b3", "chord-zone:C#|maj|3:5,2:1,1:3", "chord-zone:C#|maj|3:1,2:3,1:5", "chord-zone:C#|maj|3:3,2:5,1:1", "chord-zone:C#|min|3:5,2:1,1:b3", "chord-zone:C#|min|3:1,2:b3,1:5", "chord-zone:C#|min|3:b3,2:5,1:1", "chord-zone:D#|maj|3:5,2:1,1:3", "chord-zone:D#|maj|3:1,2:3,1:5", "chord-zone:D#|maj|3:3,2:5,1:1", "chord-zone:D#|min|3:5,2:1,1:b3", "chord-zone:D#|min|3:1,2:b3,1:5", "chord-zone:D#|min|3:b3,2:5,1:1", "chord-zone:F#|maj|3:3,2:5,1:1", "chord-zone:F#|maj|3:5,2:1,1:3", "chord-zone:F#|maj|3:1,2:3,1:5", "chord-zone:F#|min|3:b3,2:5,1:1", "chord-zone:F#|min|3:5,2:1,1:b3", "chord-zone:F#|min|3:1,2:b3,1:5", "chord-zone:G#|maj|3:3,2:5,1:1", "chord-zone:G#|maj|3:5,2:1,1:3", "chord-zone:G#|maj|3:1,2:3,1:5", "chord-zone:G#|min|3:b3,2:5,1:1", "chord-zone:G#|min|3:5,2:1,1:b3", "chord-zone:G#|min|3:1,2:b3,1:5", "chord-zone:A#|maj|3:1,2:3,1:5", "chord-zone:A#|maj|3:3,2:5,1:1", "chord-zone:A#|maj|3:5,2:1,1:3", "chord-zone:A#|min|3:1,2:b3,1:5", "chord-zone:A#|min|3:b3,2:5,1:1", "chord-zone:A#|min|3:5,2:1,1:b3", "chord-zone:C|maj|4:3,3:5,2:1", "chord-zone:C|maj|4:5,3:1,2:3", "chord-zone:C|maj|4:1,3:3,2:5", "chord-zone:C|min|4:b3,3:5,2:1", "chord-zone:C|min|4:5,3:1,2:b3", "chord-zone:C|min|4:1,3:b3,2:5", "chord-zone:D|maj|4:3,3:5,2:1", "chord-zone:D|maj|4:5,3:1,2:3", "chord-zone:D|maj|4:1,3:3,2:5", "chord-zone:D|min|4:b3,3:5,2:1", "chord-zone:D|min|4:5,3:1,2:b3", "chord-zone:D|min|4:1,3:b3,2:5", "chord-zone:E|maj|4:1,3:3,2:5", "chord-zone:E|maj|4:3,3:5,2:1", "chord-zone:E|maj|4:5,3:1,2:3", "chord-zone:E|min|4:1,3:b3,2:5", "chord-zone:E|min|4:b3,3:5,2:1", "chord-zone:E|min|4:5,3:1,2:b3", "chord-zone:F|maj|4:1,3:3,2:5", "chord-zone:F|maj|4:3,3:5,2:1", "chord-zone:F|maj|4:5,3:1,2:3", "chord-zone:F|min|4:1,3:b3,2:5", "chord-zone:F|min|4:b3,3:5,2:1", "chord-zone:F|min|4:5,3:1,2:b3", "chord-zone:G|maj|4:5,3:1,2:3", "chord-zone:G|maj|4:1,3:3,2:5", "chord-zone:G|maj|4:3,3:5,2:1", "chord-zone:G|min|4:1,3:b3,2:5", "chord-zone:G|min|4:b3,3:5,2:1", "chord-zone:G|min|4:5,3:1,2:b3", "chord-zone:A|maj|4:5,3:1,2:3", "chord-zone:A|maj|4:1,3:3,2:5", "chord-zone:A|maj|4:3,3:5,2:1", "chord-zone:A|min|4:5,3:1,2:b3", "chord-zone:A|min|4:1,3:b3,2:5", "chord-zone:A|min|4:b3,3:5,2:1", "chord-zone:B|maj|4:5,3:1,2:3", "chord-zone:B|maj|4:1,3:3,2:5", "chord-zone:B|maj|4:3,3:5,2:1", "chord-zone:B|min|4:5,3:1,2:b3", "chord-zone:B|min|4:1,3:b3,2:5", "chord-zone:B|min|4:b3,3:5,2:1", "chord-zone:C#|maj|4:3,3:5,2:1", "chord-zone:C#|maj|4:5,3:1,2:3", "chord-zone:C#|maj|4:1,3:3,2:5", "chord-zone:C#|min|4:b3,3:5,2:1", "chord-zone:C#|min|4:5,3:1,2:b3", "chord-zone:C#|min|4:1,3:b3,2:5", "chord-zone:D#|maj|4:3,3:5,2:1", "chord-zone:D#|maj|4:5,3:1,2:3", "chord-zone:D#|maj|4:1,3:3,2:5", "chord-zone:D#|min|4:b3,3:5,2:1", "chord-zone:D#|min|4:5,3:1,2:b3", "chord-zone:D#|min|4:1,3:b3,2:5", "chord-zone:F#|maj|4:1,3:3,2:5", "chord-zone:F#|maj|4:3,3:5,2:1", "chord-zone:F#|maj|4:5,3:1,2:3", "chord-zone:F#|min|4:1,3:b3,2:5", "chord-zone:F#|min|4:b3,3:5,2:1", "chord-zone:F#|min|4:5,3:1,2:b3", "chord-zone:G#|maj|4:5,3:1,2:3", "chord-zone:G#|maj|4:1,3:3,2:5", "chord-zone:G#|maj|4:3,3:5,2:1", "chord-zone:G#|min|4:5,3:1,2:b3", "chord-zone:G#|min|4:1,3:b3,2:5", "chord-zone:G#|min|4:b3,3:5,2:1", "chord-zone:A#|maj|4:5,3:1,2:3", "chord-zone:A#|maj|4:1,3:3,2:5", "chord-zone:A#|maj|4:3,3:5,2:1", "chord-zone:A#|min|4:5,3:1,2:b3", "chord-zone:A#|min|4:1,3:b3,2:5", "chord-zone:A#|min|4:b3,3:5,2:1"],
	"anchor on G-B-E": ["chord-anchor:C|maj|3:5,2:1,1:3", "chord-anchor:C|maj|3:1,2:3,1:5", "chord-anchor:C|maj|3:3,2:5,1:1", "chord-anchor:C|min|3:1,2:b3,1:5", "chord-anchor:C|min|3:b3,2:5,1:1", "chord-anchor:C|min|3:5,2:1,1:b3", "chord-anchor:D|maj|3:5,2:1,1:3", "chord-anchor:D|maj|3:1,2:3,1:5", "chord-anchor:D|maj|3:3,2:5,1:1", "chord-anchor:D|min|3:5,2:1,1:b3", "chord-anchor:D|min|3:1,2:b3,1:5", "chord-anchor:D|min|3:b3,2:5,1:1", "chord-anchor:E|maj|3:3,2:5,1:1", "chord-anchor:E|maj|3:5,2:1,1:3", "chord-anchor:E|maj|3:1,2:3,1:5", "chord-anchor:E|min|3:b3,2:5,1:1", "chord-anchor:E|min|3:5,2:1,1:b3", "chord-anchor:E|min|3:1,2:b3,1:5", "chord-anchor:F|maj|3:3,2:5,1:1", "chord-anchor:F|maj|3:5,2:1,1:3", "chord-anchor:F|maj|3:1,2:3,1:5", "chord-anchor:F|min|3:b3,2:5,1:1", "chord-anchor:F|min|3:5,2:1,1:b3", "chord-anchor:F|min|3:1,2:b3,1:5", "chord-anchor:G|maj|3:3,2:5,1:1", "chord-anchor:G|maj|3:5,2:1,1:3", "chord-anchor:G|maj|3:1,2:3,1:5", "chord-anchor:G|min|3:b3,2:5,1:1", "chord-anchor:G|min|3:5,2:1,1:b3", "chord-anchor:G|min|3:1,2:b3,1:5", "chord-anchor:A|maj|3:1,2:3,1:5", "chord-anchor:A|maj|3:3,2:5,1:1", "chord-anchor:A|maj|3:5,2:1,1:3", "chord-anchor:A|min|3:1,2:b3,1:5", "chord-anchor:A|min|3:b3,2:5,1:1", "chord-anchor:A|min|3:5,2:1,1:b3", "chord-anchor:B|maj|3:1,2:3,1:5", "chord-anchor:B|maj|3:3,2:5,1:1", "chord-anchor:B|maj|3:5,2:1,1:3", "chord-anchor:B|min|3:1,2:b3,1:5", "chord-anchor:B|min|3:b3,2:5,1:1", "chord-anchor:B|min|3:5,2:1,1:b3", "chord-anchor:C#|maj|3:5,2:1,1:3", "chord-anchor:C#|maj|3:1,2:3,1:5", "chord-anchor:C#|maj|3:3,2:5,1:1", "chord-anchor:C#|min|3:5,2:1,1:b3", "chord-anchor:C#|min|3:1,2:b3,1:5", "chord-anchor:C#|min|3:b3,2:5,1:1", "chord-anchor:D#|maj|3:5,2:1,1:3", "chord-anchor:D#|maj|3:1,2:3,1:5", "chord-anchor:D#|maj|3:3,2:5,1:1", "chord-anchor:D#|min|3:5,2:1,1:b3", "chord-anchor:D#|min|3:1,2:b3,1:5", "chord-anchor:D#|min|3:b3,2:5,1:1", "chord-anchor:F#|maj|3:3,2:5,1:1", "chord-anchor:F#|maj|3:5,2:1,1:3", "chord-anchor:F#|maj|3:1,2:3,1:5", "chord-anchor:F#|min|3:b3,2:5,1:1", "chord-anchor:F#|min|3:5,2:1,1:b3", "chord-anchor:F#|min|3:1,2:b3,1:5", "chord-anchor:G#|maj|3:3,2:5,1:1", "chord-anchor:G#|maj|3:5,2:1,1:3", "chord-anchor:G#|maj|3:1,2:3,1:5", "chord-anchor:G#|min|3:b3,2:5,1:1", "chord-anchor:G#|min|3:5,2:1,1:b3", "chord-anchor:G#|min|3:1,2:b3,1:5", "chord-anchor:A#|maj|3:1,2:3,1:5", "chord-anchor:A#|maj|3:3,2:5,1:1", "chord-anchor:A#|maj|3:5,2:1,1:3", "chord-anchor:A#|min|3:1,2:b3,1:5", "chord-anchor:A#|min|3:b3,2:5,1:1", "chord-anchor:A#|min|3:5,2:1,1:b3"],
	"zone of iohefy-a": ["chord-zone:C|maj|3:5,2:1,1:3", "chord-zone:C|maj|3:1,2:3,1:5", "chord-zone:C|maj|3:3,2:5,1:1", "chord-zone:D|min|3:5,2:1,1:b3", "chord-zone:D|min|3:1,2:b3,1:5", "chord-zone:D|min|3:b3,2:5,1:1", "chord-zone:E|min|3:b3,2:5,1:1", "chord-zone:E|min|3:5,2:1,1:b3", "chord-zone:E|min|3:1,2:b3,1:5", "chord-zone:F|maj|3:3,2:5,1:1", "chord-zone:F|maj|3:5,2:1,1:3", "chord-zone:F|maj|3:1,2:3,1:5", "chord-zone:G|maj|3:3,2:5,1:1", "chord-zone:G|maj|3:5,2:1,1:3", "chord-zone:G|maj|3:1,2:3,1:5", "chord-zone:D#|min|3:5,2:1,1:b3", "chord-zone:D#|min|3:1,2:b3,1:5", "chord-zone:D#|min|3:b3,2:5,1:1", "chord-zone:G#|maj|3:3,2:5,1:1", "chord-zone:G#|maj|3:5,2:1,1:3", "chord-zone:G#|maj|3:1,2:3,1:5", "chord-zone:C|maj|4:3,3:5,2:1", "chord-zone:C|maj|4:5,3:1,2:3", "chord-zone:C|maj|4:1,3:3,2:5", "chord-zone:D|min|4:b3,3:5,2:1", "chord-zone:D|min|4:5,3:1,2:b3", "chord-zone:D|min|4:1,3:b3,2:5", "chord-zone:E|min|4:1,3:b3,2:5", "chord-zone:E|min|4:b3,3:5,2:1", "chord-zone:E|min|4:5,3:1,2:b3", "chord-zone:F|maj|4:1,3:3,2:5", "chord-zone:F|maj|4:3,3:5,2:1", "chord-zone:F|maj|4:5,3:1,2:3", "chord-zone:G|maj|4:5,3:1,2:3", "chord-zone:G|maj|4:1,3:3,2:5", "chord-zone:G|maj|4:3,3:5,2:1", "chord-zone:D#|min|4:b3,3:5,2:1", "chord-zone:D#|min|4:5,3:1,2:b3", "chord-zone:D#|min|4:1,3:b3,2:5", "chord-zone:G#|maj|4:5,3:1,2:3", "chord-zone:G#|maj|4:1,3:3,2:5", "chord-zone:G#|maj|4:3,3:5,2:1"],
	"a draw": ["chord-anchor:C|maj|3:5,2:1,1:3", "chord-anchor:C|maj|3:1,2:3,1:5", "chord-anchor:C|min|3:5,2:1,1:b3", "chord-anchor:D|maj|3:5,2:1,1:3", "chord-anchor:D|maj|3:1,2:3,1:5", "chord-anchor:D|min|3:1,2:b3,1:5", "chord-anchor:D|min|3:b3,2:5,1:1", "chord-anchor:E|maj|3:1,2:3,1:5", "chord-anchor:E|min|3:b3,2:5,1:1", "chord-anchor:E|min|3:5,2:1,1:b3", "chord-anchor:F|maj|3:3,2:5,1:1", "chord-anchor:F|maj|3:1,2:3,1:5", "chord-anchor:F|min|3:5,2:1,1:b3", "chord-anchor:F|min|3:1,2:b3,1:5", "chord-anchor:G|maj|3:3,2:5,1:1", "chord-anchor:G|maj|3:5,2:1,1:3", "chord-anchor:G|min|3:5,2:1,1:b3", "chord-anchor:B|maj|3:3,2:5,1:1", "chord-anchor:B|maj|3:5,2:1,1:3", "chord-anchor:B|min|3:1,2:b3,1:5", "chord-anchor:B|min|3:b3,2:5,1:1", "chord-anchor:B|min|3:5,2:1,1:b3", "chord-anchor:C#|maj|3:5,2:1,1:3", "chord-anchor:C#|maj|3:3,2:5,1:1", "chord-anchor:C#|min|3:5,2:1,1:b3", "chord-anchor:C#|min|3:1,2:b3,1:5", "chord-anchor:D#|maj|3:3,2:5,1:1", "chord-anchor:D#|min|3:5,2:1,1:b3", "chord-anchor:D#|min|3:1,2:b3,1:5", "chord-anchor:D#|min|3:b3,2:5,1:1", "chord-anchor:F#|maj|3:5,2:1,1:3", "chord-anchor:F#|maj|3:1,2:3,1:5", "chord-anchor:F#|min|3:5,2:1,1:b3", "chord-anchor:F#|min|3:1,2:b3,1:5", "chord-anchor:A#|maj|3:1,2:3,1:5", "chord-anchor:C|min|4:1,3:b3,2:5", "chord-anchor:D|maj|4:5,3:1,2:3", "chord-anchor:E|maj|4:5,3:1,2:3", "chord-anchor:F|maj|4:1,3:3,2:5", "chord-anchor:F|maj|4:3,3:5,2:1", "chord-anchor:F|maj|4:5,3:1,2:3", "chord-anchor:F|min|4:1,3:b3,2:5", "chord-anchor:G|maj|4:1,3:3,2:5", "chord-anchor:A|maj|4:5,3:1,2:3", "chord-anchor:B|maj|4:5,3:1,2:3", "chord-anchor:B|min|4:1,3:b3,2:5", "chord-anchor:B|min|4:b3,3:5,2:1", "chord-anchor:C#|maj|4:3,3:5,2:1", "chord-anchor:D#|min|4:b3,3:5,2:1", "chord-anchor:D#|min|4:5,3:1,2:b3", "chord-anchor:F#|maj|4:5,3:1,2:3", "chord-anchor:F#|min|4:b3,3:5,2:1", "chord-anchor:G#|maj|4:5,3:1,2:3", "chord-anchor:G#|maj|4:1,3:3,2:5", "chord-anchor:G#|maj|4:3,3:5,2:1", "chord-anchor:G#|min|4:5,3:1,2:b3", "chord-anchor:G#|min|4:1,3:b3,2:5", "chord-anchor:G#|min|4:b3,3:5,2:1", "chord-anchor:A#|maj|4:5,3:1,2:3", "chord-anchor:A#|maj|4:1,3:3,2:5", "chord-anchor:A#|maj|4:3,3:5,2:1", "chord-anchor:A#|min|4:b3,3:5,2:1", "chord-zone:C|maj|3:5,2:1,1:3", "chord-zone:C|maj|3:1,2:3,1:5", "chord-zone:C|maj|3:3,2:5,1:1", "chord-zone:C|min|3:b3,2:5,1:1", "chord-zone:C|min|3:5,2:1,1:b3", "chord-zone:D|min|3:b3,2:5,1:1", "chord-zone:E|maj|3:5,2:1,1:3", "chord-zone:E|min|3:5,2:1,1:b3", "chord-zone:E|min|3:1,2:b3,1:5", "chord-zone:F|min|3:b3,2:5,1:1", "chord-zone:F|min|3:5,2:1,1:b3", "chord-zone:G|maj|3:3,2:5,1:1", "chord-zone:G|maj|3:5,2:1,1:3", "chord-zone:G|maj|3:1,2:3,1:5", "chord-zone:G|min|3:5,2:1,1:b3", "chord-zone:A|maj|3:3,2:5,1:1", "chord-zone:A|maj|3:5,2:1,1:3", "chord-zone:A|min|3:b3,2:5,1:1", "chord-zone:B|min|3:1,2:b3,1:5", "chord-zone:B|min|3:b3,2:5,1:1", "chord-zone:C#|min|3:5,2:1,1:b3", "chord-zone:C#|min|3:b3,2:5,1:1", "chord-zone:D#|maj|3:3,2:5,1:1", "chord-zone:D#|min|3:5,2:1,1:b3", "chord-zone:D#|min|3:1,2:b3,1:5", "chord-zone:F#|maj|3:1,2:3,1:5", "chord-zone:F#|min|3:b3,2:5,1:1", "chord-zone:F#|min|3:5,2:1,1:b3", "chord-zone:G#|min|3:5,2:1,1:b3", "chord-zone:A#|maj|3:1,2:3,1:5", "chord-zone:A#|maj|3:5,2:1,1:3", "chord-zone:C|min|4:b3,3:5,2:1", "chord-zone:C|min|4:1,3:b3,2:5", "chord-zone:D|maj|4:3,3:5,2:1", "chord-zone:D|maj|4:1,3:3,2:5", "chord-zone:E|maj|4:3,3:5,2:1", "chord-zone:E|maj|4:5,3:1,2:3", "chord-zone:E|min|4:1,3:b3,2:5", "chord-zone:E|min|4:5,3:1,2:b3", "chord-zone:F|min|4:b3,3:5,2:1", "chord-zone:F|min|4:5,3:1,2:b3", "chord-zone:G|min|4:1,3:b3,2:5", "chord-zone:A|maj|4:1,3:3,2:5", "chord-zone:A|maj|4:3,3:5,2:1", "chord-zone:A|min|4:1,3:b3,2:5", "chord-zone:A|min|4:b3,3:5,2:1", "chord-zone:B|maj|4:1,3:3,2:5", "chord-zone:B|min|4:5,3:1,2:b3", "chord-zone:C#|maj|4:3,3:5,2:1", "chord-zone:C#|maj|4:5,3:1,2:3", "chord-zone:C#|min|4:b3,3:5,2:1", "chord-zone:C#|min|4:5,3:1,2:b3", "chord-zone:C#|min|4:1,3:b3,2:5", "chord-zone:D#|maj|4:1,3:3,2:5", "chord-zone:D#|min|4:b3,3:5,2:1", "chord-zone:D#|min|4:5,3:1,2:b3", "chord-zone:D#|min|4:1,3:b3,2:5", "chord-zone:F#|maj|4:1,3:3,2:5", "chord-zone:F#|maj|4:5,3:1,2:3", "chord-zone:F#|min|4:b3,3:5,2:1", "chord-zone:G#|maj|4:1,3:3,2:5", "chord-zone:G#|maj|4:3,3:5,2:1", "chord-zone:G#|min|4:b3,3:5,2:1", "chord-zone:A#|maj|4:3,3:5,2:1", "chord-zone:A#|min|4:5,3:1,2:b3", "chord-zone:A#|min|4:1,3:b3,2:5"],
};

/** By card set, the indices of each exercise the old rule opened. */
// prettier-ignore
const OPENING: Record<string, Record<Name, string[]>> = {
	"none": {"link": [], "climb": [], "zone": [], "jam": []},
	"every": {"link": ["chord=C;strings=3,2,1", "chord=C;strings=4,3,2", "chord=Cm;strings=3,2,1", "chord=Cm;strings=4,3,2", "chord=C#;strings=3,2,1", "chord=C#;strings=4,3,2", "chord=C#m;strings=3,2,1", "chord=C#m;strings=4,3,2", "chord=D;strings=3,2,1", "chord=D;strings=4,3,2", "chord=Dm;strings=3,2,1", "chord=Dm;strings=4,3,2", "chord=Eb;strings=3,2,1", "chord=Eb;strings=4,3,2", "chord=Ebm;strings=3,2,1", "chord=Ebm;strings=4,3,2", "chord=E;strings=3,2,1", "chord=E;strings=4,3,2", "chord=Em;strings=3,2,1", "chord=Em;strings=4,3,2", "chord=F;strings=3,2,1", "chord=F;strings=4,3,2", "chord=Fm;strings=3,2,1", "chord=Fm;strings=4,3,2", "chord=F#;strings=3,2,1", "chord=F#;strings=4,3,2", "chord=F#m;strings=3,2,1", "chord=F#m;strings=4,3,2", "chord=G;strings=3,2,1", "chord=G;strings=4,3,2", "chord=Gm;strings=3,2,1", "chord=Gm;strings=4,3,2", "chord=Ab;strings=3,2,1", "chord=Ab;strings=4,3,2", "chord=Abm;strings=3,2,1", "chord=Abm;strings=4,3,2", "chord=A;strings=3,2,1", "chord=A;strings=4,3,2", "chord=Am;strings=3,2,1", "chord=Am;strings=4,3,2", "chord=Bb;strings=3,2,1", "chord=Bb;strings=4,3,2", "chord=Bbm;strings=3,2,1", "chord=Bbm;strings=4,3,2", "chord=B;strings=3,2,1", "chord=B;strings=4,3,2", "chord=Bm;strings=3,2,1", "chord=Bm;strings=4,3,2"], "climb": ["grid=iohefy-a;strings=3,2,1", "grid=iohefy-a;strings=4,3,2", "grid=blues-f;strings=3,2,1", "grid=blues-f;strings=4,3,2"], "zone": ["grid=iohefy-a", "grid=blues-f"], "jam": ["grid=iohefy-a", "grid=blues-f"]},
	"anchor on G-B-E": {"link": ["chord=C;strings=3,2,1", "chord=Cm;strings=3,2,1", "chord=C#;strings=3,2,1", "chord=C#m;strings=3,2,1", "chord=D;strings=3,2,1", "chord=Dm;strings=3,2,1", "chord=Eb;strings=3,2,1", "chord=Ebm;strings=3,2,1", "chord=E;strings=3,2,1", "chord=Em;strings=3,2,1", "chord=F;strings=3,2,1", "chord=Fm;strings=3,2,1", "chord=F#;strings=3,2,1", "chord=F#m;strings=3,2,1", "chord=G;strings=3,2,1", "chord=Gm;strings=3,2,1", "chord=Ab;strings=3,2,1", "chord=Abm;strings=3,2,1", "chord=A;strings=3,2,1", "chord=Am;strings=3,2,1", "chord=Bb;strings=3,2,1", "chord=Bbm;strings=3,2,1", "chord=B;strings=3,2,1", "chord=Bm;strings=3,2,1"], "climb": ["grid=iohefy-a;strings=3,2,1", "grid=blues-f;strings=3,2,1"], "zone": [], "jam": ["grid=iohefy-a", "grid=blues-f"]},
	"zone of iohefy-a": {"link": [], "climb": [], "zone": ["grid=iohefy-a"], "jam": []},
	"a draw": {"link": ["chord=Ebm;strings=3,2,1", "chord=F;strings=4,3,2", "chord=Ab;strings=4,3,2", "chord=Abm;strings=4,3,2", "chord=Bb;strings=4,3,2", "chord=Bm;strings=3,2,1"], "climb": [], "zone": [], "jam": []},
};

/**
 * A session served on every card, the old selector's rounds: [exercise, key, scope, countIn,
 * restBars, direction, zone, shape before, the shape answered, success].
 */
// prettier-ignore
const SERVED: [
	string,
	string,
	string | null,
	boolean | null,
	number | null,
	string | null,
	[number, number] | null,
	string | null,
	string | null,
	boolean
][] = [
	["inversion-run", "C|maj|3:5,2:1,1:3@0-1-0", null, true, null, null, null, null, "C|maj|3:5,2:1,1:3@0-1-0", true],
	["inversion-run", "C|maj|3:1,2:3,1:5@5-5-3", null, null, null, null, null, "C|maj|3:5,2:1,1:3@0-1-0", "C|maj|3:1,2:3,1:5@5-5-3", true],
	["inversion-run", "C|maj|3:3,2:5,1:1@9-8-8", null, null, null, null, null, "C|maj|3:1,2:3,1:5@5-5-3", "C|maj|3:3,2:5,1:1@9-8-8", true],
	["inversion-run", "C|maj|3:5,2:1,1:3@12-13-12", null, null, null, null, null, "C|maj|3:3,2:5,1:1@9-8-8", "C|maj|3:5,2:1,1:3@12-13-12", true],
	["inversion-run", "C|maj|3:3,2:5,1:1@9-8-8", null, null, null, null, null, "C|maj|3:5,2:1,1:3@12-13-12", "C|maj|3:3,2:5,1:1@9-8-8", true],
	["inversion-run", "C|maj|3:1,2:3,1:5@5-5-3", null, null, null, null, null, "C|maj|3:3,2:5,1:1@9-8-8", "C|maj|3:1,2:3,1:5@5-5-3", true],
	["inversion-run", "C|maj|3:5,2:1,1:3@0-1-0", null, null, null, null, null, "C|maj|3:1,2:3,1:5@5-5-3", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-in-direction", "iohefy-a#0", "iohefy-a", true, null, "up", null, null, "D|min|3:5,2:1,1:b3@2-3-1", true],
	["grid-in-direction", "iohefy-a#1", "iohefy-a", null, null, "up", null, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|3:3,2:5,1:1@4-3-3", true],
	["grid-in-direction", "iohefy-a#2", "iohefy-a", null, null, "up", null, "G|maj|3:3,2:5,1:1@4-3-3", "F#|maj|3:3,2:5,1:1@3-2-2", false],
	["grid-in-direction", "iohefy-a#3", "iohefy-a", null, null, "up", null, "F#|maj|3:3,2:5,1:1@3-2-2", "G|maj|3:3,2:5,1:1@4-3-3", true],
	["grid-in-direction", "iohefy-a#4", "iohefy-a", null, null, "up", null, "G|maj|3:3,2:5,1:1@4-3-3", "C|maj|5:5,4:1,3:3@10-10-9", false],
	["grid-in-direction", "iohefy-a#5", "iohefy-a", null, null, "up", null, "C|maj|5:5,4:1,3:3@10-10-9", "F|maj|3:3,2:5,1:1@14-13-13", true],
	["grid-in-direction", "iohefy-a#6", "iohefy-a", null, null, "up", null, "F|maj|3:3,2:5,1:1@14-13-13", "E|min|3:5,2:1,1:b3@16-17-15", true],
	["grid-in-direction", "iohefy-a#7", "iohefy-a", null, null, "down", null, "E|min|3:5,2:1,1:b3@16-17-15", "D#|min|3:5,2:1,1:b3@3-4-2", true],
	["grid-in-direction", "iohefy-a#8", "iohefy-a", null, null, "up", null, "D#|min|3:5,2:1,1:b3@3-4-2", "G#|maj|3:3,2:5,1:1@5-4-4", true],
	["grid-in-zone", "iohefy-a#0", "iohefy-a", true, null, null, [1, 5], null, "D|min|3:5,2:1,1:b3@2-3-1", true],
	["grid-in-zone", "iohefy-a#1", "iohefy-a", null, null, null, [1, 5], "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", true],
	["grid-in-zone", "iohefy-a#2", "iohefy-a", null, null, null, [1, 5], "G|maj|4:5,3:1,2:3@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1", true],
	["grid-in-zone", "iohefy-a#3", "iohefy-a", null, null, null, [1, 5], "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", true],
	["grid-in-zone", "iohefy-a#4", "iohefy-a", null, null, null, [1, 5], "G|maj|4:5,3:1,2:3@0-0-0", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-in-zone", "iohefy-a#5", "iohefy-a", null, null, null, [1, 5], "C|maj|3:5,2:1,1:3@0-1-0", "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-in-zone", "iohefy-a#6", "iohefy-a", null, null, null, [1, 5], "F|maj|3:3,2:5,1:1@2-1-1", "E|min|3:b3,2:5,1:1@0-0-0", true],
	["grid-in-zone", "iohefy-a#7", "iohefy-a", null, null, null, [1, 5], "E|min|3:b3,2:5,1:1@0-0-0", "D#|min|3:5,2:1,1:b3@3-4-2", true],
	["grid-in-zone", "iohefy-a#8", "iohefy-a", null, null, null, [1, 5], "D#|min|3:5,2:1,1:b3@3-4-2", "G#|maj|4:5,3:1,2:3@1-1-1", true],
	["grid-reading", "iohefy-a#0", "iohefy-a", true, null, null, null, null, "D|min|3:5,2:1,1:b3@2-3-1", true],
	["grid-reading", "iohefy-a#1", "iohefy-a", null, null, null, null, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", true],
	["grid-reading", "iohefy-a#2", "iohefy-a", null, null, null, null, "G|maj|4:5,3:1,2:3@0-0-0", "D|min|5:b3,4:5,3:1@8-7-7", false],
	["grid-reading", "iohefy-a#3", "iohefy-a", null, null, null, null, "D|min|5:b3,4:5,3:1@8-7-7", "G|maj|4:5,3:1,2:3@0-0-0", true],
	["grid-reading", "iohefy-a#4", "iohefy-a", null, null, null, null, "G|maj|4:5,3:1,2:3@0-0-0", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-reading", "iohefy-a#5", "iohefy-a", null, null, null, null, "C|maj|3:5,2:1,1:3@0-1-0", null, false],
	["grid-reading", "iohefy-a#6", "iohefy-a", null, null, null, null, "C|maj|3:5,2:1,1:3@0-1-0", "E|min|3:b3,2:5,1:1@0-0-0", true],
	["grid-reading", "iohefy-a#7", "iohefy-a", null, null, null, null, "E|min|3:b3,2:5,1:1@0-0-0", "D#|min|3:5,2:1,1:b3@3-4-2", true],
	["grid-reading", "iohefy-a#8", "iohefy-a", null, null, null, null, "D#|min|3:5,2:1,1:b3@3-4-2", "G#|maj|6:3,5:5,4:1@8-6-6", false],
	["inversion-run", "C|maj|4:3,3:5,2:1@2-0-1", null, true, 1, null, null, null, "C|maj|4:3,3:5,2:1@2-0-1", true],
	["inversion-run", "C|maj|4:5,3:1,2:3@5-5-5", null, null, null, null, null, "C|maj|4:3,3:5,2:1@2-0-1", "C|maj|4:5,3:1,2:3@5-5-5", true],
	["inversion-run", "C|maj|4:1,3:3,2:5@10-9-8", null, null, null, null, null, "C|maj|4:5,3:1,2:3@5-5-5", "C|maj|4:1,3:3,2:5@10-9-8", true],
	["inversion-run", "C|maj|4:3,3:5,2:1@14-12-13", null, null, null, null, null, "C|maj|4:1,3:3,2:5@10-9-8", "C|maj|4:3,3:5,2:1@14-12-13", true],
	["inversion-run", "C|maj|4:1,3:3,2:5@10-9-8", null, null, null, null, null, "C|maj|4:3,3:5,2:1@14-12-13", "C|maj|4:1,3:3,2:5@10-9-8", true],
	["inversion-run", "C|maj|4:5,3:1,2:3@5-5-5", null, null, null, null, null, "C|maj|4:1,3:3,2:5@10-9-8", "C|maj|4:5,3:1,2:3@5-5-5", true],
	["inversion-run", "C|maj|4:3,3:5,2:1@2-0-1", null, null, null, null, null, "C|maj|4:5,3:1,2:3@5-5-5", "C|maj|4:3,3:5,2:1@2-0-1", true],
	["grid-in-direction", "iohefy-a#0", "iohefy-a", true, null, "up", null, null, "D|min|4:b3,3:5,2:1@3-2-3", true],
	["grid-in-direction", "iohefy-a#1", "iohefy-a", null, null, "up", null, "D|min|4:b3,3:5,2:1@3-2-3", "G|maj|4:1,3:3,2:5@5-4-3", true],
	["grid-in-direction", "iohefy-a#2", "iohefy-a", null, null, "up", null, "G|maj|4:1,3:3,2:5@5-4-3", null, false],
	["grid-in-direction", "iohefy-a#3", "iohefy-a", null, null, "up", null, "G|maj|4:1,3:3,2:5@5-4-3", null, false],
	["grid-in-direction", "iohefy-a#4", "iohefy-a", null, null, "up", null, "G|maj|4:1,3:3,2:5@5-4-3", "C|maj|3:5,2:1,1:3@12-13-12", false],
	["grid-in-direction", "iohefy-a#5", "iohefy-a", null, null, "up", null, "C|maj|3:5,2:1,1:3@12-13-12", "F|maj|4:1,3:3,2:5@15-14-13", true],
	["grid-in-direction", "iohefy-a#6", "iohefy-a", null, null, "up", null, "F|maj|4:1,3:3,2:5@15-14-13", "E|min|4:b3,3:5,2:1@17-16-17", true],
	["grid-in-direction", "iohefy-a#7", "iohefy-a", null, null, "down", null, "E|min|4:b3,3:5,2:1@17-16-17", null, false],
	["grid-in-direction", "iohefy-a#8", "iohefy-a", null, null, "down", null, "E|min|4:b3,3:5,2:1@17-16-17", "G#|maj|4:5,3:1,2:3@1-1-1", true],
	["grid-in-zone", "blues-f#0", "blues-f", true, null, null, [1, 5], null, "F|maj|6:3,5:5,4:1@17-15-15", false],
	["grid-in-zone", "blues-f#1", "blues-f", null, null, null, [1, 5], "F|maj|6:3,5:5,4:1@17-15-15", null, false],
	["grid-in-zone", "blues-f#2", "blues-f", null, null, null, [1, 5], "F|maj|6:3,5:5,4:1@17-15-15", "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-in-zone", "blues-f#3", "blues-f", null, null, null, [1, 5], "F|maj|3:3,2:5,1:1@2-1-1", "A#|maj|3:1,2:3,1:5@3-3-1", true],
	["grid-in-zone", "blues-f#4", "blues-f", null, null, null, [1, 5], "A#|maj|3:1,2:3,1:5@3-3-1", "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-in-zone", "blues-f#5", "blues-f", null, null, null, [1, 5], "F|maj|3:3,2:5,1:1@2-1-1", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-in-zone", "blues-f#6", "blues-f", null, null, null, [1, 5], "C|maj|3:5,2:1,1:3@0-1-0", "A#|maj|5:5,4:1,3:3@8-8-7", false],
	["grid-in-zone", "blues-f#7", "blues-f", null, null, null, [1, 5], "A#|maj|5:5,4:1,3:3@8-8-7", "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-in-zone", "blues-f#8", "blues-f", null, null, null, [1, 5], "F|maj|3:3,2:5,1:1@2-1-1", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-reading", "blues-f#0", "blues-f", true, null, null, null, null, "F#|maj|3:1,2:3,1:5@11-11-9", false],
	["grid-reading", "blues-f#1", "blues-f", null, null, null, null, "F#|maj|3:1,2:3,1:5@11-11-9", "A#|maj|3:1,2:3,1:5@3-3-1", true],
	["grid-reading", "blues-f#2", "blues-f", null, null, null, null, "A#|maj|3:1,2:3,1:5@3-3-1", "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-reading", "blues-f#3", "blues-f", null, null, null, null, "F|maj|3:3,2:5,1:1@2-1-1", null, false],
	["grid-reading", "blues-f#4", "blues-f", null, null, null, null, "F|maj|3:3,2:5,1:1@2-1-1", "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-reading", "blues-f#5", "blues-f", null, null, null, null, "F|maj|3:3,2:5,1:1@2-1-1", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-reading", "blues-f#6", "blues-f", null, null, null, null, "C|maj|3:5,2:1,1:3@0-1-0", "A#|maj|3:1,2:3,1:5@3-3-1", true],
	["grid-reading", "blues-f#7", "blues-f", null, null, null, null, "A#|maj|3:1,2:3,1:5@3-3-1", "F|maj|5:5,4:1,3:3@15-15-14", false],
	["grid-reading", "blues-f#8", "blues-f", null, null, null, null, "F|maj|5:5,4:1,3:3@15-15-14", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["inversion-run", "C|min|3:1,2:b3,1:5@5-4-3", null, true, 1, null, null, null, "C|min|3:1,2:b3,1:5@5-4-3", true],
	["inversion-run", "C|min|3:b3,2:5,1:1@8-8-8", null, null, null, null, null, "C|min|3:1,2:b3,1:5@5-4-3", "C|min|3:b3,2:5,1:1@8-8-8", true],
	["inversion-run", "C|min|3:5,2:1,1:b3@12-13-11", null, null, null, null, null, "C|min|3:b3,2:5,1:1@8-8-8", "C|min|3:5,2:1,1:b3@12-13-11", true],
	["inversion-run", "C|min|3:1,2:b3,1:5@17-16-15", null, null, null, null, null, "C|min|3:5,2:1,1:b3@12-13-11", "C|min|3:1,2:b3,1:5@17-16-15", true],
	["inversion-run", "C|min|3:5,2:1,1:b3@12-13-11", null, null, null, null, null, "C|min|3:1,2:b3,1:5@17-16-15", "C|min|3:5,2:1,1:b3@12-13-11", true],
	["inversion-run", "C|min|3:b3,2:5,1:1@8-8-8", null, null, null, null, null, "C|min|3:5,2:1,1:b3@12-13-11", "C|min|3:b3,2:5,1:1@8-8-8", true],
	["inversion-run", "C|min|3:1,2:b3,1:5@5-4-3", null, null, null, null, null, "C|min|3:b3,2:5,1:1@8-8-8", "C|min|3:1,2:b3,1:5@5-4-3", true],
	["grid-in-direction", "blues-f#0", "blues-f", true, null, "up", null, null, "F|maj|3:3,2:5,1:1@2-1-1", true],
	["grid-in-direction", "blues-f#1", "blues-f", null, null, "up", null, "F|maj|3:3,2:5,1:1@2-1-1", "A#|maj|3:3,2:5,1:1@7-6-6", true],
	["grid-in-direction", "blues-f#2", "blues-f", null, null, "up", null, "A#|maj|3:3,2:5,1:1@7-6-6", "F|maj|4:3,3:5,2:1@7-5-6", false],
	["grid-in-direction", "blues-f#3", "blues-f", null, null, "up", null, "F|maj|4:3,3:5,2:1@7-5-6", "A#|maj|3:3,2:5,1:1@7-6-6", true],
	["grid-in-direction", "blues-f#4", "blues-f", null, null, "up", null, "A#|maj|3:3,2:5,1:1@7-6-6", "F|maj|3:1,2:3,1:5@10-10-8", true],
	["grid-in-direction", "blues-f#5", "blues-f", null, null, "up", null, "F|maj|3:1,2:3,1:5@10-10-8", "C|maj|3:5,2:1,1:3@12-13-12", true],
	["grid-in-direction", "blues-f#6", "blues-f", null, null, "up", null, "C|maj|3:5,2:1,1:3@12-13-12", "F#|maj|3:3,2:5,1:1@3-2-2", false],
	["grid-in-direction", "blues-f#7", "blues-f", null, null, "up", null, "F#|maj|3:3,2:5,1:1@3-2-2", "F|maj|3:3,2:5,1:1@2-1-1", false],
	["grid-in-direction", "blues-f#8", "blues-f", null, null, "up", null, "F|maj|3:3,2:5,1:1@2-1-1", "C|maj|3:1,2:3,1:5@5-5-3", true],
	["grid-in-zone", "iohefy-a#0", "iohefy-a", true, null, null, [6, 10], null, "D|min|4:5,3:1,2:b3@7-7-6", true],
	["grid-in-zone", "iohefy-a#1", "iohefy-a", null, null, null, [6, 10], "D|min|4:5,3:1,2:b3@7-7-6", "G|maj|3:5,2:1,1:3@7-8-7", true],
	["grid-in-zone", "iohefy-a#2", "iohefy-a", null, null, null, [6, 10], "G|maj|3:5,2:1,1:3@7-8-7", "D|min|4:5,3:1,2:b3@7-7-6", true],
	["grid-in-zone", "iohefy-a#3", "iohefy-a", null, null, null, [6, 10], "D|min|4:5,3:1,2:b3@7-7-6", "G|maj|3:5,2:1,1:3@7-8-7", true],
	["grid-in-zone", "iohefy-a#4", "iohefy-a", null, null, null, [6, 10], "G|maj|3:5,2:1,1:3@7-8-7", "C|maj|3:3,2:5,1:1@9-8-8", true],
	["grid-in-zone", "iohefy-a#5", "iohefy-a", null, null, null, [6, 10], "C|maj|3:3,2:5,1:1@9-8-8", "F|maj|3:1,2:3,1:5@10-10-8", true],
	["grid-in-zone", "iohefy-a#6", "iohefy-a", null, null, null, [6, 10], "F|maj|3:1,2:3,1:5@10-10-8", null, false],
	["grid-in-zone", "iohefy-a#7", "iohefy-a", null, null, null, [6, 10], "F|maj|3:1,2:3,1:5@10-10-8", "D#|min|3:1,2:b3,1:5@8-7-6", true],
	["grid-in-zone", "iohefy-a#8", "iohefy-a", null, null, null, [6, 10], "D#|min|3:1,2:b3,1:5@8-7-6", "G#|maj|3:5,2:1,1:3@8-9-8", true],
	["grid-reading", "iohefy-a#0", "iohefy-a", true, null, null, null, null, "D|min|3:5,2:1,1:b3@2-3-1", true],
	["grid-reading", "iohefy-a#1", "iohefy-a", null, null, null, null, "D|min|3:5,2:1,1:b3@2-3-1", "G|maj|4:5,3:1,2:3@0-0-0", true],
	["grid-reading", "iohefy-a#2", "iohefy-a", null, null, null, null, "G|maj|4:5,3:1,2:3@0-0-0", "D|min|3:5,2:1,1:b3@2-3-1", true],
	["grid-reading", "iohefy-a#3", "iohefy-a", null, null, null, null, "D|min|3:5,2:1,1:b3@2-3-1", null, false],
	["grid-reading", "iohefy-a#4", "iohefy-a", null, null, null, null, "D|min|3:5,2:1,1:b3@2-3-1", "C|maj|3:5,2:1,1:3@0-1-0", true],
	["grid-reading", "iohefy-a#5", "iohefy-a", null, null, null, null, "C|maj|3:5,2:1,1:3@0-1-0", "F#|maj|3:1,2:3,1:5@11-11-9", false],
	["grid-reading", "iohefy-a#6", "iohefy-a", null, null, null, null, "F#|maj|3:1,2:3,1:5@11-11-9", "E|min|3:b3,2:5,1:1@0-0-0", true],
];

describe('the changes, frozen as the old rule decided them', () => {
	it('lists the indices of each exercise as the old rule listed its elements: 48, 4, 2, 2', () => {
		expect(
			Object.fromEntries(
				Object.entries(BY_NAME).map(([name, d]) => [name, passageIndices(d).map((i) => i.key)])
			)
		).toEqual(INDICES);
		expect(Object.values(INDICES).map((keys) => keys.length)).toEqual([48, 4, 2, 2]);
	});

	it('plays a link tour as seven shapes, up and back, each keyed by its placed shape', () => {
		for (const { index, keys } of LINK_TOURS) {
			expect(itemsOf(BY_NAME.link, index).map((item) => keyOf(BY_NAME.link, item))).toEqual(keys);
		}
		expect(LINK_TOURS.map(({ keys }) => keys.length)).toEqual([7, 7, 7, 7]);
	});

	it('plays a grid passage change by change, each keyed <grid>#<rank>', () => {
		for (const { grid, rounds } of GRID_PASSAGES) {
			const definition = BY_NAME.jam;
			const members = passageMembers(definition, indexOf(definition, `grid=${grid}`), {});
			expect(
				members.map((member) => {
					const change = member as GridChangeMember;
					return [
						keyOf(definition, passageDerivation('grid-changes')!.itemOf(member)),
						change.symbol,
						change.length
					];
				})
			).toEqual(rounds);
		}
	});

	it('writes the thirteen zones of the old rotation, and skips none of them on either grid', () => {
		expect(BY_NAME.zone.passages!.each!.zone).toEqual(ZONES);
		for (const [grid, skipped] of ZONES_SKIPPED) {
			const playable = ZONES.filter((zone) => {
				const items = itemsOf(BY_NAME.zone, `grid=${grid}`, { zone });
				return items.every(
					(_, rank) =>
						admittedMembers(contentOf('zone', `grid=${grid}`, rank, { zone }, null)).length > 0
				);
			});
			expect(ZONES.filter((zone) => !playable.includes(zone))).toEqual(skipped);
		}
	});

	it('judges each change as the old rule did: every kind of confusion, with and without a shape before', () => {
		const kinds = new Set(JUDGED.map((row) => `${row[0]}:${row[6] ?? 'right'}`));
		expect([...kinds].sort()).toEqual(
			[
				'climb:not-higher',
				'climb:not-lower',
				'climb:none',
				'climb:other-chord',
				'climb:other-quality',
				'climb:other-set',
				'climb:right',
				'jam:none',
				'jam:other-chord',
				'jam:other-quality',
				'jam:other-set',
				'jam:right',
				'link:none',
				'link:other-chord',
				'link:other-quality',
				'link:other-set',
				'link:other-shape',
				'link:right',
				'zone:none',
				'zone:other-chord',
				'zone:other-quality',
				'zone:other-set',
				'zone:out-of-zone',
				'zone:right'
			].sort()
		);
		for (const [name, key, rank, each, previous, decided, kind] of JUDGED) {
			const judged = memberJudge.judge(contentOf(name, key, rank, each, previous), { decided });
			expect([
				name,
				key,
				rank,
				each,
				previous,
				decided,
				judged.correct,
				(judged.confusion as { kind?: string } | null)?.kind ?? null
			]).toEqual([name, key, rank, each, previous, decided, kind === null, kind]);
		}
	});

	it('judges a shape on open strings inside the zone that starts at fret 1 only', () => {
		const open = JUDGED.filter(
			([name, , , each, , decided]) =>
				name === 'zone' &&
				occurrenceOfId(decided ?? '')?.notes.some((note) => note.fret === 0) &&
				[1, 2].includes((each.zone as number[])[0])
		);
		expect(open.some((row) => (row[3].zone as number[])[0] === 1 && row[6] === null)).toBe(true);
		expect(open.some((row) => (row[3].zone as number[])[0] === 2 && row[6] === 'out-of-zone')).toBe(
			true
		);
	});

	it('turns a climb where the neck runs out, both ways, as the old rule did', () => {
		const family = familyNamed('chord-shapes') as Family;
		const played = TURNS.map(([name, key, rank, each, previous]) => {
			const content = contentOf(name, key, rank, each, previous);
			const before = previous === null ? null : family.member(previous);
			const turned =
				before !== null &&
				select(family, content.index, content.selection, { previous: before }).turned;
			const asked = each.direction as 'up' | 'down';
			return turned ? (asked === 'up' ? 'down' : 'up') : asked;
		});
		expect(played).toEqual(TURNS.map((row) => row[5]));
		const turned = TURNS.filter((row) => row[3].direction !== row[5]).map((row) => row[5]);
		expect(new Set(turned)).toEqual(new Set(['up', 'down']));
	});

	it('tells the chord sensor what the old rule told it', () => {
		for (const [name, key, rank, each, previous, expected, candidates] of SENSOR) {
			const told = changeExpectation(
				contentOf(name, key, rank, each, previous),
				lineOf(name, key),
				name === 'jam',
				3
			);
			expect([
				name,
				key,
				rank,
				previous,
				told.expected,
				told.candidates.map((c) => [c.kind, c.id])
			]).toEqual([name, key, rank, previous, expected, candidates]);
			for (const candidate of told.candidates) {
				const notes = occurrenceOfId(candidate.id)!.notes.map(({ string, fret, midi }) => ({
					string,
					fret,
					midi
				}));
				expect(candidate.notes).toEqual(notes);
			}
		}
		// The link, after a shape sounding as the one asked: told nothing to expect.
		expect(
			SENSOR.some(
				([name, , , , previous, expected]) =>
					name === 'link' && previous !== null && expected.length === 0
			)
		).toBe(true);
	});

	it('draws as due, after a miss, the shape the old rule drew', () => {
		for (const [name, key, rank, each, previous, decided, due] of EXPECTED) {
			const admitted = admittedMembers(contentOf(name, key, rank, each, previous)) as ChordShape[];
			expect([
				name,
				key,
				rank,
				previous,
				decided,
				expectedShape(admitted, decided, previous)?.id ?? null
			]).toEqual([name, key, rank, previous, decided, due]);
		}
	});

	it('opens the indices the old rule opened', () => {
		for (const [title, keys] of Object.entries(CARD_SETS)) {
			const acquired = new Set(keys);
			const open = Object.fromEntries(
				Object.entries(BY_NAME).map(([name, d]) => [
					name,
					passageIndices(d)
						.filter((index) => indexOpen(d, index, acquired))
						.map((index) => index.key)
				])
			);
			expect([title, open]).toEqual([title, OPENING[title]]);
		}
	});

	it('serves a session as the old selector did', () => {
		const cards = CARD_SETS.every.map((key) => ({ key, acquiredAt: 1000 }) as unknown as CardState);
		const source = createPassageSource({
			exercises: CHANGES_EXERCISES,
			cards,
			attempts: [],
			sessionId: 's1',
			durationMs: SESSION_MS
		});
		const definitionOf = (id: string) => CHANGES_EXERCISES.find((d) => d.id === id)!;
		const served = SERVED.map(([, , , , , , , , decided, success], round) => {
			const now = 1_800_000_000_000 + round * 3000;
			const planned: PlannedItem = source.next({ now, elapsedMs: round * 3000, fatigued: false })!;
			const passage = planned.passage!;
			source.record(
				responseAttempt({
					sessionId: 's1',
					exerciseId: planned.exerciseId,
					skill: planned.skill,
					cardKey: cardKey(planned.skill, 'round'),
					phase: 'free',
					temperature: 'hot',
					aid: planned.aid,
					promptedAt: now,
					tempoBpm: 80,
					leadBeats: null,
					timingOffsetMs: success ? 0 : null,
					reactionMs: success ? 100 : null,
					correct: success,
					verdict: success ? 'perfect' : 'wrong',
					data: {
						item: planned.item,
						passage: {
							id: passage.id,
							index: passage.index,
							rank: passage.rank,
							each: passage.each
						},
						answer: decided === null ? null : { decided },
						confusion: null
					},
					observations: []
				}),
				now
			);
			const [{ content }] = roundMemberContents(definitionOf(planned.exerciseId), planned);
			return [
				planned.exerciseId,
				keyOf(definitionOf(planned.exerciseId), planned.item),
				planned.scope ?? null,
				planned.countIn ?? null,
				planned.restBars ?? null,
				(passage.each.direction as string | undefined) ?? null,
				(passage.each.zone as [number, number] | undefined) ?? null,
				passage.previous,
				decided,
				memberJudge.judge(content, { decided }).correct
			];
		});
		expect(served).toEqual(SERVED);
		// The climb turned within a passage, and the link rested before its second tour.
		expect(
			SERVED.some(
				(row, i) =>
					i > 0 && row[0] === 'grid-in-direction' && row[3] === null && row[5] !== SERVED[i - 1][5]
			)
		).toBe(true);
		expect(SERVED.some((row) => row[4] === 1)).toBe(true);
	});
});
