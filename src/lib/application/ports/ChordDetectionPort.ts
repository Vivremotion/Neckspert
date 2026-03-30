/**
 * Driven port: chord detection from audio (HPCP). Infrastructure implements this.
 */
export interface ChordDetectionPort {
	start(): Promise<void>;
	pause(): void;
	subscribe(callback: (hpcp: number[], audioTimestampMs: number) => void): void;
}
