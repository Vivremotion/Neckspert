import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { chordGridPresenter, type LinkLaneModel } from '$lib/application/mechanics/chordGrid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { PLAY_VIEWS } from './index';
import LinkLaneView from './LinkLaneView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const CHANGES = [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'E' }));

/** Change `index`'s model, its target on `anchorBeat` (null before its round opens). */
function model(
	index: number,
	aided: boolean,
	anchorBeat: number | null = index * 4
): LinkLaneModel {
	const item: ChordGridItem = {
		rule: 'link',
		element: 'link:E|maj:3,2,1',
		passageId: 's:0',
		index,
		changes: CHANGES,
		symbol: 'E',
		chord: 'E|maj',
		sets: [[3, 2, 1]],
		previous: null
	};
	return chordGridPresenter.stageOf!(
		item,
		null,
		'fr',
		{ aid: aided ? 'show-position' : 'none' },
		{ anchorBeat, history: [] }
	).model as LinkLaneModel;
}

function running(nowBeat: number) {
	const controller = new StageController();
	controller.view.status = 'awaiting';
	controller.nowBeat = nowBeat;
	return controller;
}

describe('LinkLaneView', () => {
	it('draws a miss, heard and expected, until the next change', async () => {
		const miss = {
			heard: null,
			expected: {
				notes: [
					{ string: 3 as const, fret: 9 },
					{ string: 2 as const, fret: 9 },
					{ string: 1 as const, fret: 7 }
				]
			},
			gap: 'aucun accord entendu',
			style: 'strings' as const
		};
		const controller = running(4.5);
		const { rerender } = render(LinkLaneView, {
			props: { controller, model: { ...model(1, false, 4), miss } }
		});
		const drawn = screen.getByTestId('miss');
		expect(drawn.textContent).toMatch(/Attendu/);
		expect(drawn.textContent).not.toMatch(/Joué/);
		expect(screen.getByText('aucun accord entendu')).toBeTruthy();
		expect(drawn.querySelectorAll('.chord-shape')).toHaveLength(1);
		await rerender({ controller, model: model(2, false, 8) });
		expect(screen.queryByTestId('miss')).toBeNull();
	});

	it('is the view of the link', () => {
		expect(PLAY_VIEWS['link-lane']).toBe(LinkLaneView);
		expect(PLAY_VIEWS['link-path']).toBeUndefined();
	});

	it('shows the root big, its quality and the strings', () => {
		render(LinkLaneView, { props: { controller: running(0.5), model: model(0, false) } });
		expect(screen.getByTestId('link-root').textContent).toBe('E');
		expect(screen.getByText('majeur')).toBeTruthy();
		expect(screen.getByText('sur cordes')).toBeTruthy();
		expect(screen.getByText('sol · si · mi')).toBeTruthy();
	});

	it('draws the root on the first tile, arrows after', () => {
		render(LinkLaneView, { props: { controller: running(0.5), model: model(0, false) } });
		// A tile per beat: the way on the first beat of each bar only, two bars ahead.
		expect(screen.getAllByTestId('link-tile').map((t) => t.textContent?.trim())).toEqual([
			'E',
			'↗',
			'↗'
		]);
	});

	it('numbers the beats ahead, as on the notes lane, the change asked due', () => {
		render(LinkLaneView, { props: { controller: running(9), model: model(2, false) } });
		expect(screen.getAllByTestId('link-beat').map((b) => b.textContent?.trim())).toEqual([
			'3',
			'4',
			'1',
			'2',
			'3',
			'4',
			'1',
			'2'
		]);
		const due = document.querySelectorAll('.body.due');
		expect(due).toHaveLength(1);
		expect(due[0].textContent?.trim()).toBe('↗');
	});

	it('draws no neck unaided, the notes in circles aided, each the colour of its tile', () => {
		render(LinkLaneView, { props: { controller: running(9), model: model(2, false) } });
		expect(screen.queryByTestId('aid-neck')).toBeNull();
		cleanup();
		render(LinkLaneView, { props: { controller: running(9), model: model(2, true) } });
		expect(screen.getByTestId('aid-neck')).toBeTruthy();
		const notes = screen.getAllByTestId('aid-note');
		expect(notes.map((n) => [n.getAttribute('data-shape'), n.textContent?.trim()])).toEqual([
			['now', 'E'],
			['now', 'G#'],
			['now', 'B'],
			['next', 'G#'],
			['next', 'B'],
			['next', 'E']
		]);
	});

	it('shows the root bigger during the silence before the counted bar', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		render(LinkLaneView, { props: { controller, model: model(0, false, null) } });
		expect(screen.getByTestId('link-root').classList.contains('counting')).toBe(true);
	});

	it('shows the root bigger during the counted bar', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		controller.view.countdown = 3;
		controller.nowBeat = 37;
		render(LinkLaneView, { props: { controller, model: model(0, false, null) } });
		expect(screen.getByTestId('link-root').classList.contains('counting')).toBe(true);
		expect(screen.getAllByTestId('link-tile')[0].textContent?.trim()).toBe('E');
		// The change falls where the count ends: beats 38 to 40 numbered 3, 4, 1.
		expect(
			screen
				.getAllByTestId('link-beat')
				.slice(0, 3)
				.map((b) => b.textContent?.trim())
		).toEqual(['3', '4', '1']);
	});
});
