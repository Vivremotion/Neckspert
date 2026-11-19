import { defineMessages } from '$lib/i18n/index.svelte';
import type { CardStatus } from '$lib/domain/types';

export const mapMessages = defineMessages({
	fr: {
		title: 'Carte du manche',
		board: 'Manche',
		empty: 'Aucune case à montrer : aucun exercice ne liste de place sur le manche.',
		home: 'Pratiquer',
		locate: 'Localisation',
		identify: 'Identification',
		cell: (string: number, fret: number) => `Corde ${string}, case ${fret}`,
		beats: (n: number) => (n === 1 ? '1 temps' : `${n} temps`),
		seconds: (ms: number) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`,
		recall: (ms: string) => `dernier rappel à froid réussi en ${ms}`,
		status: {
			unseen: 'non vu',
			learning: 'en cours',
			acquired: 'acquis',
			mastered: 'maîtrisé'
		} satisfies Record<CardStatus, string>
	},
	en: {
		title: 'Neck map',
		board: 'Neck',
		empty: 'No place to show: no exercise lists a place on the neck.',
		home: 'Practice',
		locate: 'Locate',
		identify: 'Identify',
		cell: (string: number, fret: number) => `String ${string}, fret ${fret}`,
		beats: (n: number) => (n === 1 ? '1 beat' : `${n} beats`),
		seconds: (ms: number) => `${(ms / 1000).toFixed(2)} s`,
		recall: (ms: string) => `last cold recall in ${ms}`,
		status: {
			unseen: 'unseen',
			learning: 'learning',
			acquired: 'acquired',
			mastered: 'mastered'
		} satisfies Record<CardStatus, string>
	}
});
