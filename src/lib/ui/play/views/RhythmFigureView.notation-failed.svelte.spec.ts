import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RhythmStageModel } from '$lib/application/session/cycle/rhythmStage';
import { RHYTHM_OFFBEATS } from '$lib/domain/exercise/rhythmCatalog';
import { i18n } from '$lib/i18n/index.svelte';
import RhythmFigureView from './RhythmFigureView.svelte';
import { FigureStageController } from './testing/FigureStageController.svelte';

// The notation chunk fails to load (a stale deploy, offline).
vi.mock('$lib/ui/notation', () => {
	throw new Error('Failed to fetch dynamically imported module');
});

afterEach(() => {
	cleanup();
	i18n.locale = 'fr';
});

function model(): RhythmStageModel {
	return {
		phase: 'listen-in',
		exerciseLabel: 'Contretemps',
		level: { shown: 1, of: 4, aid: false },
		tempo: { bpm: 80, unit: '♩' },
		figure: RHYTHM_OFFBEATS.figures![0].figure,
		next: null,
		barInCycle: 0,
		cycleBars: 1,
		muted: false,
		cursor: null,
		feedback: 'every-cycle',
		settled: [],
		announcement: null,
		listen: 'free',
		plainWords: true
	};
}

describe('RhythmFigureView, when the notation does not load', () => {
	it('still shows the header and the phase, and says the score could not load', async () => {
		render(RhythmFigureView, {
			props: { controller: new FigureStageController(), model: model() }
		});
		const message = await screen.findByRole('alert');
		expect(message.textContent?.trim()).toBe(
			'La partition n’a pas pu se charger : recharge la page.'
		);
		// Set at the meta size, 18 px at least.
		expect(message.classList.contains('notation-error')).toBe(true);
		expect(screen.getByTestId('rhythm-header').textContent).toContain('Contretemps');
		expect(screen.getByText('Écoute le clic')).toBeTruthy();
	});

	it('says it in English too', async () => {
		i18n.locale = 'en';
		render(RhythmFigureView, {
			props: { controller: new FigureStageController(), model: model() }
		});
		const message = await screen.findByRole('alert');
		expect(message.textContent?.trim()).toBe('The score could not load: reload the page.');
		expect(screen.getByText('Listen to the click')).toBeTruthy();
	});
});
