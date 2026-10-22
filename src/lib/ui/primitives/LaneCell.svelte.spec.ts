import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { LaneTile } from '$lib/ui/play/lane';
import LaneCell, { MARK_SIZE_PX } from './LaneCell.svelte';

afterEach(cleanup);

function played(over: Partial<LaneTile> = {}): LaneTile {
	return {
		beatIndex: 0,
		offset: 0,
		downbeat: false,
		kind: 'history',
		verdict: 'late',
		justPlayed: true,
		current: false,
		bandEdge: null,
		...over
	};
}

describe('LaneCell', () => {
	it('keeps the name of a played cell and puts the mark under it', () => {
		const { container } = render(LaneCell, { props: { tile: played(), label: 'F' } });
		const cell = container.querySelector('.cell')!;
		expect(cell.querySelector('.label')!.textContent).toBe('F');
		const mark = cell.querySelector('.mark')!;
		expect(mark.querySelector('svg[data-verdict="late"]')).not.toBeNull();
		expect(mark.hasAttribute('data-with-label')).toBe(true);
		expect(cell.lastElementChild).toBe(mark);
	});

	it('shows the mark alone when the played cell has no name', () => {
		const { container } = render(LaneCell, { props: { tile: played({ verdict: 'wrong' }) } });
		const cell = container.querySelector('.cell')!;
		expect(cell.querySelector('.label')).toBeNull();
		expect(cell.querySelector('.mark svg[data-verdict="wrong"]')).not.toBeNull();
		expect(cell.querySelector('.mark')!.hasAttribute('data-with-label')).toBe(false);
	});

	it('marks the cell just played so the past fade spares it', () => {
		const { container } = render(LaneCell, {
			props: { tile: played({ verdict: 'perfect' }), caption: 'parfait' }
		});
		const cell = container.querySelector('.cell')!;
		expect(cell.hasAttribute('data-past')).toBe(true);
		expect(cell.hasAttribute('data-just-played')).toBe(true);
		expect(cell.querySelector('.caption')!.textContent).toBe('parfait');
	});

	it('draws the mark at a fixed size that a narrow cell does not shrink', () => {
		const { container } = render(LaneCell, { props: { tile: played({ verdict: 'wrong' }) } });
		const svg = container.querySelector('.mark svg')!;
		expect(MARK_SIZE_PX).toBeGreaterThanOrEqual(32);
		expect(svg.getAttribute('width')).toBe(String(MARK_SIZE_PX));
		expect(svg.getAttribute('height')).toBe(String(MARK_SIZE_PX));
	});

	it('lets an older played cell fade with the past', () => {
		const { container } = render(LaneCell, {
			props: { tile: played({ offset: -2, justPlayed: false }) }
		});
		const cell = container.querySelector('.cell')!;
		expect(cell.hasAttribute('data-past')).toBe(true);
		expect(cell.hasAttribute('data-just-played')).toBe(false);
	});
});
