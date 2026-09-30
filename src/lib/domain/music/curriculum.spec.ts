import { describe, expect, it } from 'vitest';
import { cardKey, type CurriculumSet, type Target } from '$lib/domain/types';
import { pitchOnString } from './fretboard';
import { buildCurriculum, placementTargets } from './curriculum';

function setById(id: string): CurriculumSet {
	const set = buildCurriculum().find((candidate) => candidate.id === id);
	if (!set) throw new Error(`Missing set ${id}`);
	return set;
}

function pitchesOf(targets: readonly Target[]): string[] {
	return targets.map((target) =>
		target.direction === 'locate' ? target.pitch : pitchOnString(target.string, target.fret)
	);
}

describe('buildCurriculum', () => {
	it('orders sets string by string, a before b, locate before identify', () => {
		expect(buildCurriculum().map((set) => set.id)).toEqual([
			'locate-s6-a',
			'identify-s6-a',
			'locate-s6-b',
			'identify-s6-b',
			'locate-s5-a',
			'identify-s5-a',
			'locate-s5-b',
			'identify-s5-b',
			'locate-s4-a',
			'identify-s4-a',
			'locate-s4-b',
			'identify-s4-b',
			'locate-s3-a',
			'identify-s3-a',
			'locate-s3-b',
			'identify-s3-b',
			'locate-s2-a',
			'identify-s2-a',
			'locate-s2-b',
			'identify-s2-b',
			'locate-s1-a',
			'identify-s1-a',
			'locate-s1-b',
			'identify-s1-b'
		]);
	});

	it('chains each locate set to the previous one and each identify set to its locate set', () => {
		expect(setById('locate-s6-a').requires).toBeNull();
		expect(setById('identify-s6-a').requires).toBe('locate-s6-a');
		expect(setById('locate-s6-b').requires).toBe('locate-s6-a');
		expect(setById('identify-s6-b').requires).toBe('locate-s6-b');
		expect(setById('locate-s5-a').requires).toBe('locate-s6-b');
		expect(setById('locate-s1-b').requires).toBe('locate-s1-a');

		const curriculum = buildCurriculum();
		const locateIds = curriculum.filter((set) => set.direction === 'locate').map((set) => set.id);
		for (const set of curriculum) {
			if (set.direction === 'identify') {
				expect(set.requires).toBe(set.id.replace('identify', 'locate'));
			} else {
				const index = locateIds.indexOf(set.id);
				expect(set.requires).toBe(index === 0 ? null : locateIds[index - 1]);
			}
		}
	});

	it('puts the pitches of frets 3, 5 and 7 in set a', () => {
		expect(pitchesOf(setById('locate-s6-a').targets)).toEqual(['G', 'A', 'B']);
		expect(pitchesOf(setById('locate-s5-a').targets)).toEqual(['C', 'D', 'E']);
		expect(pitchesOf(setById('locate-s4-a').targets)).toEqual(['F', 'G', 'A']);
		expect(pitchesOf(setById('locate-s3-a').targets)).toEqual(['A#', 'C', 'D']);
		expect(pitchesOf(setById('locate-s2-a').targets)).toEqual(['D', 'E', 'F#']);
		expect(pitchesOf(setById('locate-s1-a').targets)).toEqual(['G', 'A', 'B']);
	});

	it('puts the nine other pitch classes in set b, in fret order', () => {
		expect(pitchesOf(setById('locate-s6-b').targets)).toEqual([
			'E',
			'F',
			'F#',
			'G#',
			'A#',
			'C',
			'C#',
			'D',
			'D#'
		]);
		expect(pitchesOf(setById('locate-s2-b').targets)).toEqual([
			'B',
			'C',
			'C#',
			'D#',
			'F',
			'G',
			'G#',
			'A',
			'A#'
		]);
		for (const string of [6, 5, 4, 3, 2, 1]) {
			const a = pitchesOf(setById(`locate-s${string}-a`).targets);
			const b = pitchesOf(setById(`locate-s${string}-b`).targets);
			expect(a).toHaveLength(3);
			expect(b).toHaveLength(9);
			expect(new Set([...a, ...b]).size).toBe(12);
		}
	});

	it('builds identify sets from the same frets, hence the same pitches', () => {
		expect(setById('identify-s6-a').targets).toEqual([
			{ direction: 'identify', string: 6, fret: 3 },
			{ direction: 'identify', string: 6, fret: 5 },
			{ direction: 'identify', string: 6, fret: 7 }
		]);
		const s2b = setById('identify-s2-b').targets;
		expect(s2b.map((target) => (target.direction === 'identify' ? target.fret : null))).toEqual([
			0, 1, 2, 4, 6, 8, 9, 10, 11
		]);

		for (const set of buildCurriculum()) {
			expect(set.targets.every((target) => target.direction === set.direction)).toBe(true);
			if (set.direction === 'identify') {
				const locate = setById(set.id.replace('identify', 'locate'));
				expect(pitchesOf(set.targets)).toEqual(pitchesOf(locate.targets));
				expect(set.targets.map((t) => t.string)).toEqual(locate.targets.map((t) => t.string));
			}
		}
	});

	it('covers the 144 cards exactly once', () => {
		const keys = buildCurriculum()
			.flatMap((set) => set.targets)
			.map((target) => cardKey(target));
		expect(keys).toHaveLength(144);
		expect(new Set(keys).size).toBe(144);
	});
});

describe('placementTargets', () => {
	it('returns 72 locate targets, string 6 first, frets 0 to 11 on each string', () => {
		const targets = placementTargets();
		expect(targets).toHaveLength(72);
		expect(targets[0]).toEqual({ direction: 'locate', string: 6, pitch: 'E' });
		expect(targets[1]).toEqual({ direction: 'locate', string: 6, pitch: 'F' });
		expect(targets[12]).toEqual({ direction: 'locate', string: 5, pitch: 'A' });
		expect(targets[71]).toEqual({ direction: 'locate', string: 1, pitch: 'D#' });
	});

	it('matches the locate targets of the curriculum, once each', () => {
		const placement = placementTargets()
			.map((target) => cardKey(target))
			.sort();
		const curriculum = buildCurriculum()
			.filter((set) => set.direction === 'locate')
			.flatMap((set) => set.targets)
			.map((target) => cardKey(target))
			.sort();
		expect(new Set(placement).size).toBe(72);
		expect(placement).toEqual(curriculum);
	});
});
