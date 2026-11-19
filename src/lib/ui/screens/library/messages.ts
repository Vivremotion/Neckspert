import { defineMessages } from '$lib/i18n/index.svelte';

export const libraryMessages = defineMessages({
	fr: {
		title: 'Bibliothèque',
		exercises: 'Exercices',
		minutes: (n: number) => `${n}′`,
		minutesSpoken: (n: number) => `${n} min`,
		resting: 'On y revient plus tard',
		nothingToPlay: 'Rien à jouer pour l’instant'
	},
	en: {
		title: 'Library',
		exercises: 'Exercises',
		minutes: (n: number) => `${n}′`,
		minutesSpoken: (n: number) => `${n} min`,
		resting: 'Back to it later',
		nothingToPlay: 'Nothing to play for now'
	}
});
