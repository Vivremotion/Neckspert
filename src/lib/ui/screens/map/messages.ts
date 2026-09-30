import { defineMessages } from '$lib/i18n/index.svelte';
import type { CardStatus } from '$lib/domain/types';

export const mapMessages = defineMessages({
	fr: {
		title: 'Carte du manche',
		home: 'Accueil',
		locate: 'Localisation',
		identify: 'Identification',
		cell: (string: number, fret: number) => `Corde ${string}, case ${fret}`,
		status: {
			unseen: 'non vu',
			learning: 'en cours',
			acquired: 'acquis',
			mastered: 'maîtrisé'
		} satisfies Record<CardStatus, string>
	},
	en: {
		title: 'Neck map',
		home: 'Home',
		locate: 'Locate',
		identify: 'Identify',
		cell: (string: number, fret: number) => `String ${string}, fret ${fret}`,
		status: {
			unseen: 'unseen',
			learning: 'learning',
			acquired: 'acquired',
			mastered: 'mastered'
		} satisfies Record<CardStatus, string>
	}
});
