import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { NeckMapCell } from '$lib/domain/types';
import { STRING_NUMBERS } from '$lib/domain/music/types';
import { i18n } from '$lib/i18n/index.svelte';
import NeckMapScreen from './NeckMapScreen.svelte';

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

function buildCells(): NeckMapCell[] {
	const cells: NeckMapCell[] = [];
	for (const string of STRING_NUMBERS) {
		for (let fret = 1; fret <= 11; fret++) {
			const mastered = string === 6 && fret === 3;
			const learning = string === 6 && fret === 4;
			cells.push({
				string,
				fret,
				pitch: 'E',
				locate: mastered ? 'mastered' : learning ? 'learning' : 'unseen',
				identify: mastered ? 'acquired' : 'unseen',
				locateRecallMs: mastered ? 2000 : null,
				identifyMedianReactionMs: mastered ? 900 : null,
				coldAccuracy: null
			});
		}
	}
	return cells;
}

describe('NeckMapScreen', () => {
	it('renders 66 cells with per-direction status', () => {
		render(NeckMapScreen, { props: { cells: buildCells(), onhome: () => {} } });
		expect(screen.getAllByRole('gridcell')).toHaveLength(66);
		const marked = screen.getByRole('gridcell', { name: /corde 6.*case 3/i });
		expect(marked.textContent).toMatch(/2,00 s/);
		expect(marked.textContent).not.toMatch(/2 temps/);
		expect(marked.textContent).toMatch(/0,90 s/);
		expect(marked.getAttribute('aria-label')).toMatch(/dernier rappel à froid réussi en 2,00 s/);
		expect(marked.getAttribute('aria-label')).toMatch(/acquis/i);
		const learning = screen.getByRole('gridcell', { name: /corde 6.*case 4/i });
		expect(learning.textContent).toMatch(/en cours/);
		expect(learning.textContent).not.toMatch(/temps/);
	});

	it('keeps a time in its own slot when only one mode is seen', () => {
		const cells = buildCells().map((c) =>
			c.string === 6 && c.fret === 5
				? { ...c, identify: 'acquired' as const, identifyMedianReactionMs: 1200 }
				: c
		);
		render(NeckMapScreen, { props: { cells, onhome: () => {} } });
		const cell = screen.getByRole('gridcell', { name: /corde 6.*case 5/i });
		const slots = cell.querySelectorAll('.dirs > span');
		expect(slots).toHaveLength(2);
		expect(slots[0].textContent?.trim()).toBe('');
		expect(slots[1].textContent).toMatch(/1,20 s/);
	});

	it('draws a place a string does not hold blank, without text, the grid kept', () => {
		const open = { ...buildCells()[0], string: 1 as const, fret: 0 };
		render(NeckMapScreen, { props: { cells: [...buildCells(), open], onhome: () => {} } });
		expect(screen.getAllByRole('row')).toHaveLength(6);
		expect(screen.getAllByRole('gridcell')).toHaveLength(72);
		const blank = screen.getByRole('gridcell', { name: 'Corde 6, case 0' });
		expect(blank.textContent?.trim()).toBe('');
		expect(screen.getByRole('gridcell', { name: /^corde 1, case 0\./i }).textContent).toMatch(/E/);
	});

	it('draws a partial list alone in the shape of the grid', () => {
		const partial = buildCells().filter((c) => c.string === 2 && c.fret <= 2);
		render(NeckMapScreen, { props: { cells: partial, onhome: () => {} } });
		expect(screen.getAllByRole('row')).toHaveLength(6);
		expect(screen.getAllByRole('gridcell')).toHaveLength(12);
		expect(screen.getByRole('gridcell', { name: /^corde 2, case 1\./i })).toBeTruthy();
	});

	it('says there is nothing to show for an empty list', () => {
		render(NeckMapScreen, { props: { cells: [], onhome: () => {} } });
		expect(screen.queryByRole('grid')).toBeNull();
		expect(screen.getByText(/Aucune case à montrer/)).toBeTruthy();
		cleanup();
		i18n.locale = 'en';
		render(NeckMapScreen, { props: { cells: [], onhome: () => {} } });
		expect(screen.getByText(/No place to show/)).toBeTruthy();
	});
});
