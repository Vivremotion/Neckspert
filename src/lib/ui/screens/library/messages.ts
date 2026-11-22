import { defineMessages } from '$lib/i18n/index.svelte';

export const libraryMessages = defineMessages({
	fr: {
		title: 'Bibliothèque',
		exercises: 'Exercices',
		resting: 'On y revient plus tard',
		nothingToPlay: 'Rien à jouer pour l’instant',
		none: 'Aucun exercice.'
	},
	en: {
		title: 'Library',
		exercises: 'Exercises',
		resting: 'Back to it later',
		nothingToPlay: 'Nothing to play for now',
		none: 'No exercises.'
	}
});
