import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';
import { i18n } from '$lib/i18n/index.svelte';
import DemoPage from './+page.svelte';
import IdentifyPage from '../../dev/identify/+page.svelte';
import RhythmPage from '../../dev/rhythm/+page.svelte';
import GesturePage from '../../dev/gesture/+page.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/session/demo') }
}));

/** The registries as an install whose files define no exercise at all. */
function noExercise(): void {
	loadDefinitions({ catalog: {} });
}

describe('the demonstration pages with nothing in the registry for them', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
		loadDefinitions({ catalog: CATALOG_FILES });
	});

	it('/session/demo says so, in French and in English, and throws nothing', () => {
		noExercise();
		render(DemoPage);
		expect(screen.getByText(/Aucun exercice ne fait trouver de note sur une corde/)).toBeTruthy();
		cleanup();
		i18n.locale = 'en';
		render(DemoPage);
		expect(screen.getByText(/No exercise asks to find a note on a string/)).toBeTruthy();
	});

	it('/dev/identify, /dev/rhythm and /dev/gesture say so, and throw nothing', () => {
		noExercise();
		render(IdentifyPage);
		expect(screen.getByText(/No exercise names places on the neck/)).toBeTruthy();
		cleanup();
		render(RhythmPage);
		expect(screen.getByText(/No exercise on the figure view writes a figure/)).toBeTruthy();
		cleanup();
		render(GesturePage);
		expect(screen.getByText(/No exercise plays passages on this view/)).toBeTruthy();
	});
});
