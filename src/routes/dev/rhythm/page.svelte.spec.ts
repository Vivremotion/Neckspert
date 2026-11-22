import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';
import RhythmPage from './+page.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/dev/rhythm?shot=derived') }
}));

describe('/dev/rhythm?shot=derived', () => {
	afterEach(() => {
		cleanup();
		loadDefinitions({ catalog: CATALOG_FILES });
	});

	it('draws the arpeggio’s prompt over the catalog alone, as the app loads it', () => {
		// The app's registries hold the catalog's skills only, not the tests' own.
		loadDefinitions({ catalog: CATALOG_FILES });
		render(RhythmPage);
		expect(screen.getByTestId('figure-prompt').textContent).toContain('sol‑si‑mi');
	});
});
