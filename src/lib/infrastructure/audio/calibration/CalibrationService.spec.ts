import { describe, expect, it, vi } from 'vitest';
import type { AudioInputDevice, CalibrationProgress } from '$lib/application/ports';
import {
	FakeAttackDetector,
	FakeClock,
	FakeNoteDetector,
	FakeSoundScheduler
} from '$lib/testing/fakes';
import { CalibrationService } from './CalibrationService';
import {
	BLEED_CHECK_CLICKS,
	CALIBRATION_ATTACKS,
	COMPARE_SETTLE_S,
	DEFAULT_CALIBRATION_CONFIG,
	LISTEN_WINDOW_S
} from './config';

const INTERFACE: AudioInputDevice = { id: 'fm3', label: 'FM3 Audio' };
const BUILT_IN: AudioInputDevice = { id: 'mac', label: 'MacBook Pro Microphone' };
const DEFAULT_ALIAS: AudioInputDevice = {
	id: 'default',
	label: 'Default - MacBook Pro Microphone'
};

function setup(
	options: {
		devices?: AudioInputDevice[];
		playDevice?: string | null;
		secondInput?: 'opens' | 'fails';
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
	const openSecondInput = vi.fn(async (deviceId: string) => {
		void deviceId;
		if (options.secondInput === 'fails') throw new Error('NotReadableError');
		return { attacks: mic, close };
	});
	const playDevice = options.playDevice === undefined ? INTERFACE.id : options.playDevice;
	const service = new CalibrationService(
		{
			clock,
			sounds,
			detector,
			attacks,
			deviceId: async () => playDevice,
			openSecondInput
		},
		options.config
	);
	const progress: CalibrationProgress[] = [];
	return { clock, sounds, detector, attacks, mic, close, openSecondInput, service, progress };
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

function clickTimes(rig: Rig): number[] {
	return rig.sounds
		.emitted()
		.filter((s) => s.sound === 'click' || s.sound === 'click-accent')
		.map((s) => s.time);
}

function note(time: number) {
	return { time, midi: 52, frequencyHz: 164.8, clarity: 0.95 };
}

/** The listen phase: `heard` gives, per click, what each input hears of it. */
async function listen(
	rig: Rig,
	heard: { play?: number | null; mic?: number | null } = {}
): Promise<number[]> {
	const clicks = clickTimes(rig);
	expect(clicks).toHaveLength(BLEED_CHECK_CLICKS);
	for (const click of clicks) {
		if (heard.mic != null) rig.mic.emit({ time: click + heard.mic, strength: 1 });
		if (heard.play != null) rig.attacks.emit({ time: click + heard.play, strength: 1 });
		await advanceTo(rig, click);
	}
	await advanceTo(rig, clicks[clicks.length - 1] + LISTEN_WINDOW_S + 0.01);
	return clicks;
}

/** The compare phase: the player plays `count` notes, each heard as described. */
async function compare(
	rig: Rig,
	readings: { mic?: number | null; note?: number | null; count?: number } = {}
): Promise<void> {
	const start = rig.clock.now() + 1;
	const count = readings.count ?? CALIBRATION_ATTACKS;
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
		const outcome = rig.service.run((p) => rig.progress.push({ ...p }));
		await settle();
		expect(rig.detector.running).toBe(true);
		expect(rig.detector.deviceId).toBe('fm3');
		// The mic, never an alias of the default device.
		expect(rig.openSecondInput).toHaveBeenCalledWith('mac');

		// R_micro = 40 ms; the interface does not hear the click.
		await listen(rig, { mic: 0.04 });
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
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig, { mic: 0.18 });
		// Breaths and keys between the notes, heard by the mic only.
		const from = rig.clock.now();
		for (let i = 0; i < 40; i++) rig.mic.emit({ time: from + 1.3 + i * 0.23, strength: 0.5 });
		await compare(rig, { mic: -0.121, note: 0 });
		const result = await outcome;
		expect(result).toMatchObject({ ok: true, latency: { attack: { ms: 59 } } });
	});

	it('records the bleed when the interface hears the click', async () => {
		const rig = setup();
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig, { mic: 0.04, play: 0.03 });
		await compare(rig, { mic: -0.02, note: 0 });
		await expect(outcome).resolves.toMatchObject({ ok: true, clickBleed: true });
	});

	it('is inconsistent when too few attacks find their mic reading', async () => {
		const rig = setup();
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig, { mic: 0.04 });
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

	it('says the second input heard nothing when the mic stays silent while the player plays', async () => {
		const rig = setup();
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig, { mic: 0.04 });
		await compare(rig, { mic: null, note: 0 });
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'second-input' });
	});
});

describe('CalibrationService falls back to the player on the click', () => {
	async function playOnClicks(rig: Rig, note: number | null, attack: number | null) {
		const clicks = clickTimes(rig).slice(BLEED_CHECK_CLICKS);
		for (let index = 0; index < clicks.length; index++) {
			await advanceTo(rig, clicks[index]);
			if (index < 4) continue;
			if (note !== null) rig.detector.emitNote(noteAt(clicks[index] + note));
			if (attack !== null) rig.attacks.emit({ time: clicks[index] + attack, strength: 1 });
		}
	}
	const noteAt = note;

	it('when the second input does not open: every latency comes from the player', async () => {
		const rig = setup({ secondInput: 'fails' });
		const outcome = rig.service.run((p) => rig.progress.push({ ...p }));
		await settle();
		await listen(rig);
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
		const outcome = rig.service.run(() => {});
		await settle();
		expect(rig.openSecondInput).not.toHaveBeenCalled();
		await listen(rig);
		await playOnClicks(rig, 0.038, 0.03);
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { provenance: 'player' } }
		});
	});

	it('when the mic does not hear the clicks', async () => {
		const rig = setup();
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig, { mic: null });
		await playOnClicks(rig, 0.038, 0.03);
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { ms: 30, provenance: 'player' } }
		});
		expect(rig.close).toHaveBeenCalledOnce();
	});

	it('gives no-sound when nothing is played on the click', async () => {
		const rig = setup({ secondInput: 'fails' });
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig);
		await playOnClicks(rig, null, null);
		await advanceTo(rig, rig.clock.now() + 1);
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'no-sound' });
		expect(rig.detector.running).toBe(false);
	});

	it('is inconsistent when the hits are scattered', async () => {
		const rig = setup({ secondInput: 'fails', config: { hitsNeeded: 5, maxSpreadMs: 5 } });
		const outcome = rig.service.run(() => {});
		await settle();
		await listen(rig);
		const clicks = clickTimes(rig).slice(BLEED_CHECK_CLICKS);
		const offsets = [0, 0.05, 0.1, 0, 0.08];
		for (let index = 0; index < 4 + offsets.length; index++) {
			await advanceTo(rig, clicks[index]);
			if (index >= 4) rig.detector.emitNote(note(clicks[index] + offsets[index - 4]));
		}
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'inconsistent' });
	});
});

describe('CalibrationService with the computer mic as the playing input', () => {
	it('takes the loop latency of the clicks as the attack latency, and the bleed', async () => {
		const rig = setup({ devices: [BUILT_IN], playDevice: 'mac' });
		const outcome = rig.service.run(() => {});
		await settle();
		expect(rig.openSecondInput).not.toHaveBeenCalled();
		await listen(rig, { play: 0.06 });
		// The note detector's own delay, measured on notes played freely.
		await compare(rig, { note: 0.012 });
		await expect(outcome).resolves.toEqual({
			ok: true,
			latency: {
				attack: { ms: 60, provenance: 'system' },
				note: { ms: 72, provenance: 'system' },
				chord: { ms: 72, provenance: 'system' }
			},
			clickBleed: true
		});
	});

	it('takes the default device for the mic when its label says so', async () => {
		const rig = setup({ devices: [DEFAULT_ALIAS], playDevice: null });
		const outcome = rig.service.run(() => {});
		await settle();
		expect(rig.openSecondInput).not.toHaveBeenCalled();
		await listen(rig, { play: 0.05 });
		await compare(rig, { note: 0 });
		await expect(outcome).resolves.toMatchObject({
			ok: true,
			latency: { attack: { ms: 50, provenance: 'system' } }
		});
	});
});

describe('CalibrationService.cancel', () => {
	it('stops a run in progress and closes both inputs', async () => {
		const rig = setup();
		const outcome = rig.service.run(() => {});
		await settle();
		rig.service.cancel();
		await expect(outcome).resolves.toEqual({ ok: false, reason: 'cancelled' });
		expect(rig.sounds.emitted()).toEqual([]);
		expect(rig.close).toHaveBeenCalledOnce();
		expect(rig.detector.running).toBe(false);
	});

	it('is a no-op when idle, and a second run throws while busy', async () => {
		const rig = setup();
		rig.service.cancel();
		const first = rig.service.run(() => {});
		await expect(rig.service.run(() => {})).rejects.toThrow('Calibration already running');
		rig.service.cancel();
		await expect(first).resolves.toEqual({ ok: false, reason: 'cancelled' });
	});
});
