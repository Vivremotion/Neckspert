import { describe, expect, it } from 'vitest';
import { FakeClock } from '$lib/testing/fakes';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
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
			mechanics: {
				a: { sensors: ['note', 'chord'] } as unknown as MechanicPresenter,
				b: { sensors: ['tap'] } as unknown as MechanicPresenter
			},
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
});
