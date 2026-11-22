import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

describe('/library page', () => {
	afterEach(() => cleanup());

	it('lists what the service tells, each playable exercise leading to its session', async () => {
		const services = createFakeAppServices({
			library: async () => [
				{
					exerciseId: 'a',
					title: { fr: 'Exercice A', en: 'Exercise A' },
					routines: [],
					resting: false,
					playable: true
				},
				{
					exerciseId: 'b',
					title: { fr: 'Exercice B', en: 'Exercise B' },
					routines: [],
					resting: false,
					playable: false
				}
			]
		});
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByText('Exercice B')).toBeTruthy());
		expect(screen.getByRole('link', { name: /Exercice A/ }).getAttribute('href')).toBe(
			'/session?exercise=a'
		);
		expect(screen.queryByRole('link', { name: /Exercice B/ })).toBeNull();
	});

	it('tells a failure to read the library', async () => {
		const services = createFakeAppServices({
			library: async () => {
				throw new Error('broken');
			}
		});
		render(TestHarness, { props: { services } });
		await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('broken'));
	});
});
