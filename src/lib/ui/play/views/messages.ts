import { defineMessages } from '$lib/i18n/index.svelte';

export const viewMessages = defineMessages({
	fr: {
		zone: (from: number, to: number) => `cases ${from} à ${to}`,
		up: '↑ en montant',
		down: '↓ en descendant',
		next: 'Ensuite',
		aid: 'Forme suivante',
		end: 'Fin',
		onStrings: 'sur cordes'
	},
	en: {
		zone: (from: number, to: number) => `frets ${from} to ${to}`,
		up: '↑ going up',
		down: '↓ going down',
		next: 'Next',
		aid: 'Next shape',
		end: 'End',
		onStrings: 'on strings'
	}
});
