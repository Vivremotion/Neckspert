import { describe, expect, it, vi } from 'vitest';
import type { CalibrationProgress } from '$lib/application/ports';
import { FakeClock, FakeMetronome, FakeNoteDetector } from '$lib/testing/fakes';
import { CalibrationService } from './CalibrationService';
import { CALIBRATION_START_DELAY_S, DEFAULT_CALIBRATION_CONFIG } from './config';

function setup(config?: Partial<typeof DEFAULT_CALIBRATION_CONFIG>) {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const deviceId = vi.fn(async () => 'input-1');
	const service = new CalibrationService(
		{ clock, metronome, detector, deviceId },
		config
	);
	return { clock, metronome, detector, deviceId, service };
}

/** Let `CalibrationService.run` finish its awaits (resume, deviceId, detector.start). */
async function settleRun(metronome: FakeMetronome): Promise<void> {
	for (let i = 0; i < 20 && !metronome.isRunning(); i++) {
		await Promise.resolve();
	}
}

/** Advance the clock and flush until beat `index` has been announced (lookahead 0.1 s). */
function announceThrough(
	clock: FakeClock,
	metronome: FakeMetronome,
	index: number
): void {
	const need = metronome.beatTime(index) - 0.1;
	if (clock.now() < need) clock.advance(need - clock.now());
	metronome.flush();
}

describe('CalibrationService.run', () => {
	it('resumes, starts the detector with deviceId, sets tempo, and starts later than now', async () => {
		const { clock, metronome, detector, deviceId, service } = setup({
			hitsNeeded: 1,
			noSoundBeats: 64
		});
		const resume = vi.spyOn(clock, 'resume');
		const progress: { hits: number; needed: number; lastOffsetMs: number | null }[] = [];

		const runPromise = service.run((p) => progress.push({ ...p }));
		await settleRun(metronome);

		// Beat 0 announced ~0.1 s before 0.5 → clock at 0.4
		announceThrough(clock, metronome, 0);
		expect(resume).toHaveBeenCalledOnce();
		expect(deviceId).toHaveBeenCalledOnce();
		expect(detector.running).toBe(true);
		expect(detector.deviceId).toBe('input-1');
		expect(metronome.getTempo()).toBe(80);
		expect(metronome.isRunning()).toBe(true);
		expect(metronome.beatTime(0)).toBeCloseTo(CALIBRATION_START_DELAY_S);

		// Skip first bar (beats 0..3); accept on beat 4
		announceThrough(clock, metronome, 4);
		detector.emitNote({
			time: metronome.beatTime(4) + 0.038,
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});

		await expect(runPromise).resolves.toEqual({
			ok: true,
			offsetMs: 38,
			spreadMs: 0
		});
		expect(progress).toEqual([{ hits: 1, needed: 1, lastOffsetMs: 38 }]);
		expect(metronome.isRunning()).toBe(false);
		expect(detector.running).toBe(false);
	});

	it('collects ten ~38 ms hits after the first bar and reports offsetMs near 38', async () => {
		const { clock, metronome, detector, service } = setup();
		const progress: number[] = [];

		const runPromise = service.run((p) => {
			if (p.lastOffsetMs !== null) progress.push(p.lastOffsetMs);
		});
		await settleRun(metronome);

		for (let index = 0; index < 4 + 10; index++) {
			announceThrough(clock, metronome, index);
			if (index < 4) continue;
			detector.emitNote({
				time: metronome.beatTime(index) + 0.038,
				midi: 40,
				frequencyHz: 82.4,
				clarity: 0.95
			});
		}

		const outcome = await runPromise;
		expect(outcome).toEqual({ ok: true, offsetMs: 38, spreadMs: 0 });
		expect(progress).toHaveLength(10);
		expect(progress.every((ms) => ms === 38)).toBe(true);
	});
});
