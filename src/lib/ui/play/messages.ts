import { defineMessages } from '$lib/i18n/index.svelte';
import type { SessionKind } from '$lib/domain/types';

const HOW_TO_NOTES_FR =
	'La note défile dans la piste. Joue-la, sur la corde indiquée, quand sa case atteint le trait. Le clic sort des enceintes de l’ordinateur.';
const HOW_TO_NOTES_EN =
	'The note travels along the lane. Play it, on the string shown, when its tile reaches the line. The click comes from the computer speakers.';

export const playMessages = defineMessages({
	fr: {
		pause: 'Pause',
		resume: 'Reprendre',
		quit: 'Quitter',
		start: 'Commencer',
		again: 'Recommencer',
		howTo: {
			learn: HOW_TO_NOTES_FR,
			free: HOW_TO_NOTES_FR,
			triads:
				'Deux consignes alternent. « C · fondamentale sur sol » : quand la case atteint le trait, joue la fondamentale seule sur cette corde, puis plaque l’accord sur les trois cordes indiquées pendant la bande qui suit. « C · vers la case 5 » : plaque l’accord sur la forme qui couvre cette case quand sa case atteint le trait. Le clic sort des enceintes de l’ordinateur.'
		} satisfies Record<SessionKind, string>,
		verdict: {
			perfect: 'Parfait',
			early: 'En avance',
			late: 'En retard',
			offbeat: 'Hors temps',
			corrected: 'Corrigé',
			wrong: 'Mauvaise note'
		} as const,
		noInput:
			'Aucune entrée audio ne s’ouvre. Branche ton interface ou autorise le micro, puis recommence.',
		played: 'Joué',
		expected: 'Attendu',
		playedRight: 'Joué juste',
		contested: 'Contesté',
		stringOf: (name: string) => `corde de ${name}`,
		aidFret: (fret: number) => `case ${fret}`
	},
	en: {
		pause: 'Pause',
		resume: 'Resume',
		quit: 'Quit',
		start: 'Start',
		again: 'Restart',
		howTo: {
			learn: HOW_TO_NOTES_EN,
			free: HOW_TO_NOTES_EN,
			triads:
				'Two prompts take turns. “C · root on G”: when its tile reaches the line, play the root alone on that string, then strum the chord on the three strings shown during the band that follows. “C · around fret 5”: strum the chord in the shape that covers that fret when its tile reaches the line. The click comes from the computer speakers.'
		} satisfies Record<SessionKind, string>,
		verdict: {
			perfect: 'Perfect',
			early: 'Early',
			late: 'Late',
			offbeat: 'Off beat',
			corrected: 'Corrected',
			wrong: 'Wrong note'
		} as const,
		noInput:
			'No audio input could be opened. Plug in your interface or allow the microphone, then start again.',
		played: 'Played',
		expected: 'Expected',
		playedRight: 'Played right',
		contested: 'Contested',
		stringOf: (name: string) => `${name} string`,
		aidFret: (fret: number) => `fret ${fret}`
	}
});
