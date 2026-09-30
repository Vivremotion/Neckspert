import { describe, expect, it } from 'vitest';
import { beatsToSchedule } from './beatsToSchedule';

const base = { nextIndex: 0, firstBeatTime: 1, secondsPerBeat: 0.5, horizon: 0.1 };

describe('beatsToSchedule', () => {
	it('schedules the first beat once it enters the horizon', () => {
		expect(beatsToSchedule({ ...base, now: 0.5 })).toEqual([]);
		expect(beatsToSchedule({ ...base, now: 0.95 })).toEqual([0]);
	});

	it('returns every beat inside the horizon, in order', () => {
		expect(beatsToSchedule({ ...base, now: 0.95, horizon: 1.2 })).toEqual([0, 1, 2]);
	});

	it('never returns a beat before nextIndex', () => {
		expect(beatsToSchedule({ ...base, nextIndex: 1, now: 0.95, horizon: 1.2 })).toEqual([1, 2]);
		expect(beatsToSchedule({ ...base, nextIndex: 3, now: 0.95, horizon: 1.2 })).toEqual([]);
	});

	it('excludes a beat at now and includes a beat at now + horizon', () => {
		expect(beatsToSchedule({ ...base, nextIndex: 1, now: 1.5, horizon: 0.5 })).toEqual([2]);
	});

	it('skips beats whose time has already passed', () => {
		expect(beatsToSchedule({ ...base, now: 2.2 })).toEqual([]);
		expect(beatsToSchedule({ ...base, now: 2.45 })).toEqual([3]);
	});

	it('rejects a non-positive beat duration', () => {
		expect(() => beatsToSchedule({ ...base, secondsPerBeat: 0, now: 0 })).toThrow(RangeError);
	});
});
