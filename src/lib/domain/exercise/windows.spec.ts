import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from './catalog';
import { DEFAULT_RESPONSE_WINDOWS, windowsOf } from './windows';

describe('windowsOf', () => {
	it('defaults to today’s constants', () => {
		expect(DEFAULT_RESPONSE_WINDOWS).toEqual({
			perfectMs: 80,
			lateMs: 400,
			lateCaptureMs: 2000,
			minResponseMs: 300,
			gridEarlyMs: 200,
			gridEarlyMaxBeats: 0.4,
			anchorChordFromBeats: 1
		});
		expect(windowsOf({ ...LOCATE_NECK, params: {} })).toEqual(DEFAULT_RESPONSE_WINDOWS);
	});

	it('reads the written windows over the defaults, field by field', () => {
		const windows = windowsOf({ ...LOCATE_NECK, params: { windows: { perfectMs: 120 } } });
		expect(windows).toEqual({ ...DEFAULT_RESPONSE_WINDOWS, perfectMs: 120 });
	});
});
