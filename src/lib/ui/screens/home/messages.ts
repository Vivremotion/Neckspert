import { defineMessages } from '$lib/i18n/index.svelte';

export const homeMessages = defineMessages({
	fr: {
		title: 'Pratiquer',
		blocks: 'Séances',
		start: 'Commencer',
		minutes: (n: number) => `${n}′`,
		minutesSpoken: (n: number) => `${n} min`,
		session: 'Apprentissage',
		triads: 'Triades',
		triadsZone: 'Triades vers une case',
		gesture: 'Changements',
		exercises: 'Exercices',
		resting: 'On y revient plus tard',
		refusedTitle: 'Fichiers refusés',
		importedProblems: (n: number) =>
			n === 1 ? 'Un fichier importé a un problème.' : `${n} fichiers importés ont un problème.`,
		importedProblemsLink: 'Voir dans les réglages',
		triadsDue: (n: number) =>
			n === 1 ? '1 révision de triades due' : `${n} révisions de triades dues`,
		due: (n: number) => (n === 1 ? '1 révision due' : `${n} révisions dues`),
		nextReviews: 'Prochaines révisions',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		improving: 'plus près',
		stable: 'stable',
		worsening: 'plus loin',
		reactionLabel: 'Écart au temps',
		emptyReaction: '—'
	},
	en: {
		title: 'Practice',
		blocks: 'Sessions',
		start: 'Start',
		minutes: (n: number) => `${n}′`,
		minutesSpoken: (n: number) => `${n} min`,
		session: 'Learn',
		triads: 'Triads',
		triadsZone: 'Triads around a fret',
		gesture: 'Changes',
		exercises: 'Exercises',
		resting: 'Back to it later',
		refusedTitle: 'Files refused',
		importedProblems: (n: number) =>
			n === 1 ? 'An imported file has a problem.' : `${n} imported files have a problem.`,
		importedProblemsLink: 'See in the settings',
		triadsDue: (n: number) => (n === 1 ? '1 triad review due' : `${n} triad reviews due`),
		due: (n: number) => (n === 1 ? '1 review due' : `${n} reviews due`),
		nextReviews: 'Next reviews',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		improving: 'closer',
		stable: 'stable',
		worsening: 'farther',
		reactionLabel: 'From the beat',
		emptyReaction: '—'
	}
});
