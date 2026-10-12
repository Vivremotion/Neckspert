import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { GridStageModel } from '$lib/application/mechanics/chordGrid';
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
		...overrides
	};
}

describe('GridScrollView', () => {
	it('shows the chord on show large, the next one, and the cue of the exercise', () => {
		const controller = new StageController();
		controller.view.status = 'awaiting';
		controller.view.targetBeatIndex = 12;
		controller.nowBeat = 12.2;
		render(GridScrollView, { props: { controller, model: model({}) } });
		expect(screen.getByTestId('current-chord').textContent).toBe('G7');
		expect(screen.getByTestId('next-chord').textContent).toBe('Dm7');
		expect(screen.getByText('sol‑si‑mi · ↑ en montant')).toBeTruthy();
		expect(screen.getByText('I Only Have Eyes for You')).toBeTruthy();
	});

	it('names the zone, and draws the aid of the next change', () => {
		const controller = new StageController();
		controller.view.targetBeatIndex = 12;
		controller.nowBeat = 12.2;
		const aid = {
			notes: [
				{ string: 3 as const, fret: 7 },
				{ string: 2 as const, fret: 8 },
				{ string: 1 as const, fret: 7 }
			]
		};
		render(GridScrollView, {
			props: { controller, model: model({ cue: { kind: 'zone', from: 5, to: 8 }, aid }) }
		});
		expect(screen.getByText('cases 5 à 8')).toBeTruthy();
		expect(screen.getByText('Forme suivante')).toBeTruthy();
		expect(document.querySelector('.chord-shape')).toBeTruthy();
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
