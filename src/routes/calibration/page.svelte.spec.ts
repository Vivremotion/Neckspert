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

	it('saves the latency of each sensor measured, the bleed, and the device id on a successful run', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		await services.settings.update({ latency: { tap: { ms: 5, provenance: 'player' } } });
		services.calibration.nextOutcome = {
			ok: true,
			latency: {
				attack: { ms: 42, provenance: 'system' },
				note: { ms: 50, provenance: 'system' },
				chord: { ms: 50, provenance: 'system' }
			},
			clickBleed: true,
			measure: {
				referenceMs: 40,
				referenceSpreadMs: 0.5,
				offsetMs: -25,
				pairs: 16,
				played: 16,
				spreadMs: 2,
				latencyMs: 42
			}
		};
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));

		await waitFor(async () => {
			const settings = await services.settings.get();
			expect(settings.latency).toEqual({
				tap: { ms: 5, provenance: 'player' },
				attack: { ms: 42, provenance: 'system' },
				note: { ms: 50, provenance: 'system' },
				chord: { ms: 50, provenance: 'system' }
			});
			expect(settings.clickBleed).toBe(true);
			expect(settings.inputDeviceId).toBe('usb');
		});
		expect(services.calibration.runCalls).toBe(1);
		expect(screen.getByText(/42 ms/)).toBeTruthy();
	});

	it('calibrates the input chosen on the screen, and saves nothing when the run fails', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [
			{ id: 'usb', label: 'Scarlett 2i2 USB' },
			{ id: 'built', label: 'Built-in Microphone' }
		];
		services.calibration.nextOutcome = { ok: false, reason: 'inconsistent' };
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'built' } });
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));
		await waitFor(() => expect(screen.getByText(/ne s’accordent pas assez/i)).toBeTruthy());
		expect(services.calibration.lastDeviceId).toBe('built');
		const settings = await services.settings.get();
		expect(settings.inputDeviceId).toBeNull();
		expect(settings.latency).toEqual({});
	});

	it('says the input did not open when the run fails to start, and offers a retry', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		services.calibration.run = async () => {
			throw new Error('NotFoundError: Requested device not found');
		};
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /calibrer/i }));
		await waitFor(() => expect(screen.getByText(/ne s’est pas ouverte/i)).toBeTruthy());
		expect(screen.getByText(/Requested device not found/)).toBeTruthy();
		expect(screen.getByRole('button', { name: /réessayer/i })).toBeTruthy();
	});

	it('offers the click once the reference failed, and keeps the bleed it did not check', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		await services.settings.update({ clickBleed: true });
		services.calibration.nextOutcome = {
			ok: false,
			reason: 'reference',
			detail: {
				mic: 'MacBook Pro Microphone',
				opened: true,
				heard: 1,
				clicks: 8,
				delayMs: 60,
				spreadMs: 0
			}
		};
		services.calibration.nextClickOutcome = {
			ok: true,
			latency: { attack: { ms: 31, provenance: 'player' } },
			clickBleed: null,
			measure: {
				referenceMs: null,
				referenceSpreadMs: null,
				offsetMs: null,
				pairs: 10,
				played: 10,
				spreadMs: 4,
				latencyMs: 31
			}
		};
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /^calibrer$/i }));
		const onClick = await screen.findByRole('button', { name: 'Calibrer sur mon jeu au clic' });
		// Nothing is saved from a failed run.
		expect((await services.settings.get()).latency).toEqual({});
		await fireEvent.click(onClick);
		await waitFor(async () => {
			const settings = await services.settings.get();
			expect(settings.latency).toEqual({ attack: { ms: 31, provenance: 'player' } });
			expect(settings.inputDeviceId).toBe('usb');
		});
		expect(services.calibration.clickCalls).toBe(1);
		expect(services.calibration.lastDeviceId).toBe('usb');
		expect((await services.settings.get()).clickBleed).toBe(true);
	});

	it('cancels an in-flight run when the user presses cancel', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		let release!: (outcome: { ok: false; reason: 'cancelled' }) => void;
		services.calibration.run = async (_deviceId, onProgress) => {
			onProgress({ phase: 'listen', done: 1, needed: 8 });
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
