import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AudioInputDevice } from '$lib/application/ports';
import { i18n } from '$lib/i18n/index.svelte';
import SettingsScreen from './SettingsScreen.svelte';

const INPUTS: AudioInputDevice[] = [
	{ id: 'usb', label: 'Scarlett 2i2 USB' },
	{ id: 'built', label: 'Built-in Microphone' }
];

function renderScreen(
	overrides: Partial<{
		locale: 'fr' | 'en';
		tempoBpm: number;
		inputDeviceId: string | null;
		builtInInputGain: number;
		calibrationOffsetMs: number | null;
		importError: string | null;
		confirmingImport: boolean;
		onlocale: (locale: 'fr' | 'en') => void;
		ontempo: (bpm: number) => void;
		oninput: (id: string | null) => void;
		onbuiltingain: (gain: number) => void;
		onexport: () => void;
		onimportfile: (file: File) => void;
		onimportconfirm: () => void;
		onimportcancel: () => void;
		inputs: AudioInputDevice[];
		onunlock: () => void;
	}> = {}
) {
	const props = {
		locale: 'fr' as const,
		tempoBpm: 80,
		inputs: INPUTS,
		inputDeviceId: 'usb' as string | null,
		builtInInputGain: 8,
		calibrationOffsetMs: 42 as number | null,
		importError: null as string | null,
		confirmingImport: false,
		onlocale: vi.fn(),
		ontempo: vi.fn(),
		oninput: vi.fn(),
		onbuiltingain: vi.fn(),
		onexport: vi.fn(),
		onimportfile: vi.fn(),
		onimportconfirm: vi.fn(),
		onimportcancel: vi.fn(),
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

	it('steps tempo within 80..160 and disables at the edges', async () => {
		const low = renderScreen({ tempoBpm: 80 });
		expect(screen.getByRole('button', { name: '−' })).toHaveProperty('disabled', true);
		await fireEvent.click(screen.getByRole('button', { name: '+' }));
		expect(low.props.ontempo).toHaveBeenCalledWith(81);
		cleanup();

		const high = renderScreen({ tempoBpm: 160 });
		expect(screen.getByRole('button', { name: '+' })).toHaveProperty('disabled', true);
		await fireEvent.click(screen.getByRole('button', { name: '−' }));
		expect(high.props.ontempo).toHaveBeenCalledWith(159);
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

	it('links to calibration and exports on click', async () => {
		const { props } = renderScreen();
		const link = screen.getByRole('link', { name: /calibration/i });
		expect(link.getAttribute('href')).toBe('/calibration');
		await fireEvent.click(screen.getByRole('button', { name: /exporter/i }));
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
});
