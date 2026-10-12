import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { chordGridPresenter, type LinkLaneModel } from '$lib/application/mechanics/chordGrid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { PLAY_VIEWS } from './index';
import LinkLaneView from './LinkLaneView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const CHANGES = [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'E' }));

function model(index: number, aided: boolean): LinkLaneModel {
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
	return chordGridPresenter.stage!(item, null, 'fr', { aid: aided ? 'show-position' : 'none' })
		.model as LinkLaneModel;
}

function running(index: number, nowBeat: number) {
	const controller = new StageController();
	controller.view.status = 'awaiting';
	controller.view.targetBeatIndex = index * 4;
	controller.nowBeat = nowBeat;
	return controller;
}

describe('LinkLaneView', () => {
	it('is the view of the link', () => {
		expect(PLAY_VIEWS['link-lane']).toBe(LinkLaneView);
		expect(PLAY_VIEWS['link-path']).toBeUndefined();
	});

	it('shows the root big, its quality and the strings', () => {
		render(LinkLaneView, { props: { controller: running(0, 0.5), model: model(0, false) } });
		expect(screen.getByTestId('link-root').textContent).toBe('E');
		expect(screen.getByText('majeur')).toBeTruthy();
		expect(screen.getByText('sur cordes')).toBeTruthy();
		expect(screen.getByText('sol · si · mi')).toBeTruthy();
	});

	it('draws the root on the first tile, arrows after', () => {
		render(LinkLaneView, { props: { controller: running(0, 0.5), model: model(0, false) } });
		expect(screen.getAllByTestId('link-tile').map((t) => t.textContent?.trim())).toEqual([
			'E',
			'↗',
			'↗',
			'↗',
			'↘'
		]);
	});

	it('puts the beat of the bar over the next tile', () => {
		render(LinkLaneView, { props: { controller: running(2, 9), model: model(2, false) } });
		const label = screen.getByTestId('link-beat');
		expect(label.textContent?.trim()).toBe('2');
		expect(label.closest('[data-state]')?.getAttribute('data-state')).toBe('next');
	});

	it('draws no neck unaided, the notes in circles aided, each the colour of its tile', () => {
		render(LinkLaneView, { props: { controller: running(2, 9), model: model(2, false) } });
		expect(screen.queryByTestId('aid-neck')).toBeNull();
		cleanup();
		render(LinkLaneView, { props: { controller: running(2, 9), model: model(2, true) } });
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

	it('shows the root bigger during the counted bar', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		controller.view.countdown = 3;
		controller.nowBeat = 37;
		render(LinkLaneView, { props: { controller, model: model(0, false) } });
		expect(screen.getByTestId('link-root').classList.contains('counting')).toBe(true);
		expect(screen.getAllByTestId('link-tile')[0].textContent?.trim()).toBe('E');
	});
});
