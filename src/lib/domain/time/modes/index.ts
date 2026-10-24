import { alignmentPairing } from './alignment';
import { cycleVerdictMode } from './cycleVerdict';
import { firstAnswerPairing } from './firstAnswer';
import { responseVerdict } from './responseVerdict';
import type { PairingMode, RoundModes, VerdictMode } from './types';

export * from './types';
export * from './times';
export * from './firstAnswerTimes';
export * from './firstAnswer';
export * from './alignment';
export * from './responseVerdict';
export * from './cycleVerdict';

const byId = <M extends { id: string }>(modes: M[]): Record<string, M> =>
	Object.fromEntries(modes.map((mode) => [mode.id, mode]));

/** Every mode a round plan may name, by id: the engine reads them here and names none. */
export const ROUND_MODES: RoundModes = {
	pairings: byId<PairingMode>([firstAnswerPairing, alignmentPairing]),
	verdicts: byId<VerdictMode>([responseVerdict, cycleVerdictMode])
};
