import { defineMessages } from '$lib/i18n/index.svelte';

export const homeMessages = defineMessages({
	fr: {
		placement: 'Positionnement',
		session: 'Session du jour',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		improving: 'en baisse',
		stable: 'stable',
		worsening: 'en hausse',
		reactionLabel: 'Médiane à froid',
		emptyReaction: '—'
	},
	en: {
		placement: 'Placement',
		session: 'Daily session',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		improving: 'getting faster',
		stable: 'stable',
		worsening: 'getting slower',
		reactionLabel: 'Cold median',
		emptyReaction: '—'
	}
});
