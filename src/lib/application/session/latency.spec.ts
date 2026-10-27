import { describe, expect, it } from 'vitest';
import { sensorLatency } from './latency';

describe('sensorLatency', () => {
	it('is the sensor’s own latency, with its provenance', () => {
		const latencies = {
			attack: { ms: 12, provenance: 'system' as const },
			note: { ms: 30, provenance: 'system' as const }
		};
		expect(sensorLatency(latencies, 'attack')).toEqual({ ms: 12, provenance: 'system' });
		expect(sensorLatency(latencies, 'note')).toEqual({ ms: 30, provenance: 'system' });
	});

	it('takes the note’s for the attack while it has none, as measured on the player', () => {
		const latencies = { note: { ms: 30, provenance: 'system' as const } };
		expect(sensorLatency(latencies, 'attack')).toEqual({ ms: 30, provenance: 'player' });
	});

	it('is null for an uncalibrated sensor without a fallback', () => {
		expect(sensorLatency({ note: { ms: 30, provenance: 'system' } }, 'chord')).toBeNull();
		expect(sensorLatency({}, 'attack')).toBeNull();
		expect(sensorLatency({}, 'toString')).toBeNull();
	});
});
