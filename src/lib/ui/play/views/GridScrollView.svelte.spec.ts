import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { DrawnMiss, GridStageModel } from '$lib/application/mechanics/chordGrid';
import { gridById, gridChanges } from '$lib/domain/grid';
import GridScrollView from './GridScrollView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const IOHEFY = gridChanges(gridById('iohefy-a'));

function model(overrides: Partial<GridStageModel>): GridStageModel {
	return {
		title: 'I Only Have Eyes for You',
		beatsPerBar: 4,
		changes: IOHEFY,
		index: 1,
		cue: { kind: 'climb', set: 'sol‑si‑mi', direction: 'up' },
		aid: null,
		chordDiagram: 'strings',
		anchorBeat: null,
		history: [],
		miss: null,
		...overrides
	};
}

/** A G played for a Dm: what was heard, what was asked, what parts them. */
const MISS: DrawnMiss = {
	heard: {
		notes: [
			{ string: 3, fret: 7 },
			{ string: 2, fret: 8 },
			{ string: 1, fret: 7 }
		]
	},
	expected: {
		notes: [
			{ string: 3, fret: 7 },
			{ string: 2, fret: 6 },
			{ string: 1, fret: 5 }
		]
	},
	gap: 'pas le bon accord',
	style: 'grid'
};

describe('GridScrollView', () => {
	it('draws a miss, heard and expected in its style, until the next change', async () => {
		const controller = new StageController();
		controller.nowBeat = 12.5;
		const { rerender } = render(GridScrollView, {
			props: { controller, model: model({ anchorBeat: 12, miss: MISS }) }
		});
		const miss = screen.getByTestId('miss');
		expect(miss.textContent).toMatch(/Joué/);
		expect(miss.textContent).toMatch(/Attendu/);
		expect(screen.getByText('pas le bon accord')).toBeTruthy();
		expect(miss.querySelectorAll('.chord-shape[data-style="grid"]')).toHaveLength(2);
		// The next change, or a change played right: no miss in its model.
		await rerender({ controller, model: model({ index: 2, anchorBeat: 16 }) });
		expect(screen.queryByTestId('miss')).toBeNull();
	});

	it('shows the chord on show large, the next one, and the cue of the exercise', () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		controller.nowBeat = 12.2;
		render(GridScrollView, { props: { controller, model: model({ anchorBeat: 12 }) } });
		expect(screen.getByTestId('current-chord').textContent).toBe('G7');
		expect(screen.getByTestId('next-chord').textContent).toBe('Dm7');
		expect(screen.getByText('sol‑si‑mi · ↑ en montant')).toBeTruthy();
		expect(screen.getByText('I Only Have Eyes for You')).toBeTruthy();
	});

	it('names the zone, and draws the aid of the next change in its style', () => {
		const controller = new StageController();
		controller.nowBeat = 12.2;
		const aid = {
			notes: [
				{ string: 3 as const, fret: 7 },
				{ string: 2 as const, fret: 8 },
				{ string: 1 as const, fret: 7 }
			]
		};
		render(GridScrollView, {
			props: {
				controller,
				model: model({
					cue: { kind: 'zone', from: 5, to: 8 },
					aid,
					anchorBeat: 12,
					chordDiagram: 'grid'
				})
			}
		});
		expect(screen.getByText('cases 5 à 8')).toBeTruthy();
		expect(screen.getByText('Forme suivante')).toBeTruthy();
		expect(document.querySelector('.chord-shape[data-style="grid"]')).toBeTruthy();
	});

	it('puts the verdicts of its history on the changes played', () => {
		const controller = new StageController();
		controller.view.status = 'verdict';
		controller.nowBeat = 12.6;
		const history = [{ beatIndex: 8, verdict: 'perfect' as const }];
		render(GridScrollView, { props: { controller, model: model({ anchorBeat: 12, history }) } });
		expect(document.querySelector('.cell.past .verdict')).toBeTruthy();
	});

	it('shows the first chord as the next one before the passage starts', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		render(GridScrollView, {
			props: { controller, model: model({ index: 0, cue: { kind: 'jam' } }) }
		});
		expect(screen.queryByTestId('current-chord')).toBeNull();
		expect(screen.getByTestId('next-chord').textContent).toBe('Dm7');
	});
});
