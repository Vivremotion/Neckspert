import { describe, expect, it } from 'vitest';
import type { AppServices } from '$lib/application/app';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress
} from '$lib/application/ports';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import type { BackupFile } from '$lib/domain/types';
import { placementTargets, acceptableMidis } from '$lib/domain/music';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { createAppServices } from './createAppServices';

class FakeBackup implements BackupPort {
	async exportAll(): Promise<BackupFile> {
		throw new Error('not used');
	}
	async importAll(): Promise<void> {}
}

class FakeCalibration implements CalibrationPort {
	async run(_onProgress: (p: CalibrationProgress) => void): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	cancel(): void {}
}

function harness(): {
	services: AppServices;
	deps: SessionDeps & {
		clock: FakeClock;
		metronome: FakeMetronome;
		detector: FakeNoteDetector;
	};
} {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const deps: SessionDeps & {
		clock: FakeClock;
		metronome: FakeMetronome;
		detector: FakeNoteDetector;
	} = {
		clock,
		metronome,
		detector,
		cues: new FakeSoundCues(),
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => `id-${Math.random().toString(16).slice(2)}`
	};
	const services = createAppServices({
		...deps,
		backup: new FakeBackup(),
		calibration: new FakeCalibration()
	});
	return { services, deps };
}

function tick(deps: { clock: FakeClock; metronome: FakeMetronome }, seconds: number) {
	deps.clock.advance(seconds);
	deps.metronome.flush();
}

const FR_STRING: Record<string, StringNumber> = {
	'corde de E aiguë': 1,
	'corde de B': 2,
	'corde de G': 3,
	'corde de D': 4,
	'corde de A': 5,
	'corde de E grave': 6
};

const FLAT_TO_SHARP: Record<string, PitchName> = {
	Db: 'C#',
	Eb: 'D#',
	Gb: 'F#',
	Ab: 'G#',
	Bb: 'A#'
};

function locateMidiFromPrompt(primary: string, secondary: string): number {
	const string = FR_STRING[secondary] ?? 6;
	const pitch = (FLAT_TO_SHARP[primary] ?? primary) as PitchName;
	return acceptableMidis({ direction: 'locate', string, pitch })[0];
}

describe('createAppServices', () => {
	it('wires homeStats, neckMap and sessionSummary through C and A', async () => {
		const { services } = harness();
		const stats = await services.homeStats();
		expect(stats.nextAction).toBe('placement');
		const map = await services.neckMap();
		expect(map).toHaveLength(66);
		expect(map[0]).toHaveProperty('pitch');
	});

	it('startSession(placement) drives every placement target', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('placement');
		expect(controller.view.status).toBe('idle');
		await controller.start();

		const expected = placementTargets().length;
		let guard = 0;
		while (controller.view.status !== 'finished' && guard++ < expected * 20) {
			if (controller.view.status === 'awaiting' && controller.view.targetBeatIndex !== null) {
				const due = deps.metronome.beatTime(controller.view.targetBeatIndex);
				// MIDI 40 always records an attempt (correct or wrong); order may be shuffled.
				deps.detector.emitNote({
					time: due,
					midi: 40,
					frequencyHz: 82.41,
					clarity: 0.9
				});
				await Promise.resolve();
			}
			tick(deps, deps.metronome.secondsPerBeat());
		}
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(controller.view.status).toBe('finished');
		expect(await deps.attempts.all()).toHaveLength(expected);
		expect((await deps.settings.get()).placementDoneAt).not.toBeNull();
	});

	it('startSession(learn) probes the first note of the queue without aid', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('learn');
		await controller.start();
		while (controller.view.status !== 'awaiting') tick(deps, deps.metronome.secondsPerBeat());
		expect(controller.view.prompt).toMatchObject({
			primary: 'G',
			secondary: 'corde de E grave',
			aid: null
		});
		expect(controller.view.leadBeats).toBe(2);
	});

	it('startSession(free) never prompts an open string', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('free');
		await controller.start();
		const prompts: string[] = [];
		let guard = 0;
		while (controller.view.status !== 'finished' && guard++ < 2000) {
			if (controller.view.status === 'awaiting' && controller.view.prompt) {
				const prompt = controller.view.prompt;
				const key = `${prompt.primary}|${prompt.secondary}`;
				if (prompts.at(-1) !== key) prompts.push(key);
				if (prompt.direction === 'identify') controller.answer('C');
			}
			tick(deps, deps.metronome.secondsPerBeat());
			await Promise.resolve();
		}
		expect(prompts.length).toBeGreaterThan(0);
		expect(prompts.some((key) => key.startsWith('case 0|'))).toBe(false);
		expect(prompts).not.toContain('E|corde de E grave');
		expect(prompts).not.toContain('A|corde de A');
	});

	it('startSession(learn) runs the plan from C and exposes a summary', async () => {
		const { services, deps } = harness();
		await deps.settings.update({ placementDoneAt: deps.now() });
		const controller = await services.startSession('learn');
		await controller.start();

		let guard = 0;
		while (controller.view.status !== 'finished' && guard++ < 1000) {
			if (controller.view.status === 'awaiting') {
				if (
					controller.view.prompt?.direction === 'locate' &&
					controller.view.targetBeatIndex !== null
				) {
					const due = deps.metronome.beatTime(controller.view.targetBeatIndex);
					const midi = locateMidiFromPrompt(
						controller.view.prompt.primary,
						controller.view.prompt.secondary
					);
					deps.detector.emitNote({
						time: due,
						midi,
						frequencyHz: 82.41,
						clarity: 0.9
					});
					await Promise.resolve();
				} else if (controller.view.prompt?.direction === 'identify') {
					controller.answer('C');
					await Promise.resolve();
				}
			}
			tick(deps, deps.metronome.secondsPerBeat());
		}
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(controller.view.status).toBe('finished');
		expect(await deps.sessions.get(controller.sessionId)).toMatchObject({
			id: controller.sessionId,
			endedAt: expect.any(Number)
		});
		const summary = await services.sessionSummary(controller.sessionId);
		expect(summary.sessionId).toBe(controller.sessionId);
	});
});
