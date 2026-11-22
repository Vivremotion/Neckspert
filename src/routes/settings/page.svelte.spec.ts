import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { i18n } from '$lib/i18n/index.svelte';
import { createFakeAppServices } from '$lib/ui/screens/calibration/fakeServices';
import TestHarness from './TestHarness.svelte';

vi.mock('$lib/infrastructure/diagnostics', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/infrastructure/diagnostics')>();
	return {
		...actual,
		downloadDiagnosticArchive: vi.fn()
	};
});

vi.mock('$lib/infrastructure/storage', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/infrastructure/storage')>();
	return {
		...actual,
		downloadBackup: vi.fn()
	};
});

import { downloadBackup } from '$lib/infrastructure/storage';
import { downloadDiagnosticArchive } from '$lib/infrastructure/diagnostics';

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

		await waitFor(() => expect(screen.getByRole('button', { name: 'Exporter' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
		await waitFor(() => expect(downloadBackup).toHaveBeenCalledTimes(1));
	});

	it('shows a readable error for an invalid file and imports after confirm', async () => {
		const services = createFakeAppServices();
		services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
		render(TestHarness, { props: { services } });

		await waitFor(() => expect(screen.getByRole('button', { name: /^importer$/i })).toBeTruthy());

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
					settings: {
						locale: 'en',
						tempoBpm: 100,
						calibrationOffsetMs: null,
						inputDeviceId: null,
						builtInInputGain: 8
					},
					cards: [],
					attempts: [],
					sessions: []
				})
			],
			'good.json',
			{ type: 'application/json' }
		);
		await fireEvent.change(hidden, { target: { files: [good] } });
		await waitFor(() => expect(screen.getByText(/Remplacer les données/)).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: /confirmer/i }));
		await waitFor(async () => {
			// The version 1 tempo went to a locate progression, which version 7 no longer keeps.
			const file = await services.backup.exportAll();
			expect(file.version).toBe(9);
			expect(file.settings.locale).toBe('en');
			expect(i18n.locale).toBe('en');
		});
	});

	describe('diagnostic journal', () => {
		function setup() {
			const services = createFakeAppServices();
			services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
			services.diagnostics.used = 3 * 1024 * 1024;
			render(TestHarness, { props: { services } });
			return services;
		}

		it('shows the space taken and the journal on by the build default in development', async () => {
			setup();
			await waitFor(() => expect(screen.getByText('3 Mo sur 300')).toBeTruthy());
			const toggle = screen.getByRole('button', { name: /enregistrer le son/i });
			expect(toggle.getAttribute('aria-pressed')).toBe('true');
		});

		it('saves the toggle and the budget in the settings', async () => {
			const services = setup();
			await waitFor(() => expect(screen.getByText('3 Mo sur 300')).toBeTruthy());
			await fireEvent.click(screen.getByRole('button', { name: /enregistrer le son/i }));
			await waitFor(async () =>
				expect((await services.settings.get()).diagnostics).toEqual({
					enabled: false,
					budgetMb: 300
				})
			);
			await fireEvent.click(screen.getByRole('button', { name: '1000 Mo' }));
			await waitFor(async () =>
				expect((await services.settings.get()).diagnostics).toEqual({
					enabled: false,
					budgetMb: 1000
				})
			);
			expect(screen.getByText('3 Mo sur 1000')).toBeTruthy();
		});

		it('downloads the diagnostic archive', async () => {
			setup();
			await waitFor(() => expect(screen.getByText('3 Mo sur 300')).toBeTruthy());
			await fireEvent.click(screen.getByRole('button', { name: 'Exporter le diagnostic' }));
			await waitFor(() => expect(downloadDiagnosticArchive).toHaveBeenCalledTimes(1));
		});

		it('shows why an export failed', async () => {
			const services = setup();
			services.diagnostics.exportArchive = async () => {
				throw new Error('Quota exceeded');
			};
			await waitFor(() => expect(screen.getByText('3 Mo sur 300')).toBeTruthy());
			await fireEvent.click(screen.getByRole('button', { name: 'Exporter le diagnostic' }));
			await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Quota exceeded/));
			expect(downloadDiagnosticArchive).not.toHaveBeenCalled();
		});

		it('builds one archive at a time', async () => {
			const services = setup();
			let finish: (blob: Blob) => void = () => {};
			let calls = 0;
			services.diagnostics.exportArchive = () => {
				calls++;
				return new Promise<Blob>((resolve) => (finish = resolve));
			};
			await waitFor(() => expect(screen.getByText('3 Mo sur 300')).toBeTruthy());
			const button = screen.getByRole('button', { name: 'Exporter le diagnostic' });
			await fireEvent.click(button);
			await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
			await fireEvent.click(button);
			expect(calls).toBe(1);
			finish(new Blob([]));
			await waitFor(() => expect(downloadDiagnosticArchive).toHaveBeenCalledTimes(1));
			await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
		});

		it('clears the journal and shows the space freed', async () => {
			const services = setup();
			await waitFor(() => expect(screen.getByText('3 Mo sur 300')).toBeTruthy());
			await fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
			await waitFor(() => expect(screen.getByText('0 Mo sur 300')).toBeTruthy());
			expect(services.diagnostics.clears).toBe(1);
		});
	});

	describe('imported files', () => {
		async function open() {
			const services = createFakeAppServices();
			services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
			render(TestHarness, { props: { services } });
			await waitFor(() => expect(document.querySelector('#imported-files input')).toBeTruthy());
			return services;
		}
		async function choose(...files: File[]) {
			const input = document.querySelector('#imported-files input') as HTMLInputElement;
			await fireEvent.change(input, { target: { files } });
		}

		it('lists a file whose text cannot be read as not imported', async () => {
			await open();
			const file = new File(['{}'], 'broken.json');
			file.text = () => Promise.reject(new Error('nope'));
			await choose(file);
			await waitFor(() =>
				expect(
					screen.getByText('broken.json n’a pas été importé : the file could not be read')
				).toBeTruthy()
			);
		});

		it('refuses a file far too long before reading its text', async () => {
			await open();
			const file = new File(['{}'], 'huge.json');
			Object.defineProperty(file, 'size', { value: 3_000_001 });
			const text = vi.spyOn(file, 'text');
			await choose(file);
			await waitFor(() =>
				expect(
					screen.getByText(
						'huge.json n’a pas été importé : the file is longer than 1000000 characters'
					)
				).toBeTruthy()
			);
			expect(text).not.toHaveBeenCalled();
		});

		it('shows a failed import as text and reads the list again', async () => {
			const services = await open();
			const files = vi.spyOn(services.definitions, 'files');
			services.definitions.import = () => Promise.reject(new Error('storage is full'));
			await choose(new File(['{}'], 'a.json'));
			await waitFor(() => expect(screen.getByText('storage is full')).toBeTruthy());
			expect(files).toHaveBeenCalled();
		});

		it('shows a failed removal as text and reads the list again', async () => {
			const services = await open();
			await choose(new File(['{}'], 'a.json'));
			await waitFor(() => expect(screen.getByText('a.json')).toBeTruthy());
			const files = vi.spyOn(services.definitions, 'files');
			services.definitions.remove = () => Promise.reject(new Error('cannot remove'));
			await fireEvent.click(screen.getByRole('button', { name: 'Supprimer a.json' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
			await waitFor(() => expect(screen.getByText('cannot remove')).toBeTruthy());
			expect(files).toHaveBeenCalled();
		});

		it('clears the not-imported lines at the next import and lists a stored file', async () => {
			await open();
			const big = new File(['x'.repeat(2_000_000)], 'big.json');
			await choose(big);
			await waitFor(() => expect(screen.getByText(/big\.json n’a pas été importé/)).toBeTruthy());
			await choose(new File(['{}'], 'ok.json'));
			await waitFor(() => expect(screen.getByText('ok.json')).toBeTruthy());
			expect(screen.queryByText(/big\.json n’a pas été importé/)).toBeNull();
		});

		it('shows a failed read of the list at load without losing the rest of the page', async () => {
			const services = createFakeAppServices();
			services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
			services.definitions.files = () => Promise.reject(new Error('list unreadable'));
			render(TestHarness, { props: { services } });
			await waitFor(() => expect(screen.getByText('list unreadable')).toBeTruthy());
			expect(screen.getByRole('button', { name: 'EN' })).toBeTruthy();
		});

		it('keeps a newer import list when a late load finishes', async () => {
			const services = createFakeAppServices();
			services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
			let release: () => void = () => {};
			const gate = new Promise<void>((resolve) => (release = resolve));
			const real = services.definitions.files.bind(services.definitions);
			let first = true;
			services.definitions.files = async () => {
				if (first) {
					first = false;
					await gate;
					return [];
				}
				return real();
			};
			render(TestHarness, { props: { services } });
			await waitFor(() => expect(document.querySelector('#imported-files input')).toBeTruthy());
			const input = document.querySelector('#imported-files input') as HTMLInputElement;
			await fireEvent.change(input, { target: { files: [new File(['{}'], 'new.json')] } });
			await waitFor(() => expect(screen.getByText('new.json')).toBeTruthy());
			release();
			await new Promise((r) => setTimeout(r, 20));
			expect(screen.getByText('new.json')).toBeTruthy();
		});

		it('shows what kept the files from loading even when a stored file bears that name', async () => {
			const services = createFakeAppServices();
			services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
			const unfinished = {
				file: 'imported files',
				kind: 'file' as const,
				id: null,
				reason: 'the last load of the imported files did not finish'
			};
			services.definitions.refusals = () => [unfinished];
			await services.definitions.import([{ name: 'imported files', text: '{}' }]);
			render(TestHarness, { props: { services } });
			await waitFor(() =>
				expect(
					screen.getByText('imported files : the last load of the imported files did not finish')
				).toBeTruthy()
			);
		});

		it('shows what kept the imported files from loading, and reads it again after a removal', async () => {
			const services = createFakeAppServices();
			services.detector.listInputs = async () => [{ id: 'usb', label: 'Scarlett 2i2 USB' }];
			const unread = {
				file: 'imported files',
				kind: 'file' as const,
				id: null,
				reason: 'the imported files could not be read: blocked'
			};
			const ofFile = { file: 'a.json', kind: 'file' as const, id: null, reason: 'not JSON' };
			let refusals = [unread, ofFile];
			services.definitions.refusals = () => refusals;
			await services.definitions.import([{ name: 'a.json', text: '{}' }]);
			// As the service does: a stored file carries the refusals of its name.
			const files = services.definitions.files.bind(services.definitions);
			services.definitions.files = async () =>
				(await files()).map((file) => ({
					...file,
					refusals: refusals.filter((refusal) => refusal.file === file.name)
				}));
			render(TestHarness, { props: { services } });
			await waitFor(() =>
				expect(
					screen.getByText('imported files : the imported files could not be read: blocked')
				).toBeTruthy()
			);
			// A refusal of a stored file is told under it, not above the list.
			expect(screen.queryByText(/a\.json : not JSON/)).toBeNull();

			refusals = [];
			await fireEvent.click(screen.getByRole('button', { name: 'Supprimer a.json' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
			await waitFor(() =>
				expect(screen.queryByText(/the imported files could not be read/)).toBeNull()
			);
		});
	});
});
