import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { MissView } from '$lib/application/presentation/contentViews';
import type { PassageStageModel } from '$lib/application/presentation/passageStage';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_ZONE } from '$lib/testing/catalog';
import { passageModel } from '$lib/testing/changesPassages';
import GridScrollView from './GridScrollView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

/** A change of a climb of I Only Have Eyes for You on G-B-E, going up, as the series shows it. */
function model(overrides: Partial<PassageStageModel> & { index?: number } = {}): PassageStageModel {
	const { index = 1, ...rest } = overrides;
	return {
		...passageModel(GESTURE_CLIMB, 'grid=iohefy-a;strings=3,2,1', index, {
			each: { direction: 'up' }
		}),
		...rest
	};
}

/** A G played for a Dm: what was heard, what was asked, what parts them. */
const MISS: MissView = {
	correction: null,
	heard: {
		kind: 'shape',
		notes: [
			{ string: 3, fret: 7 },
			{ string: 2, fret: 8 },
			{ string: 1, fret: 7 }
		]
	},
	expected: {
		kind: 'shape',
		notes: [
			{ string: 3, fret: 7 },
			{ string: 2, fret: 6 },
			{ string: 1, fret: 5 }
		]
	},
	gap: 'pas le bon accord'
};

const missed = (miss: MissView) => ({
	verdict: 'wrong' as const,
	offsetMs: null,
	answerLabel: null,
	misses: [miss]
});

describe('GridScrollView', () => {
	it('draws a miss, heard and expected in its style, until the next change', async () => {
		const controller = new StageController();
		controller.nowBeat = 12.5;
		const { rerender } = render(GridScrollView, {
			props: {
				controller,
				model: model({ anchorBeat: 12, verdict: missed(MISS), chordDiagram: 'grid' })
			}
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

	it('names the zone, and draws the aid on the neck: the shapes admitted now and next', () => {
		const controller = new StageController();
		controller.nowBeat = 12.2;
		const zone = passageModel(GESTURE_ZONE, 'grid=iohefy-a', 1, {
			each: { zone: [5, 9] },
			exerciseLevel: -1,
			anchorBeat: 12
		});
		render(GridScrollView, { props: { controller, model: zone } });
		expect(screen.getByText('cases 5 à 9')).toBeTruthy();
		expect(screen.getByText('Forme suivante')).toBeTruthy();
		// The aid draws on the neck (plan 4c, D5): G's shapes in the zone now, Dm's next.
		const notes = screen.getAllByTestId('aid-note');
		expect(notes.map((n) => n.getAttribute('data-shape'))).toContain('now');
		expect(notes.map((n) => n.getAttribute('data-shape'))).toContain('next');
		expect(document.querySelector('.chord-shape')).toBeNull();
		// The four strings of the zone, the high one on top.
		expect(
			[...screen.getByTestId('aid-neck').querySelectorAll('.name')].map((n) => n.textContent)
		).toEqual(['mi', 'si', 'sol', 'ré']);
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
			props: { controller, model: passageModel(GESTURE_JAM, 'grid=iohefy-a', 0) }
		});
		expect(screen.queryByTestId('current-chord')).toBeNull();
		expect(screen.getByTestId('next-chord').textContent).toBe('Dm7');
		// The jam says no more than its grid.
		expect(document.querySelector('.cue')).toBeNull();
		expect(screen.getByText('I Only Have Eyes for You')).toBeTruthy();
	});
});
