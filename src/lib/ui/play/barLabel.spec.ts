import { describe, expect, it } from 'vitest';
import { barLabel } from './barLabel';

describe('barLabel', () => {
	it('reports measure 2/2 beat 3/4 during an 8-beat lead', () => {
		expect(
			barLabel({
				nowBeat: 14,
				promptBeatIndex: 8,
				targetBeatIndex: 16,
				beatsPerBar: 4
			})
		).toEqual({ bar: 2, bars: 2, beat: 3 });
	});

	it('starts at measure 1 beat 1 when the prompt appears', () => {
		expect(
			barLabel({
				nowBeat: 8,
				promptBeatIndex: 8,
				targetBeatIndex: 16,
				beatsPerBar: 4
			})
		).toEqual({ bar: 1, bars: 2, beat: 1 });
	});

	it('clamps to the last beat of the lead', () => {
		expect(
			barLabel({
				nowBeat: 20,
				promptBeatIndex: 8,
				targetBeatIndex: 16,
				beatsPerBar: 4
			})
		).toEqual({ bar: 2, bars: 2, beat: 4 });
	});

	it('handles a one-bar lead', () => {
		expect(
			barLabel({
				nowBeat: 10.5,
				promptBeatIndex: 8,
				targetBeatIndex: 12,
				beatsPerBar: 4
			})
		).toEqual({ bar: 1, bars: 1, beat: 3 });
	});
});
