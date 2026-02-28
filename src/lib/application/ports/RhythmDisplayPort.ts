import type { Bar } from '$lib/utils/barUtils';

/**
 * Driven port: controls what is shown in the rhythm/bar display.
 */
export interface RhythmDisplayPort {
	reset(): void;
	setCurrentBar(bar: Bar): void;
	setNextBar(bar: Bar | null): void;
	setActiveChord(chordId: string | null): void;
}
