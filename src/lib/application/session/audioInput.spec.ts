import { describe, expect, it } from 'vitest';
import { FakeNoteDetector, InMemorySettingsRepository } from '$lib/testing/fakes';
import { isMissingInput, openAudioInput } from './audioInput';

function named(name: string): Error {
	const error = new Error('Constraints could not be satisfied.');
	error.name = name;
	return error;
}

/** Detector that rejects any device but the default one with `error`. */
function detectorRejecting(error: Error) {
	const detector = new FakeNoteDetector();
	const opened: (string | null)[] = [];
	const start = detector.start.bind(detector);
	detector.start = async (deviceId) => {
		opened.push(deviceId);
		if (deviceId !== null) throw error;
		await start(deviceId);
	};
	return { detector, opened };
}

describe('isMissingInput', () => {
	it('recognizes a device that no longer exists', () => {
		expect(isMissingInput(named('OverconstrainedError'))).toBe(true);
		expect(isMissingInput(named('NotFoundError'))).toBe(true);
		expect(isMissingInput(named('NotAllowedError'))).toBe(false);
		expect(isMissingInput(null)).toBe(false);
	});
});

describe('openAudioInput', () => {
	it('falls back to the default input and forgets a stale device id', async () => {
		const settings = new InMemorySettingsRepository();
		await settings.update({ inputDeviceId: 'from-another-origin' });
		const { detector, opened } = detectorRejecting(named('OverconstrainedError'));
		await openAudioInput(detector, settings, 'from-another-origin');
		expect(opened).toEqual(['from-another-origin', null]);
		expect(detector.running).toBe(true);
		expect((await settings.get()).inputDeviceId).toBeNull();
	});

	it('rethrows any other failure and keeps the setting', async () => {
		const settings = new InMemorySettingsRepository();
		await settings.update({ inputDeviceId: 'usb' });
		const { detector } = detectorRejecting(named('NotAllowedError'));
		await expect(openAudioInput(detector, settings, 'usb')).rejects.toThrow();
		expect((await settings.get()).inputDeviceId).toBe('usb');
	});
});
