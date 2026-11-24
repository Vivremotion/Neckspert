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
 * target on `anchorBeat` (null before its round opens), at level 1, which draws the notes of its
 * shapes, when `drawn`, else at level 2, which draws nothing.
 */
function model(
	index: number,
	drawn: boolean,
	anchorBeat: number | null = index * 4
): PassageStageModel {
	return passageModel(GESTURE_LINK, 'chord=E;strings=3,2,1', index, {
		exerciseLevel: drawn ? 0 : 1,
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

	it('shows the root big, its quality and the strings', () => {
		render(LinkLaneView, { props: { controller: running(0.5), model: model(0, false) } });
		expect(screen.getByTestId('link-root').textContent).toBe('E');
		expect(screen.getByText('majeur')).toBeTruthy();
		// One line, the strings named as the triads' lane names them (plan 4c, decided).
		expect(screen.getByText('sur cordes sol‑si‑mi')).toBeTruthy();
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

	it('draws no neck at a level that names no picture, else the notes in circles, each the colour of its tile, on the set’s strings', () => {
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
