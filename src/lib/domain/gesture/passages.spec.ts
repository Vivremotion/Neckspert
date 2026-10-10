import { describe, expect, it } from 'vitest';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import {
	closeTriadVoicings,
	MAX_VOICING_FRET,
	parseSpelledNote,
	qualityById,
	voicingOccurrences
} from '$lib/domain/music';
import type { Attempt, Verdict } from '$lib/domain/types';
import { inZone } from '$lib/domain/mechanics';
import { shapeAt } from '$lib/testing/shapes';
import {
	LINK_SHAPES,
	nextZoneStart,
	ZONE_STARTS,
	linkShapes,
	nextZone,
	PASSAGE_SUCCESS,
	passageSucceeded,
	ZONE_FRETS,
	ZONE_STEP_FRETS,
	zoneFits
} from './passages';

const chord = (root: string, quality = 'maj') => ({
	root: parseSpelledNote(root),
	quality: qualityById(quality)
});
const frets = (shapes: ReturnType<typeof linkShapes>) =>
	shapes.map((s) => s.notes.map((n) => n.fret).join('-'));

describe('linkShapes', () => {
	it('climbs the first LINK_SHAPES shapes of a chord on a set, then comes down', () => {
		expect(LINK_SHAPES).toBe(4);
		expect(frets(linkShapes(chord('D'), [3, 2, 1]))).toEqual([
			'2-3-2',
			'7-7-5',
			'11-10-10',
			'14-15-14',
			'11-10-10',
			'7-7-5',
			'2-3-2'
		]);
		expect(frets(linkShapes(chord('Ab'), [3, 2, 1]))).toEqual([
			'5-4-4',
			'8-9-8',
			'13-13-11',
			'17-16-16',
			'13-13-11',
			'8-9-8',
			'5-4-4'
		]);
	});

	it('stops at the three inversions when the octave is off the neck', () => {
		expect(frets(linkShapes(chord('F#'), [6, 5, 4]))).toEqual([
			'6-4-4',
			'9-9-8',
			'14-13-11',
			'9-9-8',
			'6-4-4'
		]);
	});
});

describe('nextZone', () => {
	const iohefy = gridById('iohefy-a');
	const blues = gridById('blues-f');
	const sets = [
		[3, 2, 1],
		[4, 3, 2]
	] as const;
	const LAST_START = MAX_VOICING_FRET - ZONE_FRETS + 1;

	it('visits every start fret once, moving by ZONE_STEP_FRETS modulo the starts', () => {
		expect([ZONE_FRETS, ZONE_STEP_FRETS, LAST_START]).toEqual([5, 5, 13]);
		const starts = [ZONE_STARTS[0]];
		for (let i = 1; i < 14; i++) starts.push(nextZoneStart(starts[i - 1]));
		expect(starts).toEqual([1, 6, 11, 3, 8, 13, 5, 10, 2, 7, 12, 4, 9, 1]);
	});

	it('visits only zones every chord of the grid can be played in', () => {
		for (const grid of [iohefy, blues]) {
			for (const from of zonesOf(grid)) expect(zoneFits(grid, sets, from)).toBe(true);
		}
	});

	it('counts the open strings inside the zone at fret 1 only', () => {
		expect(inZone(shapeAt('E', 'min', [3, 2, 1], '0-0-0'), { from: 1, to: 4 })).toBe(true);
		expect(inZone(shapeAt('C', 'maj', [3, 2, 1], '0-1-0'), { from: 1, to: 4 })).toBe(true);
		expect(inZone(shapeAt('C', 'maj', [4, 3, 2], '2-0-1'), { from: 1, to: 4 })).toBe(true);
		expect(inZone(shapeAt('A', 'maj', [3, 2, 1], '2-2-0'), { from: 2, to: 5 })).toBe(false);
	});

	/** The starts the rotation visits for a grid, from the first, once each. */
	function zonesOf(grid: ReturnType<typeof gridById>): number[] {
		const seen: number[] = [];
		let zone = nextZone(grid, sets, null);
		while (!seen.includes(zone.from)) {
			seen.push(zone.from);
			zone = nextZone(grid, sets, zone);
		}
		return seen;
	}
});

describe('passageSucceeded', () => {
	const changes = (verdicts: Verdict[]) =>
		verdicts.map((verdict) => ({ correct: verdict !== 'wrong', verdict }) as Attempt);

	it('needs PASSAGE_SUCCESS of its changes right and in time', () => {
		expect(PASSAGE_SUCCESS).toBe(0.9);
		expect(passageSucceeded(changes([...Array(9).fill('perfect'), 'wrong']))).toBe(true);
		expect(passageSucceeded(changes([...Array(8).fill('late'), 'wrong', 'wrong']))).toBe(false);
		expect(passageSucceeded(changes([...Array(9).fill('early'), 'offbeat']))).toBe(true);
		expect(passageSucceeded(changes([...Array(8).fill('early'), 'offbeat', 'offbeat']))).toBe(
			false
		);
		expect(passageSucceeded([])).toBe(false);
	});
});
