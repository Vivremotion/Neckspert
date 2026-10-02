import { defineMessages } from '$lib/i18n/index.svelte';

export const homeMessages = defineMessages({
	fr: {
		placement: 'Positionnement',
		session: 'Apprentissage',
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
		emptyReaction: '—',
		how: 'Le bouton lance le positionnement, puis l’Apprentissage : environ 5 minutes, à relancer quand tu veux. La note défile dans la piste : joue-la, sur la corde indiquée, quand sa case atteint le trait. Les cordes à vide sont supposées connues. Le clic sort des enceintes de l’ordinateur.'
	},
	en: {
		placement: 'Placement',
		session: 'Learn',
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
		emptyReaction: '—',
		how: 'The button starts placement, then Learn: about 5 minutes, start again whenever you like. The note travels along the lane: play it, on the string shown, when its tile reaches the line. Open strings are assumed known. The click comes from the computer speakers.'
	}
});
