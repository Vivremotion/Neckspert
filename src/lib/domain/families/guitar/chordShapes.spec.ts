import { describe, expect, it } from 'vitest';
import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import { ZONE_FRETS, ZONE_STARTS } from '$lib/domain/gesture/passages';
import { gridChanges, triadOf } from '$lib/domain/grid';
import {
	closeTriadVoicings,
	parseVoicingKey,
	qualityById,
	voicingKey,
	voicingOccurrences,
	type StringNumber,
	type Voicing
} from '$lib/domain/music';
import { inZone } from '$lib/domain/sets/chordGrid';
import { classifyChord } from '$lib/domain/sets/triadChord';
import { occurrenceId, occurrencePosition } from '$lib/domain/triads';
import { BLUES_F, IOHEFY_A, TRIADS_ANCHOR } from '$lib/testing/catalog';
import { admitted } from '../core/select';
import type { Filter } from '../core/types';
import { chordShapes, type ChordShape, type ChordShapesIndex } from './chordShapes';

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

	it('gives, without degrees, the shapes of the three inversions', () => {
		for (const voicing of ANCHOR_VOICINGS) {
			const strings = voicing.strings.map((s) => s.string);
			const expected = closeTriadVoicings(voicing.chord, strings)
				.flatMap((v) => voicingOccurrences(v))
				.map(occurrenceId);
			expect(chordShapes.members(indexOf(voicing, false)).map((m) => m.id)).toEqual(expected);
		}
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

	it('refuses, without degrees, what is not a triad on three neighbouring strings', () => {
		const seventh = { chord: triadOf('C'), strings: [4, 3, 2, 1] as StringNumber[] };
		expect(chordShapes.indexProblem(seventh)).toBe(
			'chord-shapes needs three neighbouring strings and a triad'
		);
		expect(chordShapes.members(seventh)).toEqual([]);
		const apart = { chord: triadOf('C'), strings: [5, 3, 1] as StringNumber[] };
		expect(chordShapes.indexProblem(apart)).not.toBeNull();
		expect(chordShapes.members(apart)).toEqual([]);
		expect(chordShapes.indexProblem(null)).not.toBeNull();
		expect(chordShapes.members(null as unknown as ChordShapesIndex)).toEqual([]);
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

	it('tells what classifyChord tells when every shape of the voicing is admitted', () => {
		const kinds = new Set<string>();
		for (const voicing of SAMPLE) {
			const index = indexOf(voicing);
			const all = chordShapes.members(index);
			for (const decided of payloadsFor(voicing)) {
				const expected = classifyChord(voicing, null, decided).confusion;
				expect(chordShapes.confusion(index, all, { decided }), `${decided}`).toEqual(expected);
				if (expected) kinds.add(expected.kind);
			}
		}
		expect(kinds).toEqual(new Set(['none', 'other-inversion', 'other-quality']));
	});

	it('tells what classifyChord tells at the position of the one shape admitted', () => {
		const kinds = new Set<string>();
		for (const voicing of SAMPLE) {
			const index = indexOf(voicing);
			for (const shape of chordShapes.members(index)) {
				const position = occurrencePosition(shape.occurrence);
				for (const decided of payloadsFor(voicing)) {
					const expected = classifyChord(voicing, position, decided).confusion;
					expect(chordShapes.confusion(index, [shape], { decided }), `${decided}`).toEqual(
						expected
					);
					if (expected) kinds.add(expected.kind);
				}
			}
		}
		expect(kinds).toEqual(new Set(['none', 'other-inversion', 'other-quality', 'other-octave']));
	});

	it('tells, without degrees, only no chord or another chord', () => {
		const index = indexOf(C_MAJOR, false);
		const all = chordShapes.members(index);
		expect(chordShapes.confusion(index, all, { decided: null })).toEqual({
			kind: 'none',
			part: 'chord'
		});
		const minor = voicingOccurrences(parseVoicingKey('C|min|3:1,2:b3,1:5')).map(occurrenceId)[0];
		expect(chordShapes.confusion(index, all, { decided: minor })).toEqual({
			kind: 'other-quality',
			part: 'chord'
		});
		expect(chordShapes.confusion(index, all, { decided: all[0].id })).toBeNull();
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
				const shapes = closeTriadVoicings(chord, strings).flatMap((v) => voicingOccurrences(v));
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
