import { describe, expect, it } from 'vitest';
import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import { ZONE_FRETS, ZONE_STARTS } from '$lib/domain/gesture/passages';
import { gridChanges, triadOf } from '$lib/domain/grid';
import {
	closeTriadVoicings,
	formatSpelledNote,
	parseVoicingKey,
	qualityById,
	voicingKey,
	voicingOccurrences,
	type Chord,
	type StringNumber,
	type Voicing
} from '$lib/domain/music';
import { occurrenceId, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import { CONTENT_JUDGES, MEMBER_CONTENT, type MemberContent } from '$lib/domain/judges';
import {
	classifyGridChord,
	climbDirection,
	inZone,
	triadId,
	triadShapes,
	type ChordGridItem,
	type GestureRule
} from '$lib/domain/sets/chordGrid';
import { BLUES_F, IOHEFY_A, TRIADS_ANCHOR } from '$lib/testing/catalog';
import { admitted } from '../core/select';
import type { Filter, Selection } from '../core/types';
import { INDEX_DERIVATIONS } from '../index';
import {
	chordShapes,
	classifyChordShape,
	type ChordShape,
	type ChordShapesIndex
} from './chordShapes';

const ANCHOR_VOICINGS: readonly Voicing[] = (TRIADS_ANCHOR.items ?? []).map((entry) =>
	parseVoicingKey(itemEntryKey(entry))
);

function indexOf(voicing: Voicing, withDegrees = true): ChordShapesIndex {
	return {
		chord: voicing.chord,
		strings: voicing.strings.map((s) => s.string),
		...(withDegrees ? { degrees: voicing.strings.map((s) => s.degree) } : {})
	};
}

const C_MAJOR = parseVoicingKey('C|maj|3:1,2:3,1:5');

/** The zone of strings the changes play on, and its groups as the catalog writes them today. */
const ZONE: StringNumber[] = [4, 3, 2, 1];
const CATALOG_SETS: StringNumber[][] = [
	[3, 2, 1],
	[4, 3, 2]
];
const EVERY_SET: StringNumber[][] = [
	[3, 2, 1],
	[4, 3, 2],
	[5, 4, 3],
	[6, 5, 4]
];
const SHAPES: Selection = { family: 'chord-shapes' };

/** The triads of every change of the two public grids, once each. */
const GRID_CHORDS: readonly Chord[] = [
	...new Map(
		[IOHEFY_A, BLUES_F]
			.flatMap((grid) => gridChanges(grid).map((change) => triadOf(change.symbol)))
			.map((chord) => [triadId(chord), chord] as const)
	).values()
];

/** A triad as a symbol `triadOf` reads back. */
const formatChord = (chord: Chord) =>
	`${formatSpelledNote(chord.root)}${chord.quality.id === 'min' ? 'm' : ''}`;

describe('chord-shapes members', () => {
	it('gives, for every voicing of the anchor, the shapes of that voicing', () => {
		expect(ANCHOR_VOICINGS).toHaveLength(144);
		for (const voicing of ANCHOR_VOICINGS) {
			expect(
				chordShapes.members(indexOf(voicing)).map((m) => m.id),
				voicingKey(voicing)
			).toEqual(voicingOccurrences(voicing).map(occurrenceId));
		}
	});

	it('gives, without degrees, the shapes of the three inversions, lowest position first', () => {
		for (const voicing of ANCHOR_VOICINGS) {
			const strings = voicing.strings.map((s) => s.string);
			const expected = triadShapes({ chord: triadId(voicing.chord), sets: [strings] }).map(
				occurrenceId
			);
			expect(chordShapes.members(indexOf(voicing, false)).map((m) => m.id)).toEqual(expected);
		}
	});

	it('gives, on a zone of strings, the shapes of each group of three, as the changes list them', () => {
		let compared = 0;
		for (const chord of GRID_CHORDS) {
			const ids = chordShapes.members({ chord, strings: ZONE }).map((m) => m.id);
			expect(ids, triadId(chord)).toEqual(
				triadShapes({ chord: triadId(chord), sets: CATALOG_SETS }).map(occurrenceId)
			);
			const groups = CATALOG_SETS.flatMap((set) =>
				closeTriadVoicings(chord, set).flatMap((v) => voicingOccurrences(v))
			);
			expect(new Set(ids)).toEqual(new Set(groups.map(occurrenceId)));
			compared++;
		}
		expect(compared).toBe(8);
		const wide = chordShapes.members({ chord: triadOf('G'), strings: [6, 5, 4, 3, 2, 1] });
		expect(new Set(wide.map((m) => m.notes.map((n) => n.string).join()))).toEqual(
			new Set(['3,2,1', '4,3,2', '5,4,3', '6,5,4'])
		);
	});

	it('gives, with degrees and frets, the one shape placed there', () => {
		const shape = 'C|maj|3:1,2:3,1:5@5-5-3';
		const placed = { ...indexOf(C_MAJOR), frets: [5, 5, 3] };
		expect(chordShapes.indexProblem(placed)).toBeNull();
		expect(chordShapes.members(placed).map((m) => m.id)).toEqual([shape]);
		const nowhere = { ...indexOf(C_MAJOR), frets: [1, 1, 1] };
		expect(chordShapes.indexProblem(nowhere)).toBeNull();
		expect(chordShapes.members(nowhere)).toEqual([]);
	});

	it('keeps the shape and its notes on each member', () => {
		const [first] = chordShapes.members(indexOf(C_MAJOR));
		const occurrence = voicingOccurrences(C_MAJOR)[0];
		expect(first.occurrence).toEqual(occurrence);
		expect(first.notes).toEqual(
			occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
		);
	});

	it('gives its attributes from the notes', () => {
		const shapes = chordShapes.members(indexOf(parseVoicingKey('C|maj|5:1,4:3,3:5')));
		const open = shapes.find((m) => m.id.endsWith('@3-2-0'))!;
		expect(chordShapes.attributes.strings(open)).toEqual([5, 4, 3]);
		expect(chordShapes.attributes.frets(open)).toEqual([3, 2, 0]);
		expect(chordShapes.attributes.position(open)).toBe(2);
		expect(chordShapes.attributes.pitch(open)).toBe(48);
		const em = chordShapes.members(indexOf(parseVoicingKey('E|min|3:b3,2:5,1:1')));
		const onOpen = em.find((m) => m.id.endsWith('@0-0-0'))!;
		expect(chordShapes.attributes.position(onOpen)).toBe(0);
	});

	it('gives no member for a chord without a playable shape, and no error', () => {
		const index: ChordShapesIndex = {
			chord: C_MAJOR.chord,
			strings: [6, 5, 4],
			degrees: ['1', '1', '1']
		};
		expect(chordShapes.indexProblem(index)).toBeNull();
		expect(chordShapes.members(index)).toEqual([]);
	});

	it('refuses, without degrees, what is not a triad on three neighbouring strings or more', () => {
		const seventh = {
			chord: { root: triadOf('C').root, quality: qualityById('7') },
			strings: [4, 3, 2, 1] as StringNumber[]
		};
		const problem = 'chord-shapes needs three neighbouring strings or more and a triad';
		expect(chordShapes.indexProblem(seventh)).toBe(problem);
		expect(chordShapes.members(seventh)).toEqual([]);
		for (const strings of [
			[5, 3, 1],
			[2, 1],
			[1, 2, 3],
			[4, 3, 3, 2],
			[7, 6, 5]
		]) {
			const index = { chord: triadOf('C'), strings: strings as StringNumber[] };
			expect(chordShapes.indexProblem(index), `${strings}`).toBe(problem);
			expect(chordShapes.members(index)).toEqual([]);
		}
		expect(chordShapes.indexProblem({ chord: triadOf('C'), strings: ZONE })).toBeNull();
		expect(chordShapes.indexProblem(null)).not.toBeNull();
		expect(chordShapes.members(null as unknown as ChordShapesIndex)).toEqual([]);
	});

	it('reads frets only with degrees, one fret per string', () => {
		const withFrets = {
			chord: triadOf('C'),
			strings: [3, 2, 1] as StringNumber[],
			frets: [5, 5, 3]
		};
		expect(chordShapes.indexProblem(withFrets)).toBe('chord-shapes reads frets only with degrees');
		expect(chordShapes.indexProblem({ ...indexOf(C_MAJOR), frets: [5, 5] })).toBe(
			'chord-shapes needs one fret per string'
		);
		expect(chordShapes.indexProblem({ ...indexOf(C_MAJOR), frets: [5, 5, 'x'] })).toBe(
			'chord-shapes needs one fret per string'
		);
	});
});

describe('chord-shapes member', () => {
	it('gives a shape back from its id, of any index', () => {
		for (const shape of chordShapes.members(indexOf(C_MAJOR, false))) {
			expect(chordShapes.member(shape.id)).toEqual(shape);
		}
		expect(chordShapes.member('C|maj|3:1,2:3,1:5@1-1-1')).toBeNull();
		expect(chordShapes.member('not a shape')).toBeNull();
	});
});

describe('chord-shapes selection', () => {
	const FILTERS: readonly Filter[] = [
		{ in: { frets: [3, 7] } },
		{ at: 5 },
		{ position: { beyond: 'previous', toward: 'up', turns: true } },
		{ other: 'previous' }
	];
	const index = indexOf(C_MAJOR, false);
	const select = (where: readonly Filter[], previous: ChordShape | null) =>
		admitted(chordShapes, index, { family: 'chord-shapes', where }, { previous }).map((m) => m.id);

	it('gives the same shapes whatever order the filters are written in', () => {
		const G = chordShapes.members(indexOf(parseVoicingKey('G|maj|3:1,2:3,1:5'), false));
		const previousShapes = [null, ...chordShapes.members(index), ...G];
		let compared = 0;
		for (const a of FILTERS) {
			for (const b of FILTERS) {
				for (const previous of previousShapes) {
					expect(select([a, b], previous), JSON.stringify([a, b, previous?.id])).toEqual(
						select([b, a], previous)
					);
					compared++;
				}
			}
		}
		expect(compared).toBeGreaterThan(100);
	});

	it('admits at a fret the shape that covers it, between its lowest and its highest fret', () => {
		const voicing = indexOf(C_MAJOR);
		const at = (fret: number) =>
			admitted(chordShapes, voicing, { family: 'chord-shapes', where: [{ at: fret }] }).map(
				(m) => m.id
			);
		const shape = 'C|maj|3:1,2:3,1:5@5-5-3';
		expect(at(3)).toEqual([shape]);
		expect(at(4)).toEqual([shape]);
		expect(at(5)).toEqual([shape]);
		expect(at(6)).toEqual([]);
	});

	it('admits a shape on open strings at fret 0 only, not its octave', () => {
		const eMinor = indexOf(parseVoicingKey('E|min|3:b3,2:5,1:1'));
		const at = (fret: number) =>
			admitted(chordShapes, eMinor, { family: 'chord-shapes', where: [{ at: fret }] }).map(
				(m) => m.id
			);
		expect(at(0)).toEqual(['E|min|3:b3,2:5,1:1@0-0-0']);
		expect(at(1)).toEqual([]);
		expect(at(12)).toEqual(['E|min|3:b3,2:5,1:1@12-12-12']);
	});

	it('keeps the previous shape when it is the only one covering the fret, in either order', () => {
		const shapes = chordShapes.members(index);
		const only = shapes.find(
			(shape) =>
				shapes.filter((other) => other.notes.some((n) => n.fret === 12)).length === 1 &&
				shape.notes.some((n) => n.fret === 12)
		)!;
		expect(only).toBeDefined();
		expect(select([{ at: 12 }, { other: 'previous' }], only)).toEqual([only.id]);
		expect(select([{ other: 'previous' }, { at: 12 }], only)).toEqual([only.id]);
	});
});

describe('chord-shapes recognise', () => {
	it('recognises the admitted shape the sensor decided', () => {
		const shapes = chordShapes.members(indexOf(C_MAJOR));
		expect(chordShapes.recognise(shapes, { decided: shapes[1].id })).toBe(shapes[1]);
		expect(chordShapes.recognise([shapes[0]], { decided: shapes[1].id })).toBeNull();
		expect(chordShapes.recognise(shapes, { decided: null })).toBeNull();
		expect(chordShapes.recognise(shapes, { midi: 60 })).toBeNull();
	});
});

describe('chord-shapes confusion', () => {
	/** For a voicing, payloads that bring each of the four confusions, and a right one. */
	function payloadsFor(voicing: Voicing): (string | null)[] {
		const own = voicingOccurrences(voicing).map(occurrenceId);
		const strings = voicing.strings.map((s) => s.string);
		const inversion = closeTriadVoicings(voicing.chord, strings).find(
			(v) => voicingKey(v) !== voicingKey(voicing)
		)!;
		const quality = qualityById(voicing.chord.quality.id === 'maj' ? 'min' : 'maj');
		const [other] = closeTriadVoicings({ root: voicing.chord.root, quality }, strings);
		return [
			null,
			'not a shape',
			...own,
			...voicingOccurrences(inversion).slice(0, 1).map(occurrenceId),
			...voicingOccurrences(other).slice(0, 1).map(occurrenceId)
		];
	}

	const SAMPLE = ANCHOR_VOICINGS.filter((_, i) => i % 9 === 0);

	it('tells what classifyChordShape tells when every shape of the voicing is admitted', () => {
		const kinds = new Set<string>();
		for (const voicing of SAMPLE) {
			const index = indexOf(voicing);
			const all = chordShapes.members(index);
			for (const decided of payloadsFor(voicing)) {
				const expected = classifyChordShape(voicing, null, decided).confusion;
				expect(chordShapes.confusion(index, all, { decided }), `${decided}`).toEqual(expected);
				if (expected) kinds.add(expected.kind);
			}
		}
		expect(kinds).toEqual(new Set(['none', 'other-inversion', 'other-quality']));
	});

	it('tells what classifyChordShape tells at the position of the one shape admitted', () => {
		const kinds = new Set<string>();
		for (const voicing of SAMPLE) {
			const index = indexOf(voicing);
			for (const shape of chordShapes.members(index)) {
				const position = occurrencePosition(shape.occurrence);
				for (const decided of payloadsFor(voicing)) {
					const expected = classifyChordShape(voicing, position, decided).confusion;
					expect(chordShapes.confusion(index, [shape], { decided }), `${decided}`).toEqual(
						expected
					);
					if (expected) kinds.add(expected.kind);
				}
			}
		}
		expect(kinds).toEqual(new Set(['none', 'other-inversion', 'other-quality', 'other-octave']));
	});

	it('tells, without degrees, no chord, another chord, quality or set, then what refused it', () => {
		const index: ChordShapesIndex = { chord: C_MAJOR.chord, strings: ZONE };
		const all = chordShapes.members(index);
		const confusion = (decided: string | null, refused?: Filter | null) =>
			chordShapes.confusion(index, all, { decided }, refused);
		const kind = (k: string) => ({ kind: k, part: 'chord' });
		const first = (key: string) => occurrenceId(voicingOccurrences(parseVoicingKey(key))[0]);
		expect(confusion(null)).toEqual(kind('none'));
		expect(confusion('not a shape')).toEqual(kind('none'));
		expect(confusion(first('D|maj|3:1,2:3,1:5'))).toEqual(kind('other-chord'));
		expect(confusion(first('C|min|3:1,2:b3,1:5'))).toEqual(kind('other-quality'));
		expect(confusion(first('C|maj|5:1,4:3,3:5'))).toEqual(kind('other-set'));
		expect(confusion(all[0].id)).toBeNull();
		expect(confusion(all[0].id, { in: { frets: [1, 5] } })).toEqual(kind('out-of-zone'));
		expect(confusion(all[0].id, { at: 7 })).toEqual(kind('out-of-zone'));
		const position = (toward: 'up' | 'down'): Filter => ({
			position: { beyond: 'previous', toward, turns: true }
		});
		expect(confusion(all[0].id, position('up'))).toEqual(kind('not-higher'));
		expect(confusion(all[0].id, position('down'))).toEqual(kind('not-lower'));
		expect(confusion(all[0].id, { other: 'previous' })).toBeNull();
	});

	it('tells, for a placed shape, another shape of the chord on its strings', () => {
		const index = { ...indexOf(C_MAJOR), frets: [5, 5, 3] };
		const placed = chordShapes.members(index);
		const confusion = (decided: string | null) => chordShapes.confusion(index, placed, { decided });
		const kind = (k: string) => ({ kind: k, part: 'chord' });
		const first = (key: string) => occurrenceId(voicingOccurrences(parseVoicingKey(key))[0]);
		expect(confusion(null)).toEqual(kind('none'));
		expect(confusion(first('D|maj|3:1,2:3,1:5'))).toEqual(kind('other-chord'));
		expect(confusion(first('C|min|3:1,2:b3,1:5'))).toEqual(kind('other-quality'));
		expect(confusion(first('C|maj|4:1,3:3,2:5'))).toEqual(kind('other-set'));
		expect(confusion(first('C|maj|3:3,2:5,1:1'))).toEqual(kind('other-shape'));
		expect(confusion('C|maj|3:1,2:3,1:5@17-17-15')).toEqual(kind('other-shape'));
		expect(confusion(placed[0].id)).toBeNull();
	});
});

describe('chord-shapes heard', () => {
	it('gives the member of the index the sensor decided, admitted or not', () => {
		const index: ChordShapesIndex = { chord: C_MAJOR.chord, strings: ZONE };
		for (const shape of chordShapes.members(index)) {
			expect(chordShapes.heard(index, { decided: shape.id })).toEqual(shape);
		}
		const minor = occurrenceId(voicingOccurrences(parseVoicingKey('C|min|3:1,2:b3,1:5'))[0]);
		expect(chordShapes.heard(index, { decided: minor })).toBeNull();
		expect(chordShapes.heard(index, { decided: null })).toBeNull();
		expect(chordShapes.heard(index, { midi: 60 })).toBeNull();
	});
});

describe('chord-shapes judged as the changes are', () => {
	/** A change of a grid as the gesture selector builds it, for the old judge. */
	function change(
		symbol: string,
		rule: GestureRule,
		overrides: Partial<ChordGridItem>
	): ChordGridItem {
		return {
			rule,
			element: `${rule}:test`,
			passageId: 's:0',
			index: 0,
			changes: [{ at: 0, length: 4, symbol }],
			symbol,
			chord: triadId(triadOf(symbol)),
			sets: CATALOG_SETS,
			previous: null,
			...overrides
		};
	}

	/** Every shape of the chord, of its other quality and of another root, on every group; and none. */
	function payloads(chord: Chord): (string | null)[] {
		const quality = qualityById(chord.quality.id === 'maj' ? 'min' : 'maj');
		const other = triadOf(chord.root.letter === 'A' ? 'B' : 'A');
		return [
			null,
			...[chord, { root: chord.root, quality }, other].flatMap((c) =>
				EVERY_SET.flatMap((set) =>
					closeTriadVoicings(c, set).flatMap((v) => voicingOccurrences(v).map(occurrenceId))
				)
			)
		];
	}

	const kinds = new Set<string>();

	function compare(item: ChordGridItem, content: MemberContent, chord: Chord): number {
		let compared = 0;
		for (const decided of payloads(chord)) {
			const old = classifyGridChord(item, decided === null ? null : occurrenceOfId(decided));
			const judged = CONTENT_JUDGES[MEMBER_CONTENT].judge(content, { decided });
			expect(
				{ correct: judged.correct, confusion: judged.confusion },
				`${item.rule} ${item.chord} ${item.direction ?? ''} ${item.previous} ${decided}`
			).toEqual({ correct: old === null, confusion: old });
			if (old) kinds.add(old.kind);
			compared++;
		}
		return compared;
	}

	it('judges a link change as classifyGridChord does', () => {
		let compared = 0;
		for (const chord of GRID_CHORDS) {
			for (const set of CATALOG_SETS) {
				for (const voicing of closeTriadVoicings(chord, set)) {
					const [first] = voicingOccurrences(voicing);
					const placed = {
						voicing: voicingKey(voicing),
						frets: first.notes.map((n) => n.fret)
					};
					const item = change(formatChord(chord), 'link', {
						sets: [set],
						shape: occurrenceId(first)
					});
					const index = INDEX_DERIVATIONS.placed.index(placed, { of: {}, params: {} });
					compared += compare(item, { family: 'chord-shapes', index, selection: SHAPES }, chord);
				}
			}
		}
		expect(compared).toBeGreaterThan(1000);
	});

	it('judges a climb change as classifyGridChord does, its direction turned as the session turns it', () => {
		let compared = 0;
		for (const chord of GRID_CHORDS) {
			for (const set of CATALOG_SETS) {
				const shapes = triadShapes({ chord: triadId(chord), sets: [set] });
				const elsewhere = triadShapes({ chord: triadId(triadOf('Bb')), sets: [set] });
				const previouses = [
					null,
					shapes[0],
					shapes[Math.floor(shapes.length / 2)],
					shapes.at(-1)!,
					elsewhere[1]
				];
				for (const toward of ['up', 'down'] as const) {
					for (const before of previouses) {
						const previous = before === null ? null : occurrenceId(before);
						const asked = change(formatChord(chord), 'climb', {
							sets: [set],
							direction: toward,
							previous
						});
						const item = { ...asked, direction: climbDirection(asked) };
						const content: MemberContent = {
							family: 'chord-shapes',
							index: { chord, strings: set },
							selection: {
								family: 'chord-shapes',
								where: [{ position: { beyond: 'previous', toward, turns: true } }]
							},
							previous
						};
						compared += compare(item, content, chord);
					}
				}
			}
		}
		expect(compared).toBeGreaterThan(1000);
	});

	it('judges a zone change as classifyGridChord does', () => {
		let compared = 0;
		for (const chord of GRID_CHORDS) {
			for (const from of ZONE_STARTS.filter((_, i) => i % 3 === 0)) {
				const zone = { from, to: from + ZONE_FRETS - 1 };
				const item = change(formatChord(chord), 'zone', { zone });
				const content: MemberContent = {
					family: 'chord-shapes',
					index: { chord, strings: ZONE },
					selection: { family: 'chord-shapes', where: [{ in: { frets: [zone.from, zone.to] } }] }
				};
				compared += compare(item, content, chord);
			}
		}
		expect(compared).toBeGreaterThan(1000);
	});

	it('judges a jam change as classifyGridChord does', () => {
		let compared = 0;
		for (const chord of GRID_CHORDS) {
			const item = change(formatChord(chord), 'jam', {});
			const content: MemberContent = {
				family: 'chord-shapes',
				index: { chord, strings: ZONE },
				selection: SHAPES
			};
			compared += compare(item, content, chord);
		}
		expect(compared).toBeGreaterThan(300);
	});

	it('met every confusion of the changes', () => {
		expect(kinds).toEqual(
			new Set([
				'none',
				'other-chord',
				'other-quality',
				'other-set',
				'other-shape',
				'not-higher',
				'not-lower',
				'out-of-zone'
			])
		);
	});
});

describe('chord-shapes filter in', () => {
	const SETS: readonly StringNumber[][] = [
		[3, 2, 1],
		[4, 3, 2],
		[5, 4, 3],
		[6, 5, 4]
	];

	it('admits in a zone what the gesture zone admits, open strings included', () => {
		const symbols = new Set(
			[IOHEFY_A, BLUES_F].flatMap((grid) => gridChanges(grid).map((change) => change.symbol))
		);
		let compared = 0;
		for (const symbol of symbols) {
			const chord = triadOf(symbol);
			for (const strings of SETS) {
				const index: ChordShapesIndex = { chord, strings };
				const shapes = triadShapes({ chord: triadId(chord), sets: [strings] });
				for (const from of [0, ...ZONE_STARTS]) {
					const zone = { from, to: from + ZONE_FRETS - 1 };
					const ids = admitted(chordShapes, index, {
						family: 'chord-shapes',
						where: [{ in: { frets: [zone.from, zone.to] } }]
					}).map((m) => m.id);
					expect(ids, `${symbol} ${strings} ${from}`).toEqual(
						shapes.filter((o) => inZone(o, zone)).map(occurrenceId)
					);
					compared++;
				}
			}
		}
		expect(compared).toBeGreaterThan(100);
	});
});

describe('chord-shapes answer', () => {
	it('gives the shape decided, or none decided, as the attempt keeps it; null when unreadable', () => {
		const [shape] = chordShapes.members(indexOf(C_MAJOR));
		expect(chordShapes.answer({ decided: shape.id, candidates: [] })).toEqual({
			decided: shape.id
		});
		expect(chordShapes.answer({ decided: null })).toEqual({ decided: null });
		expect(chordShapes.answer({ midi: 60 })).toBeNull();
		expect(chordShapes.answer(null)).toBeNull();
	});
});
