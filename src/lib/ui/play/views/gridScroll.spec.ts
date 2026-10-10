import { describe, expect, it } from 'vitest';
import { gridById, gridChanges } from '$lib/domain/grid';
import { gridPlacement } from './gridScroll';

const IOHEFY = gridChanges(gridById('iohefy-a'));

/** iohefy-a started on beat 8: Dm7 on 8, G7 on 12, Dm7 on 16, G7 on 20, Cmaj7 on 24… */
function placement(
	index: number,
	nowBeat: number,
	history: { beatIndex: number; verdict: 'perfect' | 'wrong' }[] = []
) {
	return gridPlacement({
		changes: IOHEFY,
		beatsPerBar: 4,
		index,
		targetBeatIndex: 8 + IOHEFY[index].at,
		nowBeat,
		history,
		visibleBars: 4
	});
}

describe('gridPlacement', () => {
	it('gives the change on show, the next one, and the bars from the current one', () => {
		const p = placement(1, 12.2);
		expect(p.current).toBe(1);
		expect(p.next).toBe(2);
		expect(p.bars.map((bar) => bar.bar)).toEqual([1, 2, 3, 4]);
		expect(p.bars[0].cells).toEqual([
			{ change: 1, symbol: 'G7', beats: 4, continued: false, state: 'current', verdict: null }
		]);
		expect(p.bars[1].cells[0]).toMatchObject({ change: 2, state: 'next' });
		expect(p.bars[2].cells[0]).toMatchObject({ change: 3, state: 'later' });
	});

	it('scrolls bar by bar as the passage moves on', () => {
		expect(placement(4, 24.5).bars.map((bar) => bar.bar)).toEqual([4, 5, 6, 7]);
		// Cmaj7 spans bar 5 and half of bar 6, where F7 starts on beat 3.
		const bars = placement(4, 24.5).bars;
		expect(bars[0].cells).toEqual([
			expect.objectContaining({ change: 4, symbol: 'Cmaj7', beats: 4, continued: false })
		]);
		expect(bars[1].cells).toEqual([
			expect.objectContaining({ change: 4, beats: 2, continued: true, state: 'current' }),
			expect.objectContaining({ change: 5, symbol: 'F7', beats: 2, state: 'next' })
		]);
		// The last bars: the window does not run past the grid.
		expect(placement(8, 38.5).bars.map((bar) => bar.bar)).toEqual([7]);
	});

	it('announces the next change once it is a beat away or less', () => {
		expect(placement(1, 13.5).nextAnnounced).toBe(false);
		expect(placement(1, 15).nextAnnounced).toBe(true);
		expect(placement(8, 38.5).next).toBeNull();
	});

	it('puts their verdicts on the changes played', () => {
		const p = placement(2, 16.1, [
			{ beatIndex: 8, verdict: 'perfect' },
			{ beatIndex: 12, verdict: 'wrong' }
		]);
		expect(p.bars.map((bar) => bar.bar)).toEqual([2, 3, 4, 5]);
		const before = placement(1, 12.1, [{ beatIndex: 8, verdict: 'perfect' }]);
		expect(before.bars[0].cells[0]).toMatchObject({ change: 1, state: 'current', verdict: null });
		const withPast = gridPlacement({
			changes: IOHEFY,
			beatsPerBar: 4,
			index: 1,
			targetBeatIndex: 12,
			nowBeat: 12.1,
			history: [{ beatIndex: 8, verdict: 'perfect' }],
			visibleBars: 4,
			barsBefore: 1
		});
		expect(withPast.bars[0].cells[0]).toMatchObject({
			change: 0,
			state: 'past',
			verdict: 'perfect'
		});
	});

	it('before the first change, shows the grid from its start, the first change next', () => {
		const p = gridPlacement({
			changes: IOHEFY,
			beatsPerBar: 4,
			index: 0,
			targetBeatIndex: null,
			nowBeat: 5,
			history: [],
			visibleBars: 4
		});
		expect(p.current).toBeNull();
		expect(p.next).toBe(0);
		expect(p.bars.map((bar) => bar.bar)).toEqual([0, 1, 2, 3]);
		expect(p.bars[0].cells[0]).toMatchObject({ change: 0, state: 'next' });
	});
});
