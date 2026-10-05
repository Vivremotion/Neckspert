import type { MechanicId } from '$lib/domain/exercise/types';
import { identifyRules } from './identify';
import { locateRules } from './locate';
import type { MechanicRules } from './types';

export * from './types';
export { identifyRules, type IdentifyData } from './identify';
export { locateRules, type LocateData } from './locate';

/** Every known mechanic. For validation and migration only: no other logic goes through it. */
export const MECHANIC_RULES: readonly MechanicRules[] = [locateRules, identifyRules];

/** Throws on an unknown id. */
export function mechanicRules(id: MechanicId): MechanicRules {
	const rules = MECHANIC_RULES.find((candidate) => candidate.id === id);
	if (!rules) throw new Error(`Unknown mechanic: ${id}`);
	return rules;
}
