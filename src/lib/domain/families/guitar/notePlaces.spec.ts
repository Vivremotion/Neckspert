import { describe, expect, it } from 'vitest';
import { itemEntryKey } from '$lib/domain/exercise/itemEntries';
import {
	acceptableMidis,
	classifyNoteConfusion,
	MAX_PLAYABLE_FRET,
	parseLocateItem,
	STRING_NUMBERS
} from '$lib/domain/music';
import { LOCATE_NECK } from '$lib/testing/catalog';
import { notePlaces } from './notePlaces';

const LOCATE_ITEMS = (LOCATE_NECK.items ?? []).map((entry) => parseLocateItem(itemEntryKey(entry)));

describe('note-places', () => {
	it('gives, for every note of locate, the pitches locate accepts', () => {
		expect(LOCATE_ITEMS).toHaveLength(66);
		for (const item of LOCATE_ITEMS) {
			const members = notePlaces.members({ pitch: item.pitch, string: item.string });
			expect(
				members.map((m) => m.midi),
				`${item.pitch} on ${item.string}`
			).toEqual(acceptableMidis(item));
			expect(members.every((m) => m.string === item.string)).toBe(true);
		}
	});

	it('names a member by its string and fret and keeps its note', () => {
		const [first] = notePlaces.members({ pitch: 'A', string: 6 });
		expect(first).toEqual({
			id: '6:5',
			string: 6,
			fret: 5,
			midi: 45,
			notes: [{ string: 6, fret: 5, midi: 45 }]
		});
	});

	it('covers the six strings without a string, frets 0 to the last playable', () => {
		const members = notePlaces.members({ pitch: 'E' });
		expect(new Set(members.map((m) => m.string))).toEqual(new Set(STRING_NUMBERS));
		expect(members.every((m) => m.fret >= 0 && m.fret <= MAX_PLAYABLE_FRET)).toBe(true);
		expect(members.filter((m) => m.string === 1).map((m) => m.fret)).toEqual([0, 12, 24]);
		expect(new Set(members.map((m) => m.id)).size).toBe(members.length);
	});

	it('gives its attributes from the note', () => {
		const [member] = notePlaces.members({ pitch: 'F', string: 2 });
		expect(notePlaces.attributes.strings(member)).toEqual([2]);
		expect(notePlaces.attributes.frets(member)).toEqual([6]);
		expect(notePlaces.attributes.position(member)).toBe(6);
		expect(notePlaces.attributes.pitch(member)).toBe(65);
		const [open] = notePlaces.members({ pitch: 'E', string: 1 });
		expect(notePlaces.attributes.position(open)).toBe(0);
	});

	it('recognises an admitted member by its pitch alone', () => {
		const admitted = notePlaces.members({ pitch: 'G', string: 3 });
		expect(notePlaces.recognise(admitted, { midi: 67 })?.id).toBe('3:12');
		expect(notePlaces.recognise(admitted, { midi: 68 })).toBeNull();
		expect(notePlaces.recognise(admitted, { decided: '3:12' })).toBeNull();
		expect(notePlaces.recognise(admitted, null)).toBeNull();
	});

	it('tells the confusion of the located note when the index has a string', () => {
		const index = { pitch: 'A', string: 6 } as const;
		const admitted = notePlaces.members(index);
		for (const midi of [69, 40, 46, 57]) {
			expect(notePlaces.confusion(index, admitted, { midi }), String(midi)).toEqual(
				classifyNoteConfusion({ pitch: 'A', string: 6 }, midi)
			);
		}
		expect(notePlaces.confusion(index, admitted, { midi: 69 })).toEqual({ kind: 'octave' });
		expect(notePlaces.confusion(index, admitted, { midi: 40 })).toEqual({ kind: 'string-name' });
		expect(notePlaces.confusion(index, admitted, { midi: 46 })).toEqual({
			kind: 'semitone',
			delta: 1
		});
	});

	it('tells nothing without a string or without a pitch heard', () => {
		const index = { pitch: 'A' } as const;
		expect(notePlaces.confusion(index, notePlaces.members(index), { midi: 46 })).toBeNull();
		const onString = { pitch: 'A', string: 6 } as const;
		expect(notePlaces.confusion(onString, [], { decided: 'x' })).toBeNull();
	});

	it('tells nothing for an index it does not read', () => {
		expect(notePlaces.confusion({ pitch: 'H', string: 6 } as never, [], { midi: 46 })).toBeNull();
	});

	it('gives a place back from its id', () => {
		expect(notePlaces.member('6:5')).toEqual(notePlaces.members({ pitch: 'A', string: 6 })[0]);
		expect(notePlaces.member('1:0')?.midi).toBe(64);
		for (const id of ['7:1', '1:25', '1:-1', '1:1.5', '1', '1:2:3', 'x:y', '']) {
			expect(notePlaces.member(id), id).toBeNull();
		}
	});

	it('says which index it cannot read', () => {
		expect(notePlaces.indexProblem({ pitch: 'A', string: 6 })).toBeNull();
		expect(notePlaces.indexProblem({ pitch: 'A' })).toBeNull();
		expect(notePlaces.indexProblem({ pitch: 'H' })).not.toBeNull();
		expect(notePlaces.indexProblem({ pitch: 'A', string: 7 })).not.toBeNull();
		expect(notePlaces.indexProblem(null)).not.toBeNull();
	});
});

describe('note-places answer', () => {
	it('gives the pitch heard, as the attempt keeps it; null when none is', () => {
		expect(notePlaces.answer({ midi: 65 })).toEqual({ midi: 65 });
		expect(notePlaces.answer({ midi: 65, onset: 3 })).toEqual({ midi: 65 });
		expect(notePlaces.answer({})).toBeNull();
		expect(notePlaces.answer(null)).toBeNull();
	});
});
