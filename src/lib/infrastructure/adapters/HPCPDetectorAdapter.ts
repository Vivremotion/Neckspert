import type { ChordDetectionPort } from '$lib/application/ports/ChordDetectionPort';

/**
 * Adapts the HPCPDetector service to the ChordDetectionPort interface.
 */
export function createChordDetectionAdapter(detector: {
	start(): Promise<void>;
	pause(): void;
	subscribe(cb: (hpcp: number[]) => void): void;
}): ChordDetectionPort {
	return {
		async start() {
			await detector.start();
		},
		pause() {
			detector.pause();
		},
		subscribe(callback) {
			detector.subscribe(callback);
		}
	};
}
