import { defineMessages } from '$lib/i18n/index.svelte';

export const homeMessages = defineMessages({
	fr: {
		placement: 'Positionnement',
		session: 'Session du jour',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		improving: 'plus près',
		stable: 'stable',
		worsening: 'plus loin',
		reactionLabel: 'Écart au temps',
		emptyReaction: '—',
		how: 'Le bouton lance le positionnement. La note défile dans la piste : joue-la, sur la corde indiquée, quand sa case atteint le trait. Juste et sur le temps, la position compte. Ensuite, la session du jour révise ce qui est dû. Le clic sort des enceintes de l’ordinateur.'
	},
	en: {
		placement: 'Placement',
		session: 'Daily session',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		improving: 'closer',
		stable: 'stable',
		worsening: 'farther',
		reactionLabel: 'From the beat',
		emptyReaction: '—',
		how: 'The button starts placement. The note travels along the lane: play it, on the string shown, when its tile reaches the line. In time and in tune, it counts. Then the daily session reviews what is due. The click comes from the computer speakers.'
	}
});
