/**
 * The four changes exercises judged as members of families (plan 4b, Task 4), compared with the
 * rules they replace while both exist: the passages each index plays, the judgement of every
 * shape heard on every change, what the chord sensor is told to expect, and the opening of every
 * index. Every difference is collected, never stopped at the first: a comparison fails on the
 * list of its differences, and the count of cases compared keeps an empty loop from passing.
 * With `CHANGES_DIFF_FILE` set, the full list is written there (out of the repository).
 */
import { describe, expect, it } from 'vitest';
import { gridExpectation } from '$lib/application/sets/chordGrid';
import { roundMemberContents } from '$lib/domain/exercise/passage/contents';
import {
	passageIndexKey,
	passageIndices,
	passageMembers
} from '$lib/domain/exercise/passage/indices';
import { indexOpen } from '$lib/domain/exercise/passage/opens';
import { firstEach, passageRound } from '$lib/domain/exercise/passage/round';
import type { PassageIndex } from '$lib/domain/exercise/passage/types';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { familyNamed, passageDerivation, select, type Family } from '$lib/domain/families';
import type { GridChangeMember } from '$lib/domain/families/music/gridChanges';
import { gestureElements, type GestureElement } from '$lib/domain/gesture/exercises';
import { openElements } from '$lib/domain/gesture/opening';
import { linkShapes } from '$lib/domain/gesture/passages';
import { gridById, gridChanges, triadOf, type GridChange } from '$lib/domain/grid';
import { admittedMembers, type MemberContent } from '$lib/domain/judges';
import { memberJudge } from '$lib/domain/judges/member';
import {
	closeTriadVoicings,
	formatSpelledNote,
	parseSpelledNote,
	pitchOfSpelled,
	qualityById,
	voicingOccurrences,
	type Chord,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { itemSet } from '$lib/domain/sets';
import {
	admittedShapes,
	classifyGridChord,
	climbDirection,
	parseTriadId,
	shapePosition,
	triadId,
	type ChordGridItem
} from '$lib/domain/sets/chordGrid';
import { occurrenceId, occurrenceOfId } from '$lib/domain/triads';
import type { CardState } from '$lib/domain/types';
import { cardKey } from '$lib/domain/types';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_LINK, GESTURE_ZONE, TRIAD_ORDER } from './catalog';
import {
	CLIMB_PASSAGES,
	JAM_PASSAGES,
	LINK_PASSAGES,
	ZONE_PASSAGES,
	ZONES
} from './changesPassages';

/** The four exercises: the catalog's (the old rules) and their rewriting with passages. */
const PAIRS: readonly { name: string; old: ExerciseDefinition; next: ExerciseDefinition }[] = [
	{ name: 'link', old: GESTURE_LINK, next: LINK_PASSAGES },
	{ name: 'climb', old: GESTURE_CLIMB, next: CLIMB_PASSAGES },
	{ name: 'zone', old: GESTURE_ZONE, next: ZONE_PASSAGES },
	{ name: 'jam', old: GESTURE_JAM, next: JAM_PASSAGES }
];

/** Every group of three neighbouring strings of the six, the lowest first. */
const ALL_GROUPS: readonly (readonly StringNumber[])[] = [
	[6, 5, 4],
	[5, 4, 3],
	[4, 3, 2],
	[3, 2, 1]
];

/** The two groups the four exercises play on. */
const EXERCISE_GROUPS: readonly (readonly StringNumber[])[] = [
	[3, 2, 1],
	[4, 3, 2]
];

/** The other spelling of a root that has two. */
const ENHARMONIC: Readonly<Record<string, string>> = {
	'C#': 'Db',
	Db: 'C#',
	'D#': 'Eb',
	Eb: 'D#',
	'F#': 'Gb',
	Gb: 'F#',
	'G#': 'Ab',
	Ab: 'G#',
	'A#': 'Bb',
	Bb: 'A#'
};

const SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const OTHER_QUALITY: Readonly<Record<string, string>> = { maj: 'min', min: 'maj' };

const GARBAGE = 'not a shape';

/** At most this many differences are printed by a failing comparison. */
const PRINTED = 20;

interface Difference {
	kind: string;
	example: unknown;
}

/** Every difference found, by comparison, written out at the end when asked. */
const FOUND: Record<string, Difference[]> = {};

function recorder(comparison: string) {
	const list: Difference[] = (FOUND[comparison] = []);
	return {
		list,
		add(kind: string, example: unknown) {
			list.push({ kind, example });
		}
	};
}

/** The differences by kind: how many, and the first of each. */
function byKind(list: readonly Difference[]) {
	const kinds = new Map<string, { count: number; first: unknown }>();
	for (const { kind, example } of list) {
		const found = kinds.get(kind);
		if (found) found.count++;
		else kinds.set(kind, { count: 1, first: example });
	}
	return Object.fromEntries(kinds);
}

function report(list: readonly Difference[]): string {
	return `${list.length} differences; by kind: ${JSON.stringify(
		Object.fromEntries(Object.entries(byKind(list)).map(([kind, { count }]) => [kind, count]))
	)}; first ${PRINTED}:\n${list
		.slice(0, PRINTED)
		.map((d) => JSON.stringify(d))
		.join('\n')}`;
}

/** What was recorded without being asserted: the counts compared, the old sensor's candidates by kind. */
const INFO: Record<string, unknown> = {};

/** Node's file system, out of the app's types (the specs carry no Node types). */
const FILE_SYSTEM: string = 'node:fs';

async function writeFound(): Promise<void> {
	const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
		?.env;
	const file = env?.CHANGES_DIFF_FILE;
	if (!file) return;
	const summary = Object.fromEntries(
		Object.entries(FOUND).map(([comparison, list]) => [
			comparison,
			{ total: list.length, kinds: byKind(list), all: list }
		])
	);
	const { writeFileSync } = (await import(/* @vite-ignore */ FILE_SYSTEM)) as {
		writeFileSync(path: string, text: string): void;
	};
	writeFileSync(file, JSON.stringify({ info: INFO, ...summary }, null, 1));
}

const chordOf = (root: string, quality: string): Chord => ({
	root: parseSpelledNote(root),
	quality: qualityById(quality)
});

/** Every shape of `chord` on `groups`, as the old judge's triad shapes list them: lowest first. */
function shapesOn(chord: Chord, groups: readonly (readonly StringNumber[])[]): VoicingOccurrence[] {
	return groups
		.flatMap((group) => closeTriadVoicings(chord, group).flatMap((v) => voicingOccurrences(v)))
		.sort((a, b) => shapePosition(a) - shapePosition(b));
}

const idsOn = (chord: Chord, groups: readonly (readonly StringNumber[])[]) =>
	shapesOn(chord, groups).map(occurrenceId);

/** A root `semitones` above `root`'s pitch, sharp-spelled. */
function rootAbove(root: Chord['root'], semitones: number): string {
	const from = SHARP_ROOTS.indexOf(pitchOfSpelled(root));
	return SHARP_ROOTS[(from + semitones) % 12];
}

/** A payload with the kind it stands for. */
interface Payload {
	decided: string | null;
	tag: string;
}

const payloadCache = new Map<string, Payload[]>();

/**
 * Every payload a change of `chord` is judged on: each shape on every group of the six strings of
 * the chord, of its other quality, of two other roots, of the chord spelled the other way; none
 * decided; a garbage id.
 */
function payloadsFor(chord: Chord): Payload[] {
	const key = triadId(chord);
	const cached = payloadCache.get(key);
	if (cached) return cached;
	const root = formatSpelledNote(chord.root);
	const quality = chord.quality.id;
	const tagged = (tag: string, other: Chord) =>
		idsOn(other, ALL_GROUPS).map((decided): Payload => ({ decided, tag }));
	const payloads: Payload[] = [
		...tagged('asked', chord),
		...tagged('other-quality', chordOf(root, OTHER_QUALITY[quality])),
		...tagged('other-root', chordOf(rootAbove(chord.root, 2), quality)),
		...tagged('other-root', chordOf(rootAbove(chord.root, 7), quality)),
		...(Object.hasOwn(ENHARMONIC, root)
			? tagged('enharmonic', chordOf(ENHARMONIC[root], quality))
			: []),
		{ decided: null, tag: 'null' },
		{ decided: GARBAGE, tag: 'garbage' }
	];
	payloadCache.set(key, payloads);
	return payloads;
}

const heardCache = new Map<string, VoicingOccurrence | null>();
function heardOf(decided: string | null): VoicingOccurrence | null {
	if (decided === null) return null;
	if (!heardCache.has(decided)) heardCache.set(decided, occurrenceOfId(decided));
	return heardCache.get(decided)!;
}

/** The chord symbol a link element names, as a chart writes it: `C#m`. */
function linkSymbol(chord: string): string {
	const { root, quality } = parseTriadId(chord);
	return formatSpelledNote(root) + quality.suffix;
}

/** The new index an old element corresponds to, by its key. */
function correspondingKey(element: GestureElement): string {
	switch (element.rule) {
		case 'link':
			return passageIndexKey({ chord: linkSymbol(element.chord!), strings: element.sets[0] });
		case 'climb':
			return passageIndexKey({ grid: element.gridId, strings: element.sets[0] });
		default:
			return passageIndexKey({ grid: element.gridId });
	}
}

/** A change of an old passage: its rank, symbol, length and, for the link, the shape asked. */
interface OldChange {
	key: string;
	symbol: string;
	length: number;
	shape?: string;
}

const LINK_BAR_BEATS = 4;

/** The changes the old selector builds for an element's passage. */
function oldPassage(element: GestureElement): { changes: GridChange[]; rounds: OldChange[] } {
	if (element.rule === 'link') {
		const shapes = linkShapes(parseTriadId(element.chord!), element.sets[0]).map(occurrenceId);
		const symbol = linkSymbol(element.chord!);
		const changes = shapes.map((_, i) => ({
			at: i * LINK_BAR_BEATS,
			length: LINK_BAR_BEATS,
			symbol
		}));
		return {
			changes,
			rounds: shapes.map((shape) => ({ key: shape, symbol, length: LINK_BAR_BEATS, shape }))
		};
	}
	const changes = gridChanges(gridById(element.gridId!));
	return {
		changes,
		rounds: changes.map((change, rank) => ({
			key: `${element.gridId}#${rank}`,
			symbol: change.symbol,
			length: change.length
		}))
	};
}

/** The new passage of an index: each member's item key, and its symbol and length for a grid. */
function newPassage(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each = firstEach(definition)
) {
	const derivation = passageDerivation(definition.passages!.members.family)!;
	const set = itemSet(derivation.set);
	const members = passageMembers(definition, index, each);
	return members.map((member) => {
		const item = derivation.itemOf(member);
		const change = member as Partial<GridChangeMember>;
		return { item, key: set.itemKey(item), symbol: change.symbol, length: change.length };
	});
}

/** The member contents of a round of the new passage, `previous` heard before it. */
function newContents(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Readonly<Record<string, unknown>>,
	item: unknown,
	rank: number,
	length: number,
	previous: string | null
): MemberContent[] {
	const round = passageRound(definition, index, each, item, rank, length);
	const served = { ...round, passage: { ...round.passage, id: 'p', previous } };
	return roundMemberContents(definition, served).map(({ content }) => content);
}

/** What the old rule needs of a change beyond its element and passage. */
interface Context {
	previous: string | null;
	/** Which kind of previous: none, the chord before, another chord. */
	from: 'none' | 'chord-before' | 'other-chord';
	direction?: 'up' | 'down';
	zone?: readonly [number, number];
}

/** A chord none of the passages plays before the change: F# major, else B major. */
function otherChord(asked: Chord): Chord {
	return pitchOfSpelled(asked.root) === 'F#' && asked.quality.id === 'maj'
		? chordOf('B', 'maj')
		: chordOf('F#', 'maj');
}

/** One change of one passage, old and new, to judge in every context. */
interface Case {
	exercise: string;
	element: GestureElement;
	index: PassageIndex;
	rank: number;
	oldChanges: GridChange[];
	oldRound: OldChange;
	newItem: unknown;
	length: number;
	/** The triad asked, root as spelled. */
	chord: Chord;
	/** The triad of the change before in the passage; null on the first. */
	before: Chord | null;
}

function casesOf(name: string, old: ExerciseDefinition, next: ExerciseDefinition): Case[] {
	const indices = new Map(passageIndices(next).map((index) => [index.key, index]));
	return gestureElements(old).flatMap((element) => {
		const index = indices.get(correspondingKey(element))!;
		const { changes, rounds } = oldPassage(element);
		const members = newPassage(next, index);
		return rounds.map((oldRound, rank): Case => {
			const chord =
				element.rule === 'link' ? parseTriadId(element.chord!) : triadOf(changes[rank].symbol);
			const before =
				rank === 0 ? null : element.rule === 'link' ? chord : triadOf(changes[rank - 1].symbol);
			return {
				exercise: name,
				element,
				index,
				rank,
				oldChanges: changes,
				oldRound,
				newItem: members[rank].item,
				length: members.length,
				chord,
				before
			};
		});
	});
}

/** The old item of a change in a context, as the selector builds it (a climb turned first). */
function oldItem(c: Case, context: Context): ChordGridItem {
	const { element } = c;
	const chord = element.rule === 'link' ? element.chord! : triadId(c.chord);
	const item: ChordGridItem = {
		rule: element.rule,
		element: element.key,
		passageId: 'p',
		index: c.rank,
		changes: c.oldChanges,
		symbol: c.oldRound.symbol,
		chord,
		sets: element.sets,
		...(c.oldRound.shape && { shape: c.oldRound.shape }),
		...(context.direction && { direction: context.direction }),
		...(context.zone && { zone: { from: context.zone[0], to: context.zone[1] } }),
		previous: context.previous
	};
	return item.rule === 'climb' ? { ...item, direction: climbDirection(item) } : item;
}

/** The passage params of a change in a context. */
function eachOf(c: Case, context: Context): Record<string, unknown> {
	if (context.direction) return { direction: context.direction };
	if (context.zone) return { zone: context.zone };
	return {};
}

/** Every previous a change is judged after: none, each shape of the chord before, of another chord. */
function previousesOf(c: Case): Pick<Context, 'previous' | 'from'>[] {
	return [
		{ previous: null, from: 'none' },
		...(c.before ? idsOn(c.before, EXERCISE_GROUPS) : []).map((previous) => ({
			previous,
			from: 'chord-before' as const
		})),
		...idsOn(otherChord(c.chord), EXERCISE_GROUPS).map((previous) => ({
			previous,
			from: 'other-chord' as const
		}))
	];
}

/** Every context of a change: its previouses, times both directions (climb) or every zone (zone). */
function contextsOf(c: Case): Context[] {
	const previouses = previousesOf(c);
	switch (c.element.rule) {
		case 'climb':
			return (['up', 'down'] as const).flatMap((direction) =>
				previouses.map((p) => ({ ...p, direction }))
			);
		case 'zone':
			return ZONES.flatMap((zone) => previouses.map((p) => ({ ...p, zone })));
		default:
			return previouses;
	}
}

const ALL_CASES: Case[] = PAIRS.flatMap(({ name, old, next }) => casesOf(name, old, next));

/** A compact view of an old item for a report: its changes left out. */
function shown(item: ChordGridItem) {
	const { changes: _changes, ...rest } = item;
	return rest;
}

const sameConfusion = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const TIMEOUT = 120_000;

describe('the changes judged as members, compared with the rules they replace', () => {
	describe('A. passages', () => {
		const found = recorder('A');
		let indices = 0;
		let rounds = 0;
		for (const { name, old, next } of PAIRS) {
			it(`${name}: every element has its index, in the same order, with the same rounds`, () => {
				const elements = gestureElements(old);
				const expectedKeys = elements.map(correspondingKey);
				const newIndices = passageIndices(next);
				const newKeys = newIndices.map((index) => index.key);
				if (expectedKeys.join('|') !== newKeys.join('|')) {
					found.add(`${name}: indices or their order`, { old: expectedKeys, next: newKeys });
				}
				expect(new Set(newKeys).size).toBe(newKeys.length);
				for (const element of elements) {
					const index = newIndices.find((each) => each.key === correspondingKey(element));
					if (!index) {
						found.add(`${name}: no index`, element.key);
						continue;
					}
					indices++;
					const oldRounds = oldPassage(element).rounds;
					const eaches =
						name === 'zone'
							? ZONES.map((zone) => ({ zone }))
							: name === 'climb'
								? [{ direction: 'up' }, { direction: 'down' }]
								: [firstEach(next)];
					for (const each of eaches) {
						const newRounds = newPassage(next, index, each);
						// A link's member is a placed shape: its key alone (its bar is the round's length).
						const view = (r: { key: string; symbol?: string; length?: number }) =>
							name === 'link' ? r.key : [r.key, r.symbol, r.length].join(' ');
						const oldView = oldRounds.map(view);
						const newView = newRounds.map(view);
						rounds += oldRounds.length;
						if (oldView.join('|') !== newView.join('|')) {
							found.add(`${name}: rounds`, {
								element: element.key,
								each,
								old: oldView,
								next: newView
							});
						}
					}
				}
				const counts = { link: 48, climb: 4, zone: 2, jam: 2 }[name]!;
				expect(elements).toHaveLength(counts);
				expect(newIndices).toHaveLength(counts);
				expect(found.list, report(found.list)).toEqual([]);
			});
		}
		it('compared every index and round', () => {
			INFO.A = { indices, rounds };
			expect(indices).toBe(56);
			expect(rounds).toBeGreaterThan(48 * 7 + 4 * 9 * 2 + 2 * 9 * 13 + 2 * 9 - 1);
		});
	});

	describe('B. judgement', () => {
		const found = recorder('B');
		const turns = recorder('B-turn');
		const served = recorder('B-served');
		const counted: Record<string, number> = {};
		let turnCases = 0;
		let servedCases = 0;
		for (const { name } of PAIRS) {
			it(
				`${name}: every shape heard on every change, in every context`,
				() => {
					const next = PAIRS.find((pair) => pair.name === name)!.next;
					const family = familyNamed('chord-shapes') as Family;
					let cases = 0;
					for (const c of ALL_CASES.filter((each) => each.exercise === name)) {
						const payloads = payloadsFor(c.chord);
						for (const context of contextsOf(c)) {
							const item = oldItem(c, context);
							const each = eachOf(c, context);
							const contents = newContents(
								next,
								c.index,
								each,
								c.newItem,
								c.rank,
								c.length,
								context.previous
							);
							expect(contents).toHaveLength(1);
							const [content] = contents;
							if (name === 'climb') {
								// The direction the new path applies: turned where `select` turned.
								const previous = context.previous === null ? null : family.member(context.previous);
								const turned =
									previous !== null &&
									select(family, content.index, content.selection, { previous }).turned;
								const applied = turned
									? context.direction === 'up'
										? 'down'
										: 'up'
									: context.direction;
								turnCases++;
								if (applied !== item.direction) {
									turns.add('climb: direction turned', {
										item: shown(item),
										asked: context.direction,
										applied
									});
								}
								// And the content as the source serves it, its direction turned.
								const [turnedContent] = newContents(
									next,
									c.index,
									{ direction: applied },
									c.newItem,
									c.rank,
									c.length,
									context.previous
								);
								for (const payload of payloads) {
									const heard = heardOf(payload.decided);
									const expected = classifyGridChord(item, heard);
									const got = memberJudge.judge(turnedContent, { decided: payload.decided });
									servedCases++;
									if (
										got.correct !== (expected === null) ||
										!sameConfusion(got.confusion, expected)
									) {
										served.add(`climb served: ${payload.tag}`, {
											item: shown(item),
											content: turnedContent,
											payload: payload.decided,
											old: expected,
											next: { correct: got.correct, confusion: got.confusion }
										});
									}
								}
							}
							for (const payload of payloads) {
								const heard = heardOf(payload.decided);
								const expected = classifyGridChord(item, heard);
								const got = memberJudge.judge(content, { decided: payload.decided });
								cases++;
								const correctDiffers = got.correct !== (expected === null);
								if (correctDiffers || !sameConfusion(got.confusion, expected)) {
									found.add(
										`${name}: ${payload.tag}: ${correctDiffers ? 'correct' : 'confusion'} (${
											expected?.kind ?? 'right'
										} → ${
											got.correct
												? 'right'
												: ((got.confusion as { kind?: string } | null)?.kind ?? 'null')
										})`,
										{
											item: shown(item),
											context: context.from,
											content,
											payload: payload.decided,
											old: expected,
											next: { correct: got.correct, confusion: got.confusion }
										}
									);
								}
							}
						}
					}
					counted[name] = cases;
					INFO[`B.${name}`] = cases;
					const floor = {
						link: 48 * 7 * 100,
						climb: 4 * 9 * 2 * 100,
						zone: 2 * 9 * 13 * 100,
						jam: 2 * 9 * 100
					}[name]!;
					expect(cases).toBeGreaterThan(floor);
				},
				TIMEOUT
			);
		}
		it('the direction a climb turns to is climbDirection’s', () => {
			INFO['B.turn'] = turnCases;
			expect(turnCases).toBeGreaterThan(4 * 9 * 2 * 10);
			expect(turns.list, report(turns.list)).toEqual([]);
		});
		it('a climb served with its direction turned judges as the old rule', () => {
			INFO['B.served'] = servedCases;
			expect(servedCases).toBeGreaterThan(4 * 9 * 2 * 1000);
			expect(served.list, report(served.list)).toEqual([]);
		});
		it('every judgement equals the old one, a root spelled the other way included', () => {
			expect(Object.keys(counted)).toHaveLength(4);
			expect(found.list, report(found.list)).toEqual([]);
		});
		it('a root spelled the other way names the same shapes: a voicing key spells its root one way', () => {
			const roots = Object.keys(ENHARMONIC);
			for (const root of roots) {
				for (const quality of ['maj', 'min']) {
					const other = chordOf(ENHARMONIC[root], quality);
					expect(idsOn(other, ALL_GROUPS)).toEqual(idsOn(chordOf(root, quality), ALL_GROUPS));
				}
			}
			expect(roots).toHaveLength(10);
		});
	});

	describe('C. the chord sensor', () => {
		const admittedFound = recorder('C-admitted');
		const expectedFound = recorder('C-expected');
		const candidates: Record<string, number> = {};
		let cases = 0;
		it(
			'the members admitted are the shapes the old rule admits, in order',
			() => {
				for (const { name, next } of PAIRS) {
					for (const c of ALL_CASES.filter((each) => each.exercise === name)) {
						const previouses: Pick<Context, 'previous' | 'from'>[] = [
							{ previous: null, from: 'none' },
							...(c.before
								? [{ previous: idsOn(c.before, EXERCISE_GROUPS)[0], from: 'chord-before' as const }]
								: [])
						];
						const contexts = contextsOf(c).filter((context) =>
							previouses.some((p) => p.previous === context.previous && p.from === context.from)
						);
						for (const context of contexts) {
							const item = oldItem(c, context);
							const [content] = newContents(
								next,
								c.index,
								eachOf(c, context),
								c.newItem,
								c.rank,
								c.length,
								context.previous
							);
							const admitted = admittedMembers(content).map((member) => member.id);
							const oldAdmitted = admittedShapes(item).map(occurrenceId);
							const expectation = gridExpectation(item, 0);
							cases++;
							for (const candidate of expectation.candidates) {
								candidates[candidate.kind] = (candidates[candidate.kind] ?? 0) + 1;
							}
							const example = {
								item: shown(item),
								content,
								admitted,
								oldAdmitted,
								expected: expectation.expected
							};
							if (admitted.join('|') !== oldAdmitted.join('|')) {
								admittedFound.add(
									`${name}: ${
										[...admitted].sort().join('|') === [...oldAdmitted].sort().join('|')
											? 'order'
											: 'ids'
									}`,
									example
								);
							}
							if (admitted.join('|') !== expectation.expected.join('|')) {
								const ringing = admitted.filter((id) => !expectation.expected.includes(id));
								const silentOnly =
									oldAdmitted.join('|') === admitted.join('|') &&
									expectation.expected.every((id) => admitted.includes(id));
								expectedFound.add(
									`${name}: expected ${silentOnly ? `leaves out ${ringing.length} shape(s) sounding as the one ringing` : 'differs'}`,
									example
								);
							}
						}
					}
				}
				INFO.C = cases;
				expect(cases).toBeGreaterThan(48 * 7 + 4 * 9 * 2 + 2 * 9 * 13 + 2 * 9);
				expect(Object.keys(candidates).length).toBeGreaterThan(1);
				INFO.candidateKinds = candidates;
				expect(admittedFound.list, report(admittedFound.list)).toEqual([]);
			},
			TIMEOUT
		);
		// Known gap, reported (plan 4b, Task 4): the old sensor leaves out of its expected shapes
		// any shape sounding the pitches of the one still ringing (`gridExpectation`'s `silent`);
		// the members admitted keep it. Only the link meets it: the lowest shape of its chord on
		// the other group sounds as a shape of the tour, or is the shape asked again.
		it.fails('the members admitted are what the old sensor was told to expect', () => {
			expect(cases).toBeGreaterThan(0);
			expect(expectedFound.list, report(expectedFound.list)).toEqual([]);
		});
	});

	describe('D. opening', () => {
		const found = recorder('D');
		/** A tiny deterministic generator (mulberry32), seed fixed. */
		function generator(seed: number) {
			let state = seed >>> 0;
			return () => {
				state = (state + 0x6d2b79f5) >>> 0;
				let t = state;
				t = Math.imul(t ^ (t >>> 15), t | 1);
				t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
		}
		const SKILLS = ['chord-anchor', 'chord-zone'] as const;
		const KEYS = SKILLS.flatMap((skill) => TRIAD_ORDER.map((key) => cardKey(skill, key)));
		/** The cards of the anchor's list, by skill and by voicing group (a chord on a set). */
		const GROUPS = new Map<string, string[]>();
		for (const skill of SKILLS) {
			for (const key of TRIAD_ORDER) {
				const [root, quality, strings] = key.split('|');
				const group = `${skill}|${root}|${quality}|${strings
					.split(',')
					.map((s) => s.split(':')[0])
					.join()}`;
				GROUPS.set(group, [...(GROUPS.get(group) ?? []), cardKey(skill, key)]);
			}
		}
		const GROUP_LIST = [...GROUPS.values()];
		const GRID_TRIADS = ['iohefy-a', 'blues-f'].map((grid) => [
			...new Set(gridChanges(gridById(grid)).map((change) => triadId(triadOf(change.symbol))))
		]);

		/** A draw of acquired keys, of a density and structure that vary with `i`. */
		function draw(i: number, random: () => number): Set<string> {
			const keep = (p: number) => (keys: readonly string[]) => keys.filter(() => random() < p);
			switch (i % 6) {
				case 0:
					return new Set(keep(0.1)(KEYS));
				case 1:
					return new Set(keep(0.5)(KEYS));
				case 2:
					return new Set(keep(0.95)(KEYS));
				case 3: {
					// Whole groups (the inversions of a chord on a set) or none.
					const p = [0.5, 0.8, 0.95][Math.floor(random() * 3)];
					return new Set(GROUP_LIST.filter(() => random() < p).flat());
				}
				case 4: {
					// Everything but a few cards.
					const all = new Set(KEYS);
					const missing = 1 + Math.floor(random() * 3);
					for (let n = 0; n < missing; n++) all.delete(KEYS[Math.floor(random() * KEYS.length)]);
					return all;
				}
				default: {
					// A grid's triads on one or both sets in one skill, a group dropped at times.
					const triads = GRID_TRIADS[Math.floor(random() * 2)];
					const skill = SKILLS[Math.floor(random() * 2)];
					const sets = random() < 0.5 ? ['3,2,1'] : random() < 0.5 ? ['4,3,2'] : ['3,2,1', '4,3,2'];
					const keys = new Set<string>();
					for (const triad of triads) {
						for (const set of sets) {
							const group = GROUPS.get(`${skill}|${triad}|${set}`) ?? [];
							for (const key of group) keys.add(key);
						}
					}
					if (random() < 0.3) {
						const [first] = keys;
						if (first) keys.delete(first);
					}
					// Mixed: half the triads moved to the other set in the anchor.
					if (random() < 0.3) {
						triads.forEach((triad, n) => {
							const set = n % 2 === 0 ? '3,2,1' : '4,3,2';
							for (const key of GROUPS.get(`chord-anchor|${triad}|${set}`) ?? []) keys.add(key);
						});
					}
					return keys;
				}
			}
		}

		it(
			'every index opens as its element did, on 200 seeded draws',
			() => {
				const random = generator(20261119);
				const verdicts: Record<string, { open: number; closed: number }> = {};
				let cases = 0;
				for (let i = 0; i < 200; i++) {
					const acquired = draw(i, random);
					const cards = [...acquired].map(
						(key) => ({ key, acquiredAt: 1000 }) as unknown as CardState
					);
					for (const { name, old, next } of PAIRS) {
						const opened = new Set(openElements(old, cards).map((element) => element.key));
						const indices = new Map(passageIndices(next).map((index) => [index.key, index]));
						for (const element of gestureElements(old)) {
							const index = indices.get(correspondingKey(element))!;
							const was = opened.has(element.key);
							const is = indexOpen(next, index, acquired);
							cases++;
							const tally = (verdicts[name] ??= { open: 0, closed: 0 });
							if (is) tally.open++;
							else tally.closed++;
							if (was !== is) {
								found.add(`${name}: ${was ? 'was open' : 'was closed'}`, {
									draw: i,
									element: element.key,
									acquired: acquired.size
								});
							}
						}
					}
				}
				INFO.D = { cases, verdicts };
				expect(cases).toBe(200 * 56);
				for (const { name } of PAIRS) {
					expect(verdicts[name].open, name).toBeGreaterThan(0);
					expect(verdicts[name].closed, name).toBeGreaterThan(0);
				}
				expect(found.list, report(found.list)).toEqual([]);
			},
			TIMEOUT
		);

		it('writes what was found when asked', async () => {
			await writeFound();
			expect(Object.keys(FOUND).length).toBeGreaterThan(0);
		});
	});
});
