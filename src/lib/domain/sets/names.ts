/** The names of the item sets the code knows; a skill's `items` names one. */
export const ITEM_SET_NAMES = [
	'note-on-string',
	'placed-note',
	'voicing-on-strings',
	'placed-voicing',
	'placed-shape',
	'change',
	'figure'
] as const;
export type ItemSetName = (typeof ITEM_SET_NAMES)[number];
