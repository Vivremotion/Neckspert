import { describe, expect, it } from 'vitest';
import { NullDiagnosticSink } from './NullDiagnosticSink';

describe('NullDiagnosticSink', () => {
	it('is disabled and records nothing, without throwing', async () => {
		const sink = new NullDiagnosticSink();
		expect(sink.enabled).toBe(false);
		const input = { label: '', sampleRate: 48000, channelCount: 1, builtInGain: 1 };
		await expect(
			sink.openTake({ startedAt: 0, startedAudioTime: 0, input })
		).resolves.toBeUndefined();
		expect(() => sink.event('input.opened', 0, input)).not.toThrow();
		expect(() =>
			sink.audio({ audioTime: 0, sampleRate: 16000, samples: new Int16Array(4) })
		).not.toThrow();
		await expect(sink.closeTake(1)).resolves.toBeUndefined();
		expect(sink.enabled).toBe(false);
	});
});
