import { defineMessages } from '$lib/i18n/index.svelte';

export const playMessages = defineMessages({
	fr: {
		pause: 'Pause',
		resume: 'Reprendre',
		quit: 'Quitter',
		start: 'Commencer',
		again: 'Recommencer',
		howTo:
			'La note défile dans la piste. Joue-la, sur la corde indiquée, quand sa case atteint le trait. Le clic sort des enceintes de l’ordinateur.',
		verdict: {
			perfect: 'Parfait',
			early: 'En avance',
			late: 'En retard',
			offbeat: 'Hors temps',
			wrong: 'Mauvaise note'
		} as const,
		noInput:
			'Aucune entrée audio ne s’ouvre. Branche ton interface ou autorise le micro, puis recommence.',
		stringOf: (name: string) => `corde de ${name}`,
		aidFret: (fret: number) => `case ${fret}`
	},
	en: {
		pause: 'Pause',
		resume: 'Resume',
		quit: 'Quit',
		start: 'Start',
		again: 'Restart',
		howTo:
			'The note travels along the lane. Play it, on the string shown, when its tile reaches the line. The click comes from the computer speakers.',
		verdict: {
			perfect: 'Perfect',
			early: 'Early',
			late: 'Late',
			offbeat: 'Off beat',
			wrong: 'Wrong note'
		} as const,
		noInput:
			'No audio input could be opened. Plug in your interface or allow the microphone, then start again.',
		stringOf: (name: string) => `${name} string`,
		aidFret: (fret: number) => `fret ${fret}`
	}
});
