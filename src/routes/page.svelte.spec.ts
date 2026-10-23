import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { i18n } from '$lib/i18n/index.svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

describe('/ page', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
		vi.clearAllMocks();
	});

	it('starts learn on Space when nothing has the focus', async () => {
		render(TestHarness, { props: { services: createFakeAppServices() } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
		await fireEvent.keyDown(document.body, { code: 'Space', key: ' ' });
		expect(goto).toHaveBeenCalledWith('/session?kind=learn');
	});

	it('leaves Space to a focused link', async () => {
		render(TestHarness, { props: { services: createFakeAppServices() } });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Commencer' })).toBeTruthy());
		const link = document.createElement('a');
		link.href = '/somewhere';
		document.body.append(link);
		await fireEvent.keyDown(link, { code: 'Space', key: ' ' });
		expect(goto).not.toHaveBeenCalled();
		link.remove();
	});
});
