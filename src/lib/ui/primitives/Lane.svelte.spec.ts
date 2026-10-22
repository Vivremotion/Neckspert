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

const props = { targetLabel: null, bandLabel: null, caption: null, imprint: false };

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

	it('marks a played cell with its verdict and tone', () => {
		const tiles = [tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'late' })];
		const { container } = render(Lane, { props: { ...props, tiles } });
		expect(screen.getByRole('img', { name: playMessages().verdict.late })).toBeTruthy();
		expect(container.querySelector('[data-kind="history"]')!.getAttribute('data-tone')).toBe('hit');
	});

	it('writes the caption under the cell just played', () => {
		const tiles = [
			tile({ beatIndex: -1, offset: -1, kind: 'history', verdict: 'wrong' }),
			tile({ beatIndex: 0, offset: 0, kind: 'history', verdict: 'perfect', justPlayed: true })
		];
		const { container } = render(Lane, { props: { ...props, tiles, caption: 'Juste' } });
		const cells = container.querySelectorAll('.cell');
		expect(cells[1].textContent).toContain('Juste');
		expect(cells[0].textContent).not.toContain('Juste');
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
});
