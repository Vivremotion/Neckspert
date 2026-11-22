import { describe, expect, it } from 'vitest';
import { FakeClock } from '$lib/testing/fakes';
import type { SetPresenter } from '$lib/application/sets/types';
import type { ObservationSource, SensorFactory } from '../sensors';
import { SeriesSensors } from './seriesSensors';

describe('SeriesSensors', () => {
	it('opens each source with its sensor’s latency', () => {
		const opened: [string, number][] = [];
		const factoryOf =
			(kind: string): SensorFactory =>
			({ latencyMs }) => {
				opened.push([kind, latencyMs]);
				return { onObservation: () => () => {} } satisfies ObservationSource;
			};
		const sensors = new SeriesSensors({
			clock: new FakeClock(),
			listening: () => [
				{ sensors: ['note', 'chord'] } as unknown as SetPresenter,
				{ sensors: ['tap'] } as unknown as SetPresenter
			],
			sensors: {
				note: factoryOf('note'),
				chord: factoryOf('chord'),
				tap: factoryOf('tap')
			} as never
		});
		const latencies: Record<string, number> = { note: 40, chord: 55 };
		sensors.open(
			(kind) => latencies[kind] ?? 0,
			() => {}
		);
		expect(opened).toEqual([
			['note', 40],
			['chord', 55],
			['tap', 0]
		]);
	});

	it('names a sensor without a factory', () => {
		const sensors = new SeriesSensors({
			clock: new FakeClock(),
			listening: () => [{ sensors: ['note'] } as unknown as SetPresenter],
			sensors: {}
		});
		expect(() =>
			sensors.open(
				() => 0,
				() => {}
			)
		).toThrow('No factory for sensor: note');
	});
});
