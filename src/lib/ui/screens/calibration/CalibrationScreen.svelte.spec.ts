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
		oncalibrateonclick: () => void;
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
		oncalibrateonclick: vi.fn(),
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
			screen.getByText(
				'Joue 16 notes, comme tu veux, sans clic. Le micro de l’ordinateur doit entendre ta guitare : par tes enceintes ou tes cordes.'
			)
		).toBeTruthy();
		expect(screen.getByText(/5\s*\/\s*16/)).toBeTruthy();
	});

	it('asks for that many muted notes, each on a click, on the click', () => {
		renderScreen({ phase: 'running', progress: { phase: 'play', done: 3, needed: 10 } });
		expect(screen.getByText('Joue 10 notes étouffées, chacune sur un clic.')).toBeTruthy();
		expect(screen.getByText(/3\s*\/\s*10/)).toBeTruthy();
	});

	it('says in English how to calibrate', () => {
		i18n.locale = 'en';
		renderScreen({ phase: 'running', progress: { phase: 'compare', done: 0, needed: 16 } });
		expect(
			screen.getByText(
				'Play 16 notes, any way you like, with no click. The computer’s mic must hear your guitar: through your speakers or from the strings.'
			)
		).toBeTruthy();
	});

	it('shows the measure behind a latency measured without the player, and the bleed', () => {
		renderScreen({
			phase: 'done',
			outcome: {
				ok: true,
				latency: {
					attack: { ms: 15, provenance: 'system' },
					note: { ms: 25, provenance: 'system' }
				},
				clickBleed: true,
				measure: {
					referenceMs: 40.2,
					referenceSpreadMs: 0.4,
					offsetMs: -25.1,
					pairs: 15,
					played: 16,
					spreadMs: 2.3,
					latencyMs: 15
				}
			}
		});
		expect(screen.getByText('Latence mesurée : 15 ms, sans ton jeu.')).toBeTruthy();
		expect(
			screen.getByText('Micro de l’ordinateur sur les clics : 40,2 ms (± 0,4 ms)')
		).toBeTruthy();
		expect(screen.getByText('Interface − micro : −25,1 ms')).toBeTruthy();
		expect(screen.getByText('15 paires sur 16 notes, dispersion 2,3 ms')).toBeTruthy();
		expect(screen.getByRole('status').textContent).toMatch(/entend le clic/);
	});

	it('shows the hits behind a latency measured on the click', () => {
		renderScreen({
			phase: 'done',
			outcome: {
				ok: true,
				latency: { attack: { ms: 38, provenance: 'player' } },
				clickBleed: null,
				measure: {
					referenceMs: null,
					referenceSpreadMs: null,
					offsetMs: null,
					pairs: 10,
					played: 10,
					spreadMs: 6,
					latencyMs: 38
				}
			}
		});
		expect(screen.getByText('Latence mesurée : 38 ms, sur ton jeu au clic.')).toBeTruthy();
		expect(screen.getByText('10 notes sur le clic, dispersion 6 ms')).toBeTruthy();
		expect(screen.queryByText(/interface − micro/i)).toBeNull();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('shows why the comparison was inconsistent', () => {
		renderScreen({
			phase: 'done',
			outcome: {
				ok: false,
				reason: 'inconsistent',
				measure: {
					referenceMs: 40,
					referenceSpreadMs: 0.5,
					offsetMs: -20,
					pairs: 6,
					played: 16,
					spreadMs: 11.5,
					latencyMs: null
				}
			}
		});
		expect(screen.getByText('6 paires sur 16 notes, dispersion 11,5 ms')).toBeTruthy();
	});

	it('says why the reference failed, with its numbers, and offers the click as a second choice', async () => {
		const { props } = renderScreen({
			phase: 'done',
			outcome: {
				ok: false,
				reason: 'reference',
				detail: {
					mic: 'MacBook Pro Microphone',
					opened: true,
					heard: 2,
					clicks: 8,
					delayMs: 61.4,
					spreadMs: 0.8
				}
			}
		});
		expect(
			screen.getByText(
				'Le micro de l’ordinateur (MacBook Pro Microphone) a entendu 2 clics sur 8, à 61,4 ms (± 0,8 ms).'
			)
		).toBeTruthy();
		expect(screen.getByText(/il en faut au moins la moitié/i)).toBeTruthy();
		expect(screen.getByText(/mesure aussi ton jeu/i)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Calibrer sur mon jeu au clic' }));
		expect(props.oncalibrateonclick).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
		expect(props.onretry).toHaveBeenCalledOnce();
	});

	it('says when no computer mic was found, or when it did not open', () => {
		renderScreen({
			phase: 'done',
			outcome: {
				ok: false,
				reason: 'reference',
				detail: { mic: null, opened: false, heard: 0, clicks: 8, delayMs: null, spreadMs: null }
			}
		});
		expect(screen.getByText(/aucun micro d’ordinateur trouvé/i)).toBeTruthy();
		cleanup();
		i18n.locale = 'en';
		renderScreen({
			phase: 'done',
			outcome: {
				ok: false,
				reason: 'reference',
				detail: {
					mic: 'MacBook Pro Microphone',
					opened: false,
					heard: 0,
					clicks: 8,
					delayMs: null,
					spreadMs: null
				}
			}
		});
		expect(
			screen.getByText('The computer’s mic (MacBook Pro Microphone) did not open.')
		).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Calibrate on my playing on the click' })
		).toBeTruthy();
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

describe('CalibrationScreen primary action', () => {
	it('has exactly one primary action when done, even without listening', () => {
		renderScreen({ phase: 'done', listening: false, outcome: { ok: false, reason: 'error' } });
		expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
	});
});
