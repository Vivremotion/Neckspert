import { defineMessages } from '$lib/i18n/index.svelte';

export const homeMessages = defineMessages({
	fr: {
		title: 'Pratiquer',
		blocks: 'Séances',
		start: 'Commencer',
		minutes: (n: number) => `${n}′`,
		minutesSpoken: (n: number) => `${n} min`,
		nothingToPlay: 'Rien à jouer pour l’instant',
		library: 'Bibliothèque',
		catalogRefused: 'Une partie du catalogue n’a pas pu être chargée.',
		refusedTitle: 'Fichiers refusés',
		importedProblems: (n: number) =>
			n === 1 ? 'Un fichier importé a un problème.' : `${n} fichiers importés ont un problème.`,
		importedProblemsLink: 'Voir dans les réglages',
		due: (n: number) => (n === 1 ? '1 révision due' : `${n} révisions dues`),
		nextReviews: 'Prochaines révisions',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`)
	},
	en: {
		title: 'Practice',
		blocks: 'Sessions',
		start: 'Start',
		minutes: (n: number) => `${n}′`,
		minutesSpoken: (n: number) => `${n} min`,
		nothingToPlay: 'Nothing to play for now',
		library: 'Library',
		catalogRefused: 'Part of the catalog could not be loaded.',
		refusedTitle: 'Files refused',
		importedProblems: (n: number) =>
			n === 1 ? 'An imported file has a problem.' : `${n} imported files have a problem.`,
		importedProblemsLink: 'See in the settings',
		due: (n: number) => (n === 1 ? '1 review due' : `${n} reviews due`),
		nextReviews: 'Next reviews',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`)
	}
});
