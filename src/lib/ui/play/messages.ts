import { defineMessages } from '$lib/i18n/index.svelte';

export const playMessages = defineMessages({
	fr: {
		pause: 'Pause',
		resume: 'Reprendre',
		quit: 'Quitter',
		start: 'Commencer',
		measure: (bar: number, bars: number, beat: number, beatsPerBar: number) =>
			`MESURE ${bar}/${bars} TEMPS ${beat}/${beatsPerBar}`,
		verdict: {
			perfect: 'Parfait',
			early: 'En avance',
			late: 'En retard',
			wrong: 'Mauvaise note'
		} as const,
		stringOf: (name: string) => `corde de ${name}`,
		aidFret: (fret: number) => `case ${fret}`
	},
	en: {
		pause: 'Pause',
		resume: 'Resume',
		quit: 'Quit',
		start: 'Start',
		measure: (bar: number, bars: number, beat: number, beatsPerBar: number) =>
			`BAR ${bar}/${bars} BEAT ${beat}/${beatsPerBar}`,
		verdict: {
			perfect: 'Perfect',
			early: 'Early',
			late: 'Late',
			wrong: 'Wrong note'
		} as const,
		stringOf: (name: string) => `${name} string`,
		aidFret: (fret: number) => `fret ${fret}`
	}
});
