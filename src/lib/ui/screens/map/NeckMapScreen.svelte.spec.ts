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
		for (let fret = 0; fret < 12; fret++) {
			cells.push({
				string,
				fret,
				pitch: 'E',
				locate: string === 6 && fret === 3 ? 'mastered' : 'unseen',
				identify: string === 6 && fret === 3 ? 'acquired' : 'unseen',
				medianColdReactionMs: null,
				coldAccuracy: null
			});
		}
	}
	return cells;
}

describe('NeckMapScreen', () => {
	it('renders 72 cells with per-direction status', () => {
		render(NeckMapScreen, { props: { cells: buildCells(), onhome: () => {} } });
		expect(screen.getAllByRole('gridcell')).toHaveLength(72);
		const marked = screen.getByRole('gridcell', { name: /corde 6.*case 3/i });
		expect(marked.textContent).toMatch(/maîtrisé|mastered/i);
		expect(marked.textContent).toMatch(/acquis|acquired/i);
	});
});
