import type { Fraction } from '../fraction';
import type { TempoMap } from '../tempoMap';

/** A round on the tempo map, from `start`; or in free time, from the instant of its prompt. */
export type RoundClock = { map: TempoMap; start: Fraction } | { promptS: number };
