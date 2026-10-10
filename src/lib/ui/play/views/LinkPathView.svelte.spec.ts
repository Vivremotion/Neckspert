import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { chordGridPresenter, type LinkPathModel } from '$lib/application/mechanics/chordGrid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import { PLAY_VIEWS } from './index';
import LinkPathView from './LinkPathView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

const CHANGES = [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'D' }));

function model(index: number, aided: boolean): LinkPathModel {
	const item: ChordGridItem = {
		rule: 'link',
		element: 'link:D|maj:3,2,1',
		passageId: 's:0',
		index,
		changes: CHANGES,
		symbol: 'D',
		chord: 'D|maj',
		sets: [[3, 2, 1]],
		previous: null
	};
	return chordGridPresenter.stage!(item, null, 'fr', { aid: aided ? 'show-position' : 'none' })
		.model as LinkPathModel;
}

describe('LinkPathView', () => {
	it('is the view of the link', () => {
		expect(PLAY_VIEWS['link-path']).toBe(LinkPathView);
	});

	it('says what to play now, big, with its inversion, the next one small, and the way', () => {
		const controller = new StageController();
		controller.view.targetBeatIndex = 8;
		controller.nowBeat = 9.2;
		render(LinkPathView, { props: { controller, model: model(1, true) } });
		expect(screen.getByText('Relier · D · sol‑si‑mi')).toBeTruthy();
		expect(screen.getByText('monte, puis redescends par le même chemin')).toBeTruthy();
		expect(screen.getByText('Maintenant')).toBeTruthy();
		expect(screen.getByTestId('current-shape').textContent).toBe('2');
		expect(screen.getByText('fondamentale sur sol')).toBeTruthy();
		expect(screen.getByText(/Ensuite/).textContent).toMatch(/3/);
		expect(screen.getByRole('img').getAttribute('aria-label')).toBe('temps 2 sur 4');
		expect(screen.getAllByTestId('shape-tag').map((tag) => tag.textContent?.trim())).toEqual([
			'1',
			'2',
			'3',
			'4'
		]);
		expect(document.querySelectorAll('.dot')).toHaveLength(12);
		expect(document.querySelectorAll('.dot.current')).toHaveLength(3);
		expect(screen.queryByText(/forme suivante/i)).toBeNull();
	});

	it('draws no dot without the aid, only the numbered frames', () => {
		const controller = new StageController();
		controller.view.targetBeatIndex = 8;
		render(LinkPathView, { props: { controller, model: model(1, false) } });
		expect(document.querySelectorAll('.dot')).toHaveLength(0);
		expect(document.querySelectorAll('.block')).toHaveLength(4);
		expect(document.querySelector('.block.current')).toBeTruthy();
	});

	it('turns the arrows back on the way down', () => {
		const controller = new StageController();
		controller.view.targetBeatIndex = 24;
		render(LinkPathView, { props: { controller, model: model(4, true) } });
		expect(screen.getByText('tu redescends par le même chemin')).toBeTruthy();
		expect(screen.getAllByText('←')).toHaveLength(3);
	});
});
