import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

vi.mock('$lib/infrastructure/storage', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/infrastructure/storage')>();
	return {
		...actual,
		downloadBackup: vi.fn()
	};
});

import { downloadBackup } from '$lib/infrastructure/storage';

describe('/settings page', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
		vi.clearAllMocks();
	});

	it('applies language immediately to settings and i18n', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: 'EN' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'EN' }));
		await waitFor(async () => {
			expect(i18n.locale).toBe('en');
			expect((await services.settings.get()).locale).toBe('en');
		});
	});

	it('exports through downloadBackup', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: /exporter/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /exporter/i }));
		await waitFor(() => expect(downloadBackup).toHaveBeenCalledTimes(1));
	});

	it('shows a readable error for an invalid file and imports after confirm', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: /importer/i })).toBeTruthy());

		const bad = new File(['{"app":"nope"}'], 'bad.json', { type: 'application/json' });
		const hidden = document.querySelector('input[type="file"]') as HTMLInputElement;
		await fireEvent.change(hidden, { target: { files: [bad] } });
		await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Neckspert Play/i));

		const good = new File(
			[
				JSON.stringify({
					app: 'neckspert-play',
					version: 1,
					exportedAt: 9,
					settings: { ...DEFAULT_SETTINGS, locale: 'en', tempoBpm: 100 },
					cards: [],
					attempts: [],
					sessions: []
				})
			],
			'good.json',
			{ type: 'application/json' }
		);
		await fireEvent.change(hidden, { target: { files: [good] } });
		await waitFor(() => expect(screen.getByText(/remplac/i)).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /confirmer/i }));
		await waitFor(async () => {
			expect((await services.backup.exportAll()).progressions).toMatchObject([
				{ exerciseId: 'locate-neck', tempoBpm: 100 }
			]);
			expect(i18n.locale).toBe('en');
		});
	});
});
