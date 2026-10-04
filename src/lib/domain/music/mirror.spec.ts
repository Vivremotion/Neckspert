import { describe, expect, it } from 'vitest';
import type { LocateTarget } from '$lib/domain/types';
import { isMirrorPair, mirrorTargets, openPitch } from './mirror';

const on = (string: LocateTarget['string'], pitch: LocateTarget['pitch']): LocateTarget => ({
	direction: 'locate',
	string,
	pitch
});

describe('openPitch', () => {
	it('names each string by its open note', () => {
		expect([1, 2, 3, 4, 5, 6].map((s) => openPitch(s as LocateTarget['string']))).toEqual([
			'E',
			'B',
			'G',
			'D',
			'A',
			'E'
		]);
	});
});

describe('isMirrorPair', () => {
	it('pairs "A on the low E string" with "E on the A string", both ways', () => {
		expect(isMirrorPair(on(6, 'A'), on(5, 'E'))).toBe(true);
		expect(isMirrorPair(on(5, 'E'), on(6, 'A'))).toBe(true);
	});

	it('lets E stand for strings 1 and 6', () => {
		expect(isMirrorPair(on(1, 'A'), on(5, 'E'))).toBe(true);
		expect(isMirrorPair(on(1, 'B'), on(2, 'E'))).toBe(true);
	});

	it('pairs G on D with D on G, and B on G with G on B', () => {
		expect(isMirrorPair(on(4, 'G'), on(3, 'D'))).toBe(true);
		expect(isMirrorPair(on(3, 'B'), on(2, 'G'))).toBe(true);
	});

	it('leaves other notes, identical cards and mode 2 alone', () => {
		expect(isMirrorPair(on(6, 'A'), on(5, 'F'))).toBe(false);
		expect(isMirrorPair(on(6, 'A'), on(6, 'A'))).toBe(false);
		expect(isMirrorPair(on(6, 'A'), { direction: 'identify', string: 5, fret: 7 })).toBe(false);
	});
});

describe('mirrorTargets', () => {
	it('lists every mirror of a locate target', () => {
		expect(mirrorTargets(on(5, 'E'))).toEqual([on(1, 'A'), on(6, 'A')]);
		expect(mirrorTargets(on(6, 'A'))).toEqual([on(5, 'E')]);
		expect(mirrorTargets(on(6, 'F'))).toEqual([]);
	});
});
