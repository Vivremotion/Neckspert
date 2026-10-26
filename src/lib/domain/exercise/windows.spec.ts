import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from './catalog';
import { DEFAULT_RESPONSE_WINDOWS, windowsOf } from './windows';
import {
	LATE_CAPTURE_MS,
	LATE_LIMIT_MS,
	MIN_RESPONSE_MS,
	PERFECT_WINDOW_MS
} from '../scoring/timing';
import { ANCHOR_CHORD_FROM_BEATS } from '../timing/anchor';
import { GRID_EARLY_MAX_BEATS, GRID_EARLY_MS } from '../timing/gridChange';

describe('windowsOf', () => {
	it('defaults to today’s constants', () => {
		expect(DEFAULT_RESPONSE_WINDOWS).toEqual({
			perfectMs: PERFECT_WINDOW_MS,
			lateMs: LATE_LIMIT_MS,
			lateCaptureMs: LATE_CAPTURE_MS,
			minResponseMs: MIN_RESPONSE_MS,
			gridEarlyMs: GRID_EARLY_MS,
			gridEarlyMaxBeats: GRID_EARLY_MAX_BEATS,
			anchorChordFromBeats: ANCHOR_CHORD_FROM_BEATS
		});
		expect(windowsOf({ ...LOCATE_NECK, params: {} })).toEqual(DEFAULT_RESPONSE_WINDOWS);
	});

	it('reads the written windows over the defaults, field by field', () => {
		const windows = windowsOf({ ...LOCATE_NECK, params: { windows: { perfectMs: 120 } } });
		expect(windows).toEqual({ ...DEFAULT_RESPONSE_WINDOWS, perfectMs: 120 });
	});
});
