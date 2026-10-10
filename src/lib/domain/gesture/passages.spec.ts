import { describe, expect, it } from 'vitest';
import { gridById } from '$lib/domain/grid';
import { MAX_VOICING_FRET, parseSpelledNote, qualityById } from '$lib/domain/music';
import type { Attempt, Verdict } from '$lib/domain/types';
import {
	LINK_SHAPES,
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
	const sets = [
		[3, 2, 1],
		[4, 3, 2]
	] as const;

	it('spans ZONE_FRETS frets and moves by ZONE_STEP_FRETS, skipping a zone a chord cannot be played in', () => {
		expect([ZONE_FRETS, ZONE_STEP_FRETS]).toEqual([4, 3]);
		// G has no shape in frets 1 to 4 nor 4 to 7 on either set: the first zone is 7 to 10.
		expect(zoneFits(iohefy, sets, 1)).toBe(false);
		expect(zoneFits(iohefy, sets, 4)).toBe(false);
		const first = nextZone(iohefy, sets, null);
		expect(first).toEqual({ from: 7, to: 10 });
		expect(nextZone(iohefy, sets, first)).toEqual({ from: 10, to: 13 });
	});

	it('comes back down the neck past MAX_VOICING_FRET', () => {
		let zone = nextZone(iohefy, sets, null);
		const seen = [zone.from];
		for (let i = 0; i < 6; i++) {
			zone = nextZone(iohefy, sets, zone);
			seen.push(zone.from);
		}
		expect(Math.max(...seen.map((from) => from + ZONE_FRETS - 1))).toBeLessThanOrEqual(
			MAX_VOICING_FRET
		);
		// 13 to 16 has no G (nor C) on either set; 16 to 19 passes fret 17: back to 1, 4, then 7.
		expect(zoneFits(iohefy, sets, 13)).toBe(false);
		expect(seen.slice(0, 4)).toEqual([7, 10, 7, 10]);
	});

	it('starts at fret 1 when every chord fits there', () => {
		const blues = gridById('blues-f');
		expect(nextZone(blues, sets, null).from).toBe(zoneStart(blues));
	});
});

/** The first zone of a grid: the lowest start every chord fits. */
function zoneStart(grid: ReturnType<typeof gridById>): number {
	const sets = [
		[3, 2, 1],
		[4, 3, 2]
	] as const;
	for (let from = 1; ; from += ZONE_STEP_FRETS) if (zoneFits(grid, sets, from)) return from;
}

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
