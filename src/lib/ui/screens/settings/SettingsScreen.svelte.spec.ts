import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AudioInputDevice } from '$lib/application/ports';
import type { Settings } from '$lib/domain/types';
import { i18n } from '$lib/i18n/index.svelte';
import SettingsScreen from './SettingsScreen.svelte';

const INPUTS: AudioInputDevice[] = [
	{ id: 'usb', label: 'Scarlett 2i2 USB' },
	{ id: 'built', label: 'Built-in Microphone' }
];

function renderScreen(
	overrides: Partial<{
		locale: 'fr' | 'en';
		inputDeviceId: string | null;
		builtInInputGain: number;
		latency: Settings['latency'];
		importError: string | null;
		confirmingImport: boolean;
		onlocale: (locale: 'fr' | 'en') => void;
		oninput: (id: string | null) => void;
		onbuiltingain: (gain: number) => void;
		onexport: () => void;
		onimportfile: (file: File) => void;
		onimportconfirm: () => void;
		onimportcancel: () => void;
		inputs: AudioInputDevice[];
		onunlock: () => void;
		diagnosticsEnabled: boolean;
		diagnosticsBudgetMb: number;
		diagnosticsUsedBytes: number;
		diagnosticsNativeRate: boolean;
		chordDiagram: 'strings' | 'grid';
		onchorddiagram: (style: 'strings' | 'grid') => void;
	}> = {}
) {
	const props = {
		locale: 'fr' as const,
		inputs: INPUTS,
		inputDeviceId: 'usb' as string | null,
		builtInInputGain: 8,
		latency: { note: { ms: 42, provenance: 'player' } } as Settings['latency'],
		importError: null as string | null,
		confirmingImport: false,
		onlocale: vi.fn(),
		oninput: vi.fn(),
		onbuiltingain: vi.fn(),
		onexport: vi.fn(),
		onimportfile: vi.fn(),
		onimportconfirm: vi.fn(),
		onimportcancel: vi.fn(),
		diagnosticsEnabled: true,
		diagnosticsBudgetMb: 300,
		diagnosticsUsedBytes: 0,
		ondiagnostics: vi.fn(),
		ondiagnosticsbudget: vi.fn(),
		ondiagnosticsnativerate: vi.fn(),
		ondiagnosticsexport: vi.fn(),
		ondiagnosticsclear: vi.fn(),
		chordDiagram: 'strings' as 'strings' | 'grid',
		onchorddiagram: vi.fn(),
		...overrides
	};
	return { ...render(SettingsScreen, { props }), props };
}

describe('SettingsScreen', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it('switches language with large buttons', async () => {
		const { props } = renderScreen();
		await fireEvent.click(screen.getByRole('button', { name: 'EN' }));
		expect(props.onlocale).toHaveBeenCalledWith('en');
	});

	it('chooses how chord shapes are drawn, the current style disabled', async () => {
		const { props } = renderScreen({ chordDiagram: 'strings' });
		expect(screen.getByText('Dessin des accords')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Cordes' }) as HTMLButtonElement).disabled).toBe(
			true
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Grille' }));
		expect(props.onchorddiagram).toHaveBeenCalledWith('grid');
	});

	it('shows each chord drawing style beside its choice', () => {
		const { container } = renderScreen();
		expect(container.querySelector('.chord-shape[data-style="strings"]')).not.toBeNull();
		expect(container.querySelector('.chord-shape[data-style="grid"]')).not.toBeNull();
	});

	it('sets no tempo: each exercise keeps its own', () => {
		renderScreen();
		expect(screen.queryByText(/tempo/i)).toBeNull();
	});

	it('steps the built-in mic gain within 1..16', async () => {
		const mid = renderScreen({ builtInInputGain: 8 });
		expect(screen.getByText('×8')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /augmenter le niveau/i }));
		expect(mid.props.onbuiltingain).toHaveBeenCalledWith(9);
		cleanup();

		renderScreen({ builtInInputGain: 1 });
		expect(screen.getByRole('button', { name: /diminuer le niveau/i })).toHaveProperty(
			'disabled',
			true
		);
		cleanup();

		renderScreen({ builtInInputGain: 16 });
		expect(screen.getByRole('button', { name: /augmenter le niveau/i })).toHaveProperty(
			'disabled',
			true
		);
	});

	it('shows the calibrated latency of the note sensor, or that there is none', () => {
		renderScreen();
		expect(screen.getByText('Latence : 42 ms')).toBeTruthy();
		cleanup();
		renderScreen({ latency: { chord: { ms: 30, provenance: 'player' } } });
		expect(screen.getByText('Pas encore calibré')).toBeTruthy();
	});

	it('links to calibration and exports on click', async () => {
		const { props } = renderScreen();
		const link = screen.getByRole('link', { name: /calibration/i });
		expect(link.getAttribute('href')).toBe('/calibration');
		await fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
		expect(props.onexport).toHaveBeenCalledTimes(1);
	});

	it('asks for the microphone when no input is listed', async () => {
		const onunlock = vi.fn();
		renderScreen({ inputs: [], inputDeviceId: null, onunlock });
		expect(screen.getByText(/aucune entrée/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /autoriser le micro/i }));
		expect(onunlock).toHaveBeenCalledOnce();
	});

	it('shows import confirmation and a readable error', async () => {
		const confirming = renderScreen({ confirmingImport: true });
		expect(screen.getByText(/remplac/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /confirmer/i }));
		expect(confirming.props.onimportconfirm).toHaveBeenCalledTimes(1);
		cleanup();

		renderScreen({ importError: 'Not a Neckspert Play backup' });
		expect(screen.getByText(/Not a Neckspert Play backup/)).toBeTruthy();
	});

	describe('diagnostic block', () => {
		it('turns the journal off from its toggle when it is on, and on when it is off', async () => {
			const { props } = renderScreen({ diagnosticsEnabled: true });
			const toggle = screen.getByRole('button', {
				name: /enregistrer le son et les détails de la détection/i
			});
			expect(toggle.getAttribute('aria-pressed')).toBe('true');
			await fireEvent.click(toggle);
			expect(props.ondiagnostics).toHaveBeenCalledWith(false);
			cleanup();

			const off = renderScreen({ diagnosticsEnabled: false });
			const again = screen.getByRole('button', {
				name: /enregistrer le son et les détails de la détection/i
			});
			expect(again.getAttribute('aria-pressed')).toBe('false');
			await fireEvent.click(again);
			expect(off.props.ondiagnostics).toHaveBeenCalledWith(true);
		});

		it('offers three budgets, the current one disabled', async () => {
			const { props } = renderScreen({ diagnosticsBudgetMb: 300 });
			expect((screen.getByRole('button', { name: '300 Mo' }) as HTMLButtonElement).disabled).toBe(
				true
			);
			expect((screen.getByRole('button', { name: '100 Mo' }) as HTMLButtonElement).disabled).toBe(
				false
			);
			await fireEvent.click(screen.getByRole('button', { name: '1000 Mo' }));
			expect(props.ondiagnosticsbudget).toHaveBeenCalledWith(1000);
		});

		it('shows the space taken against the budget', () => {
			renderScreen({ diagnosticsUsedBytes: 42 * 1024 * 1024, diagnosticsBudgetMb: 300 });
			expect(screen.getByText('42 Mo sur 300')).toBeTruthy();
		});

		it('shows the space in English', () => {
			i18n.locale = 'en';
			renderScreen({ locale: 'en', diagnosticsUsedBytes: 42 * 1024 * 1024 });
			expect(screen.getByText('42 MB of 300')).toBeTruthy();
			expect(
				screen.getByRole('button', { name: /record sound and detection details/i })
			).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Export diagnostics' })).toBeTruthy();
		});

		it('offers the native rate in development and saves the choice', async () => {
			const { props } = renderScreen({ diagnosticsNativeRate: false });
			expect(screen.getByText('Enregistrer au débit natif')).toBeTruthy();
			const toggle = screen.getByRole('button', { name: /enregistrer au débit natif/i });
			expect(toggle.getAttribute('aria-pressed')).toBe('false');
			await fireEvent.click(toggle);
			expect(props.ondiagnosticsnativerate).toHaveBeenCalledWith(true);
		});

		it('shows the native rate as on, and offers to turn it off', async () => {
			i18n.locale = 'en';
			const { props } = renderScreen({ locale: 'en', diagnosticsNativeRate: true });
			const toggle = screen.getByRole('button', { name: 'Record at the native rate: on' });
			expect(toggle.getAttribute('aria-pressed')).toBe('true');
			await fireEvent.click(toggle);
			expect(props.ondiagnosticsnativerate).toHaveBeenCalledWith(false);
		});

		it('hides the native rate outside development', () => {
			vi.stubEnv('DEV', false);
			try {
				renderScreen();
				expect(screen.queryByText('Enregistrer au débit natif')).toBeNull();
				expect(screen.queryByRole('button', { name: /débit natif/i })).toBeNull();
			} finally {
				vi.unstubAllEnvs();
			}
		});

		it('exports and clears the journal', async () => {
			const { props } = renderScreen();
			await fireEvent.click(screen.getByRole('button', { name: 'Exporter le diagnostic' }));
			expect(props.ondiagnosticsexport).toHaveBeenCalledTimes(1);
			await fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
			expect(props.ondiagnosticsclear).toHaveBeenCalledTimes(1);
		});
	});
});
