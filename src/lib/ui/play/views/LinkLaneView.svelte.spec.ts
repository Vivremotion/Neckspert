import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PassageStageModel } from '$lib/application/presentation/passageStage';
import { GESTURE_LINK } from '$lib/testing/catalog';
import { passageModel } from '$lib/testing/changesPassages';
import { PLAY_VIEWS } from './index';
import LinkLaneView from './LinkLaneView.svelte';
import { StageController } from './testing/StageController.svelte';

afterEach(() => cleanup());

/**
 * Round `index` of the tour of E on G-B-E (its four lowest shapes up, then down again), its
 * target on `anchorBeat` (null before its round opens), at the aid level when `aided`.
 */
function model(
	index: number,
	aided: boolean,
	anchorBeat: number | null = index * 4
): PassageStageModel {
	return passageModel(GESTURE_LINK, 'chord=E;strings=3,2,1', index, {
		exerciseLevel: aided ? -1 : 0,
		anchorBeat
	});
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
			correction: null,
			heard: null,
			expected: {
				kind: 'shape' as const,
				notes: [
					{ string: 3 as const, fret: 9 },
					{ string: 2 as const, fret: 9 },
					{ string: 1 as const, fret: 7 }
				]
			},
			gap: 'aucun accord entendu'
		};
		const verdict = {
			verdict: 'wrong' as const,
			offsetMs: null,
			answerLabel: null,
			misses: [miss]
		};
		const controller = running(4.5);
		const { rerender } = render(LinkLaneView, {
			props: { controller, model: { ...model(1, false, 4), verdict } }
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

	/** The chord in the middle of the field, as the notes' lane shows a note. */
	const root = () => screen.getByTestId('link-root').querySelector('.main')?.textContent;

	it('shows the root big, its quality and the strings', () => {
		render(LinkLaneView, { props: { controller: running(0.5), model: model(0, false) } });
		expect(root()).toBe('E');
		expect(screen.getByText('majeur')).toBeTruthy();
		// One line, the strings named as the triads' lane names them (plan 4c, decided).
		expect(screen.getByText('sur cordes sol‑si‑mi')).toBeTruthy();
	});

	it('draws the root on the first tile of the notes’ lane, arrows after', () => {
		render(LinkLaneView, { props: { controller: running(0.5), model: model(0, false) } });
		// A tile per beat on the lane: the way on the first beat of each bar only, two bars ahead.
		const words = [...document.querySelectorAll('.lane .cell .label')].map((l) =>
			l.textContent?.trim()
		);
		expect(words).toEqual(['E', '↗', '↗']);
	});

	it('writes no beat number: the first beat of each bar is a downbeat, the change asked the target', () => {
		render(LinkLaneView, { props: { controller: running(9), model: model(2, false) } });
		const cells = [...document.querySelectorAll('.lane .cell')];
		expect(cells.some((cell) => /^[0-9]$/.test(cell.textContent?.trim() ?? ''))).toBe(false);
		// Twelve beats on the lane, three of them downbeats.
		expect(cells.filter((cell) => cell.hasAttribute('data-downbeat'))).toHaveLength(3);
		const due = document.querySelectorAll('.lane .cell[data-kind="target"]');
		expect(due).toHaveLength(1);
		expect(due[0].textContent?.trim()).toBe('↗');
	});

	it('draws no neck unaided, the notes in circles aided, each the colour of its tile, on the set’s strings', () => {
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
		// The set's three strings, the high one on top, as before.
		expect(
			[...screen.getByTestId('aid-neck').querySelectorAll('.name')].map((n) => n.textContent)
		).toEqual(['mi', 'si', 'sol']);
	});

	it('keeps the root on screen during the silence before the counted bar, with no count yet', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		render(LinkLaneView, { props: { controller, model: model(0, false, null) } });
		expect(root()).toBe('E');
		expect(screen.queryByTestId('link-countdown')).toBeNull();
	});

	it('writes the count above the root during the counted bar, the change where the count ends', () => {
		const controller = new StageController();
		controller.view.status = 'count-in';
		controller.view.countdown = 3;
		controller.nowBeat = 37;
		render(LinkLaneView, { props: { controller, model: model(0, false, null) } });
		expect(screen.getByTestId('link-countdown').textContent?.trim()).toBe('3');
		expect(root()).toBe('E');
		// The change falls where the count ends, on beat 40: its tile is the target, the root on it.
		const target = document.querySelector('.lane .cell[data-kind="target"]');
		expect(target?.textContent?.trim()).toBe('E');
		// The bars run from there: a downbeat on it, and every four beats either side.
		const cells = [...document.querySelectorAll('.lane .cell')];
		const downbeats = cells.flatMap((cell, i) => (cell.hasAttribute('data-downbeat') ? [i] : []));
		const at = cells.indexOf(target as Element);
		expect(downbeats).toEqual([at - 4, at, at + 4]);
	});
});
