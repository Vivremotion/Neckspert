import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { LaneTile } from '$lib/ui/play/lane';
import { playMessages } from '$lib/ui/play/messages';
import Lane from './Lane.svelte';

afterEach(cleanup);

function tile(over: Partial<LaneTile> & { beatIndex: number }): LaneTile {
	return {
		offset: over.beatIndex,
		downbeat: false,
		kind: 'empty',
		verdict: null,
		justPlayed: false,
		current: false,
		bandEdge: null,
		...over
	};
}

const props = { targetLabel: null, bandLabel: null, caption: null, imprint: false, beatsPerBar: 4 };

describe('Lane', () => {
	it("writes the target's name in its cell", () => {
		const { container } = render(Lane, {
			props: {
				...props,
				tiles: [tile({ beatIndex: 1 }), tile({ beatIndex: 2, kind: 'target' })],
				targetLabel: 'F'
			}
		});
		expect(container.querySelector('[data-kind="target"]')!.textContent).toContain('F');
	});

	it("writes a band's name once", () => {
		const tiles = [
			tile({ beatIndex: 1, kind: 'band', bandEdge: 'start' }),
			tile({ beatIndex: 2, kind: 'band' }),
			tile({ beatIndex: 3, kind: 'band', bandEdge: 'end' })
		];
		const { container } = render(Lane, { props: { ...props, tiles, bandLabel: 'Do' } });
		expect(container.textContent!.match(/Do/g)).toHaveLength(1);
	});

	it("runs a band's name from the band's left edge across its cells, never in the target", () => {
		const tiles = [
			tile({ beatIndex: 0, offset: 0 }),
			tile({ beatIndex: 1, kind: 'target' }),
			tile({ beatIndex: 2, kind: 'band', bandEdge: 'start' }),
			tile({ beatIndex: 3, kind: 'band' }),
			tile({ beatIndex: 4, kind: 'band', bandEdge: 'end' })
		];
		const { container } = render(Lane, {
			props: { ...props, tiles, targetLabel: 'F#', bandLabel: 'F#dim' }
		});
		const label = container.querySelector('.band-label') as HTMLElement;
		expect(label.textContent).toBe('F#dim');
		expect(label.getAttribute('style')).toContain('--band-start: 2');
		expect(label.getAttribute('style')).toContain('--band-cells: 3');
		expect(container.querySelector('[data-kind="target"]')!.textContent!.trim()).toBe('F#');
		for (const cell of container.querySelectorAll('[data-kind="band"]')) {
			expect(cell.textContent!.trim()).toBe('');
		}
	});

	it('marks a played cell with its verdict and tone', () => {
		const tiles = [tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'late' })];
		const { container } = render(Lane, { props: { ...props, tiles } });
		expect(screen.getByRole('img', { name: playMessages().verdict.late })).toBeTruthy();
		expect(container.querySelector('[data-kind="history"]')!.getAttribute('data-tone')).toBe('hit');
	});

	it('leaves the cell just played out of the faded past, caption included', () => {
		const tiles = [
			tile({ beatIndex: -1, offset: -1, kind: 'history', verdict: 'perfect' }),
			tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'wrong', justPlayed: true })
		];
		const { container } = render(Lane, { props: { ...props, tiles, caption: 'F# joué' } });
		const [older, just] = [...container.querySelectorAll('.cell')];
		expect(older.hasAttribute('data-just-played')).toBe(false);
		expect(older.hasAttribute('data-past')).toBe(true);
		expect(just.hasAttribute('data-just-played')).toBe(true);
		expect(just.getAttribute('data-tone')).toBe('miss');
		expect(container.querySelector('.caption')!.textContent).toBe('F# joué');
	});

	it('anchors the caption under the cell just played, counted back from the now line', () => {
		const tiles = [
			tile({ beatIndex: -3, offset: -2.5, kind: 'history', verdict: 'perfect', justPlayed: true }),
			tile({ beatIndex: -2, offset: -1.5 }),
			tile({ beatIndex: -1, offset: -0.5 }),
			tile({ beatIndex: 0, offset: 0.5 })
		];
		const { container } = render(Lane, { props: { ...props, tiles, caption: 'Juste' } });
		const caption = container.querySelector('.caption') as HTMLElement;
		expect(caption.getAttribute('style')).toContain('--caption-back: 2');
		expect(container.querySelector('.cell')!.textContent).not.toContain('Juste');
	});

	it('writes the caption outside the clipped track, so the lane edge never cuts it', () => {
		const tiles = [
			tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'perfect', justPlayed: true })
		];
		const { container } = render(Lane, { props: { ...props, tiles, caption: 'Juste' } });
		const caption = container.querySelector('.caption')!;
		expect(caption.closest('.track')).toBeNull();
		expect(caption.parentElement!.classList.contains('lane')).toBe(true);
	});

	it('writes no caption once the cell just played has left the lane', () => {
		const tiles = [tile({ beatIndex: 1, offset: 0.5 })];
		const { container } = render(Lane, { props: { ...props, tiles, caption: 'Juste' } });
		expect(container.querySelector('.caption')).toBeNull();
	});

	it('shows no number, no word of time', () => {
		const tiles = [
			tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'early', justPlayed: true }),
			tile({ beatIndex: 1, kind: 'target' }),
			tile({ beatIndex: 2 })
		];
		const { container } = render(Lane, {
			props: { ...props, tiles, targetLabel: 'F', caption: 'Tôt' }
		});
		const text = container.querySelector('.lane')!.textContent!.replace(/\s+/g, '');
		expect(text).not.toMatch(/\d/);
		expect(text.replace('Tôt', '').replace('F', '')).toBe('');
	});

	it('marks downbeat cells', () => {
		const tiles = [tile({ beatIndex: 4, downbeat: true }), tile({ beatIndex: 5 })];
		const { container } = render(Lane, { props: { ...props, tiles } });
		expect(container.querySelectorAll('[data-downbeat]')).toHaveLength(1);
	});

	it('hides the now line from assistive tech', () => {
		const { container } = render(Lane, { props: { ...props, tiles: [tile({ beatIndex: 1 })] } });
		expect(container.querySelector('.now')!.getAttribute('aria-hidden')).toBe('true');
	});

	it('gives every cell the same width whatever the number of tiles, and clips', () => {
		const run = (count: number) => {
			const tiles = Array.from({ length: count }, (_, i) => tile({ beatIndex: i, offset: i - 4 }));
			const { container, unmount } = render(Lane, { props: { ...props, tiles } });
			const lane = container.querySelector('.lane') as HTMLElement;
			const track = container.querySelector('.track') as HTMLElement;
			const style = `${lane.getAttribute('style')} ${track.getAttribute('style')}`;
			expect(container.querySelectorAll('.cell')).toHaveLength(count);
			unmount();
			return style;
		};
		const few = run(7);
		const many = run(16);
		expect(few).toBe(many);
		expect(few).toContain('--lane-cells: 12');
		expect(few).toContain('--lane-before: 4');
		expect(few).toContain('overflow-x: clip');
	});

	it('clips only horizontally so the caption and the line show past the cells', () => {
		const tiles = [
			tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'perfect', justPlayed: true })
		];
		const { container } = render(Lane, { props: { ...props, tiles, caption: 'Juste' } });
		expect(screen.getByText('Juste')).toBeTruthy();
		const track = container.querySelector('.track') as HTMLElement;
		expect(track.getAttribute('style')).toContain('overflow-y: visible');
		expect(track.getAttribute('style')).not.toContain('overflow: hidden');
		expect(container.querySelector('.past')!.getAttribute('style') ?? '').not.toContain('hidden');
	});
});
