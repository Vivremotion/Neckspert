// Removed by Task 5 of plan 2a: the only place the code still turns a skill into a mechanic.
import type { ItemSetName } from '$lib/domain/sets/names';
import { hasSkill, skillById } from './registry';
import type { SkillId } from './types';

/** The eleven skills of the catalog and the mechanic whose code plays each today. */
const MECHANIC_OF_CATALOG_SKILL: Readonly<Record<SkillId, string>> = {
	'locate-note-string': 'locate',
	'identify-note': 'identify',
	'chord-anchor': 'triad-anchor',
	'chord-zone': 'triad-zone',
	'inversion-run': 'chord-grid',
	'grid-in-direction': 'chord-grid',
	'grid-in-zone': 'chord-grid',
	'grid-reading': 'chord-grid',
	'inner-pulse': 'figure',
	'displaced-pulse': 'figure',
	'figure-independence': 'figure'
};

/** The mechanic that plays the items of a set (D3 read backwards; the triads' set: the anchor). */
const MECHANIC_OF_SET: Readonly<Record<ItemSetName, string>> = {
	'note-on-string': 'locate',
	'placed-note': 'identify',
	'voicing-on-strings': 'triad-anchor',
	'placed-voicing': 'voicing-figure',
	'placed-shape': 'form-figure',
	change: 'chord-grid',
	figure: 'figure'
};

/**
 * The mechanic whose code still plays this skill. A skill no definition holds names the mechanic
 * of its own id: the fake mechanics of the specs, which have no set.
 */
export function mechanicOfSkill(skill: SkillId): string {
	if (Object.hasOwn(MECHANIC_OF_CATALOG_SKILL, skill)) return MECHANIC_OF_CATALOG_SKILL[skill];
	if (!hasSkill(skill)) return skill;
	return MECHANIC_OF_SET[skillById(skill).items as ItemSetName];
}
