import { describe, expect, it, vi } from 'vitest';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import { openElements } from '$lib/domain/gesture/opening';
import { gestureElements } from '$lib/domain/gesture/exercises';
import type { StringNumber } from '$lib/domain/music';
import type { TriadSkill } from '$lib/domain/triads';
import type { CardState } from '$lib/domain/types';
import { GESTURE_EXERCISES } from '$lib/testing/catalog';
import {
	CLIMB_PASSAGES,
	JAM_PASSAGES,
	LINK_PASSAGES,
	PASSAGE_EXERCISES,
	ZONE_PASSAGES
} from '$lib/testing/changesPassages';
import { triadCards } from '$lib/testing/shapes';
import type { ExerciseDefinition } from '../types';
import { passageIndices } from './indices';
import { indexOpen } from './opens';

const G_B_E = [3, 2, 1] as const;
const D_G_B = [4, 3, 2] as const;

/** The triads of iohefy-a. */
const IOHEFY = [
	['D', 'min'],
	['G', 'maj'],
	['C', 'maj'],
	['F', 'maj'],
	['E', 'min'],
	['Eb', 'min'],
	['Ab', 'maj']
] as const;

function iohefy(skill: TriadSkill, set: readonly StringNumber[]): CardState[] {
	return IOHEFY.flatMap(([root, quality]) => triadCards(skill, root, quality, set));
}

/** The keys of the acquired cards, as the source builds them. */
const acquiredOf = (cards: readonly CardState[]) =>
	new Set(cards.filter((card) => card.acquiredAt !== null).map((card) => card.key));

/** Each index of the exercise, open or not, in the order written. */
function opened(definition: ExerciseDefinition, cards: readonly CardState[]): boolean[] {
	const acquired = acquiredOf(cards);
	return passageIndices(definition).map((index) => indexOpen(definition, index, acquired));
}

function indexOf(definition: ExerciseDefinition, key: string) {
	const found = passageIndices(definition).find((index) => index.key === key);
	if (!found) throw new Error(`no index ${key}`);
	return found;
}

describe('indexOpen', () => {
	it('every-group: opens a climb index once every inversion of every triad of its grid is acquired on its strings', () => {
		const index = indexOf(CLIMB_PASSAGES, 'grid=iohefy-a;strings=3,2,1');
		const all = iohefy('chord-anchor', G_B_E);
		expect(indexOpen(CLIMB_PASSAGES, index, acquiredOf(all))).toBe(true);
		expect(indexOpen(CLIMB_PASSAGES, index, acquiredOf(all.slice(1)))).toBe(false);
		// Acquired in the zone, not in the anchor: closed.
		expect(indexOpen(CLIMB_PASSAGES, index, acquiredOf(iohefy('chord-zone', G_B_E)))).toBe(false);
		// Learned but not acquired: closed.
		const notAcquired = all.map((card) => ({ ...card, acquiredAt: null }));
		expect(indexOpen(CLIMB_PASSAGES, index, acquiredOf(notAcquired))).toBe(false);
	});

	it('every-group: opens a zone index only when both groups of strings are acquired', () => {
		const index = indexOf(ZONE_PASSAGES, 'grid=iohefy-a');
		const both = [...iohefy('chord-zone', G_B_E), ...iohefy('chord-zone', D_G_B)];
		expect(indexOpen(ZONE_PASSAGES, index, acquiredOf(both))).toBe(true);
		expect(indexOpen(ZONE_PASSAGES, index, acquiredOf(iohefy('chord-zone', G_B_E)))).toBe(false);
	});

	it('one-group: opens a jam index when each triad is acquired on one group at least', () => {
		const index = indexOf(JAM_PASSAGES, 'grid=iohefy-a');
		// Half the triads on one group, the others on the other.
		const mixed = IOHEFY.flatMap(([root, quality], i) =>
			triadCards('chord-anchor', root, quality, i % 2 === 0 ? G_B_E : D_G_B)
		);
		expect(indexOpen(JAM_PASSAGES, index, acquiredOf(mixed))).toBe(true);
		expect(indexOpen(JAM_PASSAGES, index, acquiredOf(mixed.slice(1)))).toBe(false);
	});

	it('opens a link index once the inversions of its chord are acquired on its strings', () => {
		const index = indexOf(LINK_PASSAGES, 'chord=D;strings=3,2,1');
		const d = triadCards('chord-anchor', 'D', 'maj', G_B_E);
		expect(indexOpen(LINK_PASSAGES, index, acquiredOf(d))).toBe(true);
		expect(indexOpen(LINK_PASSAGES, index, acquiredOf(d.slice(0, 2)))).toBe(false);
	});

	it('opens every index of an exercise that writes no opening', () => {
		const { opens: _opens, ...passages } = JAM_PASSAGES.passages!;
		const free = { ...JAM_PASSAGES, passages };
		expect(opened(free, [])).toEqual([true, true]);
	});

	it('lets a programming error through', () => {
		const index = indexOf(CLIMB_PASSAGES, 'grid=iohefy-a;strings=3,2,1');
		const spy = vi.spyOn(chordShapes, 'members').mockImplementation(() => {
			throw new TypeError('a bug');
		});
		try {
			expect(() => indexOpen(CLIMB_PASSAGES, index, new Set())).toThrow(TypeError);
		} finally {
			spy.mockRestore();
		}
	});

	it('closes an index whose passage cannot be read', () => {
		const broken = {
			...CLIMB_PASSAGES,
			passages: {
				...CLIMB_PASSAGES.passages!,
				of: { grid: ['no-such-grid'], strings: [[3, 2, 1]] }
			}
		};
		const [index] = passageIndices(broken);
		expect(indexOpen(broken, index, acquiredOf(iohefy('chord-anchor', G_B_E)))).toBe(false);
	});

	describe('agrees with the opening of the gesture exercises', () => {
		const cardSets: Record<string, CardState[]> = {
			none: [],
			'anchor on G B E': iohefy('chord-anchor', G_B_E),
			'anchor on both, one card short': [
				...iohefy('chord-anchor', G_B_E),
				...iohefy('chord-anchor', D_G_B).slice(1)
			],
			'zone on G B E': iohefy('chord-zone', G_B_E),
			'everything of iohefy-a': [
				...iohefy('chord-anchor', G_B_E),
				...iohefy('chord-anchor', D_G_B),
				...iohefy('chord-zone', G_B_E),
				...iohefy('chord-zone', D_G_B)
			],
			'a few link chords': [
				...triadCards('chord-anchor', 'C#', 'min', D_G_B),
				...triadCards('chord-anchor', 'Bb', 'maj', G_B_E),
				...triadCards('chord-anchor', 'F#', 'maj', G_B_E).slice(1)
			]
		};
		for (const [name, cards] of Object.entries(cardSets)) {
			it(name, () => {
				for (const [i, written] of PASSAGE_EXERCISES.entries()) {
					const old = GESTURE_EXERCISES[i];
					const openKeys = new Set(openElements(old, cards).map((element) => element.key));
					const expected = gestureElements(old).map((element) => openKeys.has(element.key));
					expect(opened(written, cards), written.id).toEqual(expected);
				}
			});
		}
	});
});
