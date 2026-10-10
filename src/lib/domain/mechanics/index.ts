import type { MechanicId } from '$lib/domain/exercise/types';
import { chordGridRules } from './chordGrid';
import { identifyRules } from './identify';
import { locateRules } from './locate';
import { triadAnchorRules } from './triadAnchor';
import { triadZoneRules } from './triadZone';
import type { MechanicRules } from './types';

export * from './types';
export { identifyRules, type IdentifyData } from './identify';
export { locateRules, type LocateData } from './locate';
export {
	triadAnchorRules,
	rootPosition,
	type TriadAnchorItem,
	type TriadAnchorData,
	type TriadAnchorConfusion,
	type RootConfusion
} from './triadAnchor';
export { triadZoneRules, type TriadZoneItem, type TriadZoneData } from './triadZone';
export { classifyChord, type ChordConfusion, type ChordReading } from './triadChord';
export {
	admits,
	admittedShapes,
	chordGridRules,
	inZone,
	parseTriadId,
	shapePosition,
	triadId,
	triadShapes,
	type ChordGridConfusion,
	type ChordGridData,
	type ChordGridItem,
	type GestureRule
} from './chordGrid';

/** Every known mechanic. For validation and migration only: no other logic goes through it. */
export const MECHANIC_RULES: readonly MechanicRules[] = [
	locateRules,
	identifyRules,
	triadAnchorRules,
	triadZoneRules,
	chordGridRules
];

/** Throws on an unknown id. */
export function mechanicRules(id: MechanicId): MechanicRules {
	const rules = MECHANIC_RULES.find((candidate) => candidate.id === id);
	if (!rules) throw new Error(`Unknown mechanic: ${id}`);
	return rules;
}
