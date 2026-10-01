import { defineMessages } from '$lib/i18n/index.svelte';

export const summaryMessages = defineMessages({
	fr: {
		title: 'Bilan',
		accuracy: 'Précision à froid',
		accuracyAll: 'Précision',
		median: 'Écart au temps',
		naming: 'Nommer',
		learned: 'Positions apprises',
		fatigue: 'Fatigue détectée',
		noFatigue: 'Pas de fatigue',
		next: 'Prochaine session',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		home: 'Accueil',
		map: 'Carte du manche',
		empty: '—'
	},
	en: {
		title: 'Summary',
		accuracy: 'Cold accuracy',
		accuracyAll: 'Accuracy',
		median: 'From the beat',
		naming: 'Naming',
		learned: 'Positions learned',
		fatigue: 'Fatigue detected',
		noFatigue: 'No fatigue',
		next: 'Next session',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		home: 'Home',
		map: 'Neck map',
		empty: '—'
	}
});
