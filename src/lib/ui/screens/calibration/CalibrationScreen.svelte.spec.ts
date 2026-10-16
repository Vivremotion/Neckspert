import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { AudioInputDevice, CalibrationProgress } from '$lib/application/ports';
import { i18n } from '$lib/i18n/index.svelte';
import CalibrationScreen from './CalibrationScreen.svelte';
import type { CalibrationScreenOutcome } from './outcome';

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
		progress: CalibrationProgress | null;
		outcome: CalibrationScreenOutcome | null;
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
		expect(screen.getByText(/porte un casque/i)).toBeTruthy();
		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'usb' } });
		expect(props.onselectdevice).toHaveBeenCalledWith('usb');
	});

	it('starts the level meter on a user gesture', async () => {
		const { props } = renderScreen();
		await fireEvent.click(screen.getByRole('button', { name: /écouter/i }));
		expect(props.onlisten).toHaveBeenCalledTimes(1);
	});

	it('tells the player to stay silent while the clicks play, once the run starts', () => {
		renderScreen();
		expect(screen.queryByText(/ne joue pas/i)).toBeNull();
		cleanup();
		renderScreen({ phase: 'running', progress: { phase: 'listen', done: 3, needed: 8 } });
		expect(
			screen.getByText(
				'Ne joue pas. Si tu joues au casque, pose-le contre le micro de l’ordinateur.'
			)
		).toBeTruthy();
		expect(screen.getByText(/3\s*\/\s*8/)).toBeTruthy();
	});

	it('asks for the headphones back on for the bleed check', () => {
		renderScreen({ phase: 'running', progress: { phase: 'bleed', done: 1, needed: 8 } });
		expect(screen.getByText('Remets ton casque, et ne joue pas.')).toBeTruthy();
		cleanup();
		i18n.locale = 'en';
		renderScreen({ phase: 'running', progress: { phase: 'bleed', done: 1, needed: 8 } });
		expect(screen.getByText('Put your headphones back on, and don’t play.')).toBeTruthy();
	});

	it('asks for notes played freely in the compare phase', () => {
		renderScreen({ phase: 'running', progress: { phase: 'compare', done: 5, needed: 16 } });
		expect(
			screen.getByText('Joue 16 notes, comme tu veux, sans retour par les haut-parleurs.')
		).toBeTruthy();
		expect(screen.getByText(/5\s*\/\s*16/)).toBeTruthy();
	});

	it('shows progress and the muted-string instruction in the fallback', () => {
		renderScreen({ phase: 'running', progress: { phase: 'play', done: 3, needed: 10 } });
		expect(screen.getByText(/corde étouffée/i)).toBeTruthy();
		expect(screen.getByText(/3\s*\/\s*10/)).toBeTruthy();
	});

	it('says in English how to calibrate', () => {
		i18n.locale = 'en';
		renderScreen({ phase: 'running', progress: { phase: 'compare', done: 0, needed: 16 } });
		expect(
			screen.getByText('Play 16 notes, any way you like, with no sound from the speakers.')
		).toBeTruthy();
	});

	it('shows the measured latency, how it was measured, and the bleed', () => {
		renderScreen({
			phase: 'done',
			outcome: {
				ok: true,
				latency: {
					attack: { ms: 15, provenance: 'system' },
					note: { ms: 25, provenance: 'system' }
				},
				clickBleed: true
			}
		});
		expect(screen.getByText('Latence mesurée : 15 ms, sans ton jeu.')).toBeTruthy();
		expect(screen.getByRole('status').textContent).toMatch(/entend le clic/);
		cleanup();
		renderScreen({
			phase: 'done',
			outcome: { ok: true, latency: { note: { ms: 38, provenance: 'player' } }, clickBleed: false }
		});
		expect(screen.getByText('Latence mesurée : 38 ms, sur ton jeu au clic.')).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('says when the input did not open', () => {
		renderScreen({ phase: 'done', outcome: { ok: false, reason: 'error' } });
		expect(screen.getByText(/ne s’est pas ouverte/i)).toBeTruthy();
		expect(screen.getByRole('button', { name: /réessayer/i })).toBeTruthy();
	});

	it('says when the computer mic did not hear the notes', () => {
		renderScreen({ phase: 'done', outcome: { ok: false, reason: 'second-input' } });
		expect(screen.getByText(/n’a pas entendu tes notes/)).toBeTruthy();
	});

	it('offers retry after failure', async () => {
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
