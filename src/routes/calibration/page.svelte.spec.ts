import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

describe('/calibration page', () => {
	afterEach(() => {
		cleanup();
	});

	it('starts the meter on listen and stops the detector on unmount', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [
			{ id: 'usb', label: 'Scarlett 2i2 USB' },
			{ id: 'built', label: 'Built-in Microphone' }
		];
		const view = render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await waitFor(() => expect(services.detector.running).toBe(true));

		services.detector.emitLevel(0.5);
		await waitFor(() => expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('50'));

		view.unmount();
		expect(services.detector.running).toBe(false);
	});

	it('saves offset and device id on a successful run', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		services.calibration.nextOutcome = { ok: true, offsetMs: 42, spreadMs: 4 };
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));

		await waitFor(async () => {
			const settings = await services.settings.get();
			expect(settings.calibrationOffsetMs).toBe(42);
			expect(settings.inputDeviceId).toBe('usb');
		});
		expect(services.calibration.runCalls).toBe(1);
		expect(screen.getByText(/42/)).toBeTruthy();
	});

	it('cancels an in-flight run when the user presses cancel', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		let release!: (outcome: { ok: false; reason: 'cancelled' }) => void;
		services.calibration.run = async (onProgress) => {
			onProgress({ hits: 1, needed: 10, lastOffsetMs: 10 });
			return new Promise((resolve) => {
				release = resolve;
				services.calibration.cancel = () => {
					services.calibration.cancelled = true;
					resolve({ ok: false, reason: 'cancelled' });
				};
			});
		};
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));
		await waitFor(() => expect(screen.getByRole('button', { name: /annuler/i })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /annuler/i }));
		await waitFor(() => expect(screen.getByText(/annul/i)).toBeTruthy());
		expect(services.calibration.cancelled).toBe(true);
		release?.({ ok: false, reason: 'cancelled' });
	});
});
