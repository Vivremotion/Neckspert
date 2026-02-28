import type { BeatSourcePort } from '$lib/application/ports/BeatSourcePort';
import { Metronome } from '$lib/services/Metronome';

/**
 * Adapts the Metronome service to the BeatSourcePort interface.
 */
export function createMetronomeAdapter(metronome: Metronome): BeatSourcePort {
	return {
		setTempo(tempo) {
			metronome.setTempo(tempo);
		},
		getSecondsPerBeat() {
			return metronome.getSecondsPerBeat();
		},
		async start() {
			await metronome.start();
		},
		stop() {
			metronome.stop();
		},
		onBeat(callback) {
			metronome.onBeat(callback);
		}
	};
}
