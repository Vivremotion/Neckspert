import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioInputDevice, CalibrationProgress } from '$lib/application/ports';
import {
	FakeAttackDetector,
	FakeClock,
	FakeNoteDetector,
	FakeSoundScheduler
} from '$lib/testing/fakes';
import { CalibrationService, type SecondInput } from './CalibrationService';
import {
	BLEED_CHECK_CLICKS,
	CALIBRATION_ATTACKS,
	COMPARE_SETTLE_S,
	COMPARE_TIMEOUT_S,
	DEFAULT_CALIBRATION_CONFIG,
	LISTEN_WINDOW_S
} from './config';

const INTERFACE: AudioInputDevice = { id: 'fm3', label: 'FM3 Audio' };
const BUILT_IN: AudioInputDevice = { id: 'mac', label: 'MacBook Pro Microphone' };
const DEFAULT_ALIAS: AudioInputDevice = {
	id: 'default',
	label: 'Default - MacBook Pro Microphone'
};

afterEach(() => {
	vi.restoreAllMocks();
});

function setup(
	options: {
		devices?: AudioInputDevice[];
		playDevice?: string | null;
		secondInput?: 'opens' | 'fails' | 'held';
		config?: Partial<typeof DEFAULT_CALIBRATION_CONFIG>;
	} = {}
) {
	const clock = new FakeClock();
	const sounds = new FakeSoundScheduler(clock);
	const detector = new FakeNoteDetector();
	const devices = options.devices ?? [DEFAULT_ALIAS, INTERFACE, BUILT_IN];
	detector.listInputs = async () => devices;
	const attacks = new FakeAttackDetector();
	const mic = new FakeAttackDetector();
	const close = vi.fn();
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	/** Openings held by `secondInput: 'held'`, released by the test. */
	const held: Array<() => void> = [];
	const openSecondInput = vi.fn(async (deviceId: string): Promise<SecondInput> => {
		void deviceId;
		if (options.secondInput === 'fails') throw new Error('NotReadableError');
		if (options.secondInput === 'held') await new Promise<void>((resolve) => held.push(resolve));
		return { attacks: mic, close };
	});
	const playDevice = options.playDevice === undefined ? INTERFACE.id : options.playDevice;
	const service = new CalibrationService(
		{ clock, sounds, detector, attacks, openSecondInput },
		options.config
	);
	const progress: CalibrationProgress[] = [];
	const rig = {
		clock,
		sounds,
		detector,
		attacks,
		mic,
		close,
		warn,
		held,
		openSecondInput,
		service,
		progress,
		/** Clicks already played by the test. */
		consumed: 0,
		run: () => service.run(playDevice, (p) => progress.push({ ...p }))
	};
	return rig;
}

type Rig = ReturnType<typeof setup>;

/** Lets the service's awaits (resume, inputs, settle) run. */
async function settle(): Promise<void> {
	for (let i = 0; i < 50; i++) await Promise.resolve();
}

/** Moves the audio clock to `time` and runs the wake-ups due. */
async function advanceTo(rig: Rig, time: number): Promise<void> {
	if (rig.clock.now() < time) rig.clock.time = time;
	rig.sounds.flush();
	await settle();
}

/** The clicks scheduled since the test last took some. */
function newClicks(rig: Rig): number[] {
	const all = rig.sounds
		.emitted()
		.filter((s) => s.sound === 'click' || s.sound === 'click-accent')
		.map((s) => s.time);
	const fresh = all.slice(rig.consumed);
	rig.consumed = all.length;
	return fresh;
}

function note(time: number) {
	return { time, midi: 52, frequencyHz: 164.8, clarity: 0.95 };
}

/** A deterministic ±1 noise, in the unit asked. */
function jitter(i: number, amplitude: number): number {
	return (((i * 7919) % 21) / 10 - 1) * amplitude;
}

/**
 * A phase of clicks, the player silent: `heard` gives the delay at which each input hears each
 * click (null: not heard), `noise` sounds of the room per input, at given delays after clicks.
 */
async function clicksPhase(
	rig: Rig,
	heard: { play?: number | null; mic?: number | null } = {},
	noise: { play?: Array<[click: number, delay: number]>; mic?: Array<[number, number]> } = {}
): Promise<number[]> {
	const clicks = newClicks(rig);
	expect(clicks).toHaveLength(BLEED_CHECK_CLICKS);
	for (const [k, delay] of noise.play ?? [])
		rig.attacks.emit({ time: clicks[k] + delay, strength: 1 });
	for (const [k, delay] of noise.mic ?? []) rig.mic.emit({ time: clicks[k] + delay, strength: 1 });
	for (const [i, click] of clicks.entries()) {
		if (heard.mic != null)
			rig.mic.emit({ time: click + heard.mic + jitter(i, 0.001), strength: 1 });
		if (heard.play != null)
			rig.attacks.emit({ time: click + heard.play + jitter(i, 0.001), strength: 1 });
		await advanceTo(rig, click);
	}
	await advanceTo(rig, clicks[clicks.length - 1] + LISTEN_WINDOW_S + 0.01);
	return clicks;
}

/**
 * The compare phase: the player plays `count` notes, each heard as described; `breaths`
 * attacks of the playing input with no note between them.
 */
async function compare(
	rig: Rig,
	readings: { mic?: number | null; note?: number | null; count?: number; breaths?: number } = {}
): Promise<void> {
	const start = rig.clock.now() + 1;
	const count = readings.count ?? CALIBRATION_ATTACKS;
	for (let i = 0; i < (readings.breaths ?? 0); i++) {
		rig.attacks.emit({ time: start + 0.3 + i * 0.6, strength: 0.3 });
	}
	for (let i = 0; i < count; i++) {
		const t = start + i * 0.6 + (i % 3) * 0.05;
		rig.attacks.emit({ time: t, strength: 1 });
		if (readings.mic != null) rig.mic.emit({ time: t - readings.mic, strength: 1 });
		if (readings.note != null) rig.detector.emitNote(note(t + readings.note));
	}
	await advanceTo(rig, start + count * 0.6 + COMPARE_SETTLE_S + 0.01);
}

describe('CalibrationService with an interface and the computer mic', () => {
	it('calibrates the mic on the clicks, then the interface against it, without the player', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		expect(rig.detector.running).toBe(true);
		expect(rig.detector.deviceId).toBe('fm3');
		// The mic, never an alias of the default device.
		expect(rig.openSecondInput).toHaveBeenCalledWith('mac');

		// R_micro = 40 ms; the interface does not hear the click.
		await clicksPhase(rig, { mic: 0.04 });
		// t_interface − t_micro = −25 ms; the note detector reads 10 ms after the attack.
		await compare(rig, { mic: -0.025, note: 0.01 });

		await expect(outcome).resolves.toEqual({
			ok: true,
			latency: {
				attack: { ms: 15, provenance: 'system' },
				note: { ms: 25, provenance: 'system' },
				chord: { ms: 25, provenance: 'system' }
			},
			clickBleed: false
		});
		expect(rig.progress[0]).toEqual({ phase: 'listen', done: 0, needed: BLEED_CHECK_CLICKS });
		expect(rig.progress).toContainEqual({
			phase: 'listen',
			done: BLEED_CHECK_CLICKS,
			needed: BLEED_CHECK_CLICKS
		});
		expect(rig.progress.some((p) => p.phase === 'bleed')).toBe(false);
		expect(rig.progress.at(-1)).toEqual({
			phase: 'compare',
			done: CALIBRATION_ATTACKS,
			needed: CALIBRATION_ATTACKS
		});
		expect(rig.close).toHaveBeenCalledOnce();
		expect(rig.detector.running).toBe(false);
		expect(rig.attacks.listeners).toBe(0);
		expect(rig.mic.listeners).toBe(0);
	});

	it('finds the large offset of Firefox, and ignores what the mic hears of the room', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.18 });
		// Breaths and keys between the notes, heard by the mic only.
		const from = rig.clock.now();
		for (let i = 0; i < 40; i++) rig.mic.emit({ time: from + 1.3 + i * 0.23, strength: 0.5 });
		await compare(rig, { mic: -0.121, note: 0 });
		const result = await outcome;
		expect(result).toMatchObject({ ok: true, latency: { attack: { ms: 59 } } });
	});

	it('keeps the loop latency of the clicks the mic heard, not the noises in their windows', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		// The mic misses two clicks; a breath and a key fall in their windows, another before a click's sound.
		const clicks = newClicks(rig);
		rig.consumed -= clicks.length;
		rig.mic.emit({ time: clicks[3] + 0.21, strength: 0.4 });
		rig.mic.emit({ time: clicks[6] + 0.4, strength: 0.4 });
		rig.mic.emit({ time: clicks[1] + 0.005, strength: 0.4 });
		for (const [i, click] of clicks.entries()) {
			if (i !== 3 && i !== 6) rig.mic.emit({ time: click + 0.04, strength: 1 });
		}
		await clicksPhase(rig, {});
		await compare(rig, { mic: -0.025, note: 0 });
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { ms: 15, provenance: 'system' } }
		});
	});

	it('falls back when the mic hears the clicks at scattered delays', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		const clicks = newClicks(rig);
		rig.consumed -= clicks.length;
		clicks.forEach((click, i) =>
			rig.mic.emit({ time: click + 0.04 + (i % 4) * 0.009, strength: 1 })
		);
		await clicksPhase(rig, {});
		expect(rig.progress.at(-1)).toMatchObject({ phase: 'play' });
		rig.service.cancel();
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'cancelled' });
	});

	it('records the bleed when the interface hears the click', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04, play: 0.03 });
		await compare(rig, { mic: -0.02, note: 0 });
		await expect(outcome).resolves.toMatchObject({ ok: true, clickBleed: true });
	});

	it('takes no handling noise of the interface for the click heard', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(
			rig,
			{ mic: 0.04 },
			{
				play: [
					[1, 0.12],
					[5, 0.31]
				]
			}
		);
		await compare(rig, { mic: -0.02, note: 0 });
		await expect(outcome).resolves.toMatchObject({ ok: true, clickBleed: false });
	});

	it('anchors the note delay on the notes: pitchless attacks of the interface do not count', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04 });
		await compare(rig, { mic: -0.025, note: 0.01, breaths: 10 });
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { note: { ms: 25, provenance: 'system' } }
		});
	});

	it('is inconsistent when too few attacks find their mic reading', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04 });
		const start = rig.clock.now() + 1;
		for (let i = 0; i < CALIBRATION_ATTACKS; i++) {
			const t = start + i * 0.6;
			rig.attacks.emit({ time: t, strength: 1 });
			rig.detector.emitNote(note(t));
			// The mic hears only a third of the notes.
			if (i % 3 === 0) rig.mic.emit({ time: t + 0.02, strength: 1 });
		}
		await advanceTo(rig, start + CALIBRATION_ATTACKS * 0.6 + COMPARE_SETTLE_S + 0.01);
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'inconsistent' });
		expect(rig.close).toHaveBeenCalledOnce();
	});

	it('is inconsistent when the note detector reads too few of the notes', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04 });
		await compare(rig, { mic: -0.025, note: null });
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'inconsistent' });
	});

	it('says the second input heard nothing when the mic stays silent while the player plays', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04 });
		await compare(rig, { mic: null, note: 0 });
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'second-input' });
	});

	it('gives no-sound when nothing is played before the compare phase times out', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04 });
		await advanceTo(rig, rig.clock.now() + COMPARE_TIMEOUT_S + 1);
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'no-sound' });
		expect(rig.detector.running).toBe(false);
	});
});

describe('CalibrationService falls back to the player on the click', () => {
	async function playOnClicks(rig: Rig, noteDelay: number | null, attack: number | null) {
		const clicks = newClicks(rig);
		for (let index = 0; index < clicks.length; index++) {
			await advanceTo(rig, clicks[index]);
			if (index < 4) continue;
			if (noteDelay !== null) rig.detector.emitNote(note(clicks[index] + noteDelay));
			if (attack !== null) rig.attacks.emit({ time: clicks[index] + attack, strength: 1 });
		}
	}

	it('when the second input does not open: every latency comes from the player', async () => {
		const rig = setup({ secondInput: 'fails' });
		const outcome = rig.run();
		await settle();
		expect(rig.warn).toHaveBeenCalledOnce();
		await clicksPhase(rig);
		expect(rig.progress.at(-1)).toMatchObject({ phase: 'play', done: 0 });
		await playOnClicks(rig, 0.038, 0.03);
		await expect(outcome).resolves.toEqual({
			ok: true,
			latency: {
				attack: { ms: 30, provenance: 'player' },
				note: { ms: 38, provenance: 'player' },
				chord: { ms: 38, provenance: 'player' }
			},
			clickBleed: false
		});
		expect(rig.progress.at(-1)).toEqual({
			phase: 'play',
			done: DEFAULT_CALIBRATION_CONFIG.hitsNeeded,
			needed: DEFAULT_CALIBRATION_CONFIG.hitsNeeded
		});
	});

	it('when there is no computer mic to compare with', async () => {
		const rig = setup({ devices: [INTERFACE] });
		const outcome = rig.run();
		await settle();
		expect(rig.openSecondInput).not.toHaveBeenCalled();
		await clicksPhase(rig);
		await playOnClicks(rig, 0.038, 0.03);
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { provenance: 'player' } }
		});
	});

	it('when the mic does not hear the clicks', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: null });
		await playOnClicks(rig, 0.038, 0.03);
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { ms: 30, provenance: 'player' } }
		});
		expect(rig.close).toHaveBeenCalledOnce();
	});

	it('gives no-sound when nothing is played on the click', async () => {
		const rig = setup({ secondInput: 'fails' });
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig);
		await playOnClicks(rig, null, null);
		await advanceTo(rig, rig.clock.now() + 1);
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'no-sound' });
		expect(rig.detector.running).toBe(false);
	});

	it('is inconsistent when the clicks run out before enough hits', async () => {
		const rig = setup({ secondInput: 'fails' });
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig);
		const clicks = newClicks(rig);
		for (let index = 0; index < clicks.length; index++) {
			await advanceTo(rig, clicks[index]);
			if (index === 5 || index === 9) rig.detector.emitNote(note(clicks[index] + 0.03));
		}
		await advanceTo(rig, rig.clock.now() + 1);
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'inconsistent' });
	});

	it('is inconsistent when the hits are scattered', async () => {
		const rig = setup({ secondInput: 'fails', config: { hitsNeeded: 5, maxSpreadMs: 5 } });
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig);
		const clicks = newClicks(rig);
		const offsets = [0, 0.05, 0.1, 0, 0.08];
		for (let index = 0; index < 4 + offsets.length; index++) {
			await advanceTo(rig, clicks[index]);
			if (index >= 4) rig.detector.emitNote(note(clicks[index] + offsets[index - 4]));
		}
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'inconsistent' });
	});
});

describe('CalibrationService with the computer mic as the playing input', () => {
	it('takes the loop latency of the clicks, then checks the bleed headphones on', async () => {
		const rig = setup({ devices: [BUILT_IN], playDevice: 'mac' });
		const outcome = rig.run();
		await settle();
		expect(rig.openSecondInput).not.toHaveBeenCalled();
		// Headphones against the mic: it hears every click. That is no bleed.
		await clicksPhase(rig, { play: 0.06 });
		expect(rig.progress.at(-1)).toEqual({
			phase: 'bleed',
			done: 0,
			needed: BLEED_CHECK_CLICKS
		});
		// Headphones back on: the mic hears none.
		await clicksPhase(rig, {});
		expect(rig.progress.at(-1)).toMatchObject({ phase: 'compare', done: 0 });
		// The note detector's own delay, on notes played freely; breaths are no notes.
		await compare(rig, { note: 0.012, breaths: 12 });
		await expect(outcome).resolves.toEqual({
			ok: true,
			latency: {
				attack: { ms: 60, provenance: 'system' },
				note: { ms: 72, provenance: 'system' },
				chord: { ms: 72, provenance: 'system' }
			},
			clickBleed: false
		});
		// Counted on the notes, not on the breaths.
		const counted = rig.progress.filter((p) => p.phase === 'compare').map((p) => p.done);
		expect(Math.max(...counted)).toBe(CALIBRATION_ATTACKS);
		expect(counted).toEqual([...counted].sort((a, b) => a - b));
	});

	it('records the bleed when the mic still hears the click', async () => {
		const rig = setup({ devices: [BUILT_IN], playDevice: 'mac' });
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { play: 0.06 });
		await clicksPhase(rig, { play: 0.061 });
		await compare(rig, { note: 0 });
		await expect(outcome).resolves.toMatchObject({ ok: true, clickBleed: true });
	});

	it('takes the default device for the mic when its label says so', async () => {
		const rig = setup({ devices: [DEFAULT_ALIAS], playDevice: null });
		const outcome = rig.run();
		await settle();
		expect(rig.openSecondInput).not.toHaveBeenCalled();
		await clicksPhase(rig, { play: 0.05 });
		await clicksPhase(rig, {});
		await compare(rig, { note: 0 });
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { ms: 50, provenance: 'system' } }
		});
	});
});

describe('CalibrationService.cancel', () => {
	it('stops a run just started and closes both inputs', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		rig.service.cancel();
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'cancelled' });
		expect(rig.sounds.emitted()).toEqual([]);
		expect(rig.close).toHaveBeenCalledOnce();
		expect(rig.detector.running).toBe(false);
	});

	it('stops a run during the listen phase', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		const clicks = newClicks(rig);
		await advanceTo(rig, clicks[2]);
		rig.service.cancel();
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'cancelled' });
		expect(rig.sounds.emitted()).toEqual([]);
		expect(rig.attacks.listeners).toBe(0);
		expect(rig.mic.listeners).toBe(0);
	});

	it('stops a run during the compare phase', async () => {
		const rig = setup();
		const outcome = rig.run();
		await settle();
		await clicksPhase(rig, { mic: 0.04 });
		rig.attacks.emit({ time: rig.clock.now() + 0.5, strength: 1 });
		rig.service.cancel();
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'cancelled' });
		expect(rig.close).toHaveBeenCalledOnce();
		expect(rig.detector.running).toBe(false);
	});

	it('closes a mic that opens after the cancel, and lets the next run start clean', async () => {
		const rig = setup({ secondInput: 'held' });
		const first = rig.run();
		await settle();
		expect(rig.held).toHaveLength(1);
		rig.service.cancel();
		await expect(first).resolves.toEqual({ ok: false, reason: 'cancelled' });

		const second = rig.run();
		await settle();
		// The next run waits for the cancelled one to let go of the shared input.
		expect(rig.openSecondInput).toHaveBeenCalledOnce();
		rig.held[0]();
		await settle();
		expect(rig.close).toHaveBeenCalledOnce();
		expect(rig.openSecondInput).toHaveBeenCalledTimes(2);
		expect(rig.detector.running).toBe(true);
		rig.service.cancel();
		await expect(second).resolves.toEqual({ ok: false, reason: 'cancelled' });
	});

	it('is a no-op when idle, and a second run throws while busy', async () => {
		const rig = setup();
		rig.service.cancel();
		const first = rig.run();
		await expect(rig.run()).rejects.toThrow('Calibration already running');
		rig.service.cancel();
		await expect(first).resolves.toEqual({ ok: false, reason: 'cancelled' });
	});
});
