import { defineMessages } from '$lib/i18n/index.svelte';

export const summaryMessages = defineMessages({
	fr: {
		title: 'Bilan',
		accuracy: 'Précision à froid',
		accuracyAll: 'Précision',
		median: 'Écart au temps',
		naming: 'Nommer',
		learned: 'Notes apprises',
		pending: (n: number) =>
			n === 1 ? '1 note reprendra la prochaine fois' : `${n} notes reprendront la prochaine fois`,
		known: (n: number) => (n === 1 ? '1 note déjà sue' : `${n} notes déjà sues`),
		noCold: 'Aucune révision à froid cette fois',
		fatigue: 'Fatigue détectée',
		noFatigue: 'Pas de fatigue',
		next: 'Prochaines révisions',
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
		learned: 'Notes learned',
		pending: (n: number) =>
			n === 1 ? '1 note will resume next time' : `${n} notes will resume next time`,
		known: (n: number) => (n === 1 ? '1 note already known' : `${n} notes already known`),
		noCold: 'No cold review this time',
		fatigue: 'Fatigue detected',
		noFatigue: 'No fatigue',
		next: 'Next reviews',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		home: 'Home',
		map: 'Neck map',
		empty: '—'
	}
});
