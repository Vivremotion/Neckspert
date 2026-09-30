import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AudioInputDevice } from '$lib/application/ports';
import { i18n } from '$lib/i18n/index.svelte';
import CalibrationScreen from './CalibrationScreen.svelte';

const INPUTS: AudioInputDevice[] = [
	{ id: 'built', label: 'Built-in Microphone' },
	{ id: 'usb', label: 'Scarlett 2i2 USB' }
];

function renderScreen(
	overrides: Partial<{
		selectedDeviceId: string | null;
		listening: boolean;
		levelRms: number;
		phase: 'idle' | 'running' | 'done';
		progress: { hits: number; needed: number; lastOffsetMs: number | null } | null;
		outcome:
			| { ok: true; offsetMs: number; spreadMs: number }
			| { ok: false; reason: 'no-sound' | 'inconsistent' | 'cancelled' }
			| null;
		onselectdevice: (id: string | null) => void;
		onlisten: () => void;
		onstart: () => void;
		oncancel: () => void;
		onretry: () => void;
	}> = {}
) {
	const props = {
		inputs: INPUTS,
		selectedDeviceId: 'usb' as string | null,
		listening: false,
		levelRms: 0,
		phase: 'idle' as const,
		progress: null,
		outcome: null,
		onselectdevice: vi.fn(),
		onlisten: vi.fn(),
		onstart: vi.fn(),
		oncancel: vi.fn(),
		onretry: vi.fn(),
		...overrides
	};
	return { ...render(CalibrationScreen, { props }), props };
}

describe('CalibrationScreen', () => {
	afterEach(() => {
		cleanup();
		i18n.locale = 'fr';
	});

	it('lists inputs and recommends headphones for the built-in mic', async () => {
		const { props } = renderScreen({ selectedDeviceId: 'built' });
		expect(screen.getByRole('combobox')).toBeTruthy();
		expect(screen.getByText(/casque/i)).toBeTruthy();
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'usb' } });
		expect(props.onselectdevice).toHaveBeenCalledWith('usb');
	});

	it('starts the level meter on a user gesture', async () => {
		const { props } = renderScreen();
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		expect(props.onlisten).toHaveBeenCalledTimes(1);
	});

	it('shows progress while running and the muted-string instruction', () => {
		renderScreen({
			phase: 'running',
			progress: { hits: 3, needed: 10, lastOffsetMs: 20 }
		});
		expect(screen.getByText(/corde étouffée/i)).toBeTruthy();
		expect(screen.getByText(/3\s*\/\s*10/)).toBeTruthy();
	});

	it('shows success offset and offers retry after failure', async () => {
		const ok = renderScreen({
			phase: 'done',
			outcome: { ok: true, offsetMs: 42, spreadMs: 5 }
		});
		expect(screen.getByText(/42/)).toBeTruthy();
		cleanup();

		const { props } = renderScreen({
			phase: 'done',
			outcome: { ok: false, reason: 'no-sound' }
		});
		expect(screen.getByText(/aucun son/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
		expect(props.onretry).toHaveBeenCalledTimes(1);
	});

	it('exposes a keyboard-operable meter and large start control', () => {
		renderScreen({ listening: true, levelRms: 0.4 });
		const meter = screen.getByRole('meter');
		expect(meter.getAttribute('aria-valuenow')).toBe('40');
		const start = screen.getByRole('button', { name: /calibrer/i });
		expect(start.tagName).toBe('BUTTON');
		start.focus();
		expect(document.activeElement).toBe(start);
	});
});
