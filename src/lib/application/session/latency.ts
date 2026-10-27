import type { CycleReport } from '$lib/domain/time';
import type { Settings } from '$lib/domain/types';

/**
 * The sensor whose latency a sensor takes while it has none of its own: the attack sensor hears
 * the same input as the note sensor, measured on the player's attacks on the click.
 */
export const LATENCY_FALLBACK: Readonly<Record<string, string>> = { attack: 'note' };

/**
 * The calibrated latency of `sensor`, with its provenance; null when uncalibrated. A sensor
 * without its own takes its fallback's (`LATENCY_FALLBACK`), as provenance `player`: shown, not
 * judged.
 */
export function sensorLatency(
	latencies: Settings['latency'],
	sensor: string
): CycleReport['latency'] {
	const of = (name: string) => (Object.hasOwn(latencies, name) ? latencies[name] : undefined);
	const own = of(sensor);
	if (own) return { ms: own.ms, provenance: own.provenance };
	const fallback = Object.hasOwn(LATENCY_FALLBACK, sensor)
		? of(LATENCY_FALLBACK[sensor])
		: undefined;
	return fallback ? { ms: fallback.ms, provenance: 'player' } : null;
}
