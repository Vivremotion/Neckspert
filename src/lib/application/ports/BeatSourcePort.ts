/**
 * Driven port: provides beat timing (e.g. metronome). Infrastructure implements this.
 */
export interface BeatSourcePort {
	setTempo(tempo: number): void;
	getSecondsPerBeat(): number;
	start(): Promise<void>;
	stop(): void;
	onBeat(callback: (absoluteBeat: number) => void): void;
}
