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
				locateLeadBeats: mastered ? 2 : learning ? 4 : null,
				locateLeadMs: mastered ? 2000 : null,
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
		expect(marked.getAttribute('aria-label')).toMatch(/2,00 s/);
		expect(marked.getAttribute('aria-label')).toMatch(/acquis/i);
		const learning = screen.getByRole('gridcell', { name: /corde 6.*case 4/i });
		expect(learning.textContent).toMatch(/en cours/);
		expect(learning.textContent).not.toMatch(/temps/);
	});
});
