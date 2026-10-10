import { defineMessages } from '$lib/i18n/index.svelte';

export const viewMessages = defineMessages({
	fr: {
		zone: (from: number, to: number) => `cases ${from} à ${to}`,
		up: '↑ en montant',
		down: '↓ en descendant',
		next: 'Ensuite',
		aid: 'Forme suivante',
		end: 'Fin',
		link: 'Relier',
		upThenDown: 'monte, puis redescends par le même chemin',
		goingDown: 'tu redescends par le même chemin',
		now: 'Maintenant',
		first: 'D’abord',
		beats: (n: number) => `temps ${n} sur 4`
	},
	en: {
		zone: (from: number, to: number) => `frets ${from} to ${to}`,
		up: '↑ going up',
		down: '↓ going down',
		next: 'Next',
		aid: 'Next shape',
		end: 'End',
		link: 'Link',
		upThenDown: 'go up, then come back down the same way',
		goingDown: 'coming back down the same way',
		now: 'Now',
		first: 'First',
		beats: (n: number) => `beat ${n} of 4`
	}
});
