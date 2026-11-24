import { defineMessages } from '$lib/i18n/index.svelte';
import type { Announcement } from '$lib/application/session/contract';

export const playMessages = defineMessages({
	fr: {
		pause: 'Pause',
		resume: 'Reprendre',
		quit: 'Quitter',
		start: 'Commencer',
		again: 'Recommencer',
		/** Told on the start screen of an exercise played alone that tells none. */
		howTo:
			'Joue ce que l’exercice demande, en suivant le clic. Sa consigne s’affiche avant la première série.',
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
		aidFret: (fret: number) => `case ${fret}`,
		finished: 'Série terminée',
		go: 'C’est parti',
		fatigue: 'Fatigue détectée : la session s’arrête à la fin du passage',
		bleed:
			'Le micro entend le clic : branche un casque ou ta guitare sur une interface, puis relance.',
		/** The header of a session played freely. */
		freePlay: 'Jeu libre',
		playedAs: (label: string) => `${label} joué`,
		nothingHeard: 'rien entendu',
		tempo: (bpm: number) => `♩ = ${bpm}`,
		/** What the series announces; `shown`, the level's number on screen (1 for the first). */
		announcement: {
			'level-up': (shown: number, of: number, bpm: number) =>
				`Niveau ${shown} sur ${of} · ♩ = ${bpm}`,
			'level-down': (shown: number, of: number, bpm: number) =>
				`Niveau ${shown} sur ${of} · ♩ = ${bpm}`,
			'aid-level': (_shown: number, _of: number, bpm: number) => `Niveau d’aide · ♩ = ${bpm}`,
			'listen-remedy': () => 'On réécoute la figure',
			'play-along': () => 'On la joue ensemble',
			'change-of-air': () => 'On change d’air'
		} satisfies Record<Announcement, (shown: number, of: number, bpm: number) => string>,
		/** « On change d’air » of an exercise that leaves a session of several, by its name. */
		changeOfAirOf: (name: string) => `On change d’air : ${name}`,
		replay: 'Réécouter',
		replaying: 'Réécoute…',
		/** The key of « Écouter la figure »: E, for écouter. */
		listenKey: 'E',
		replayKey: 'R'
	},
	en: {
		pause: 'Pause',
		resume: 'Resume',
		quit: 'Quit',
		start: 'Start',
		again: 'Restart',
		howTo:
			'Play what the exercise asks, following the click. Its instructions show before the first run.',
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
		aidFret: (fret: number) => `fret ${fret}`,
		finished: 'Series over',
		go: 'Let’s go',
		fatigue: 'Fatigue detected: the session stops at the end of the passage',
		bleed:
			'The microphone hears the click: plug in headphones, or your guitar through an interface, then start again.',
		freePlay: 'Free play',
		playedAs: (label: string) => `${label} played`,
		nothingHeard: 'nothing heard',
		tempo: (bpm: number) => `♩ = ${bpm}`,
		announcement: {
			'level-up': (shown: number, of: number, bpm: number) =>
				`Level ${shown} of ${of} · ♩ = ${bpm}`,
			'level-down': (shown: number, of: number, bpm: number) =>
				`Level ${shown} of ${of} · ♩ = ${bpm}`,
			'aid-level': (_shown: number, _of: number, bpm: number) => `Aid level · ♩ = ${bpm}`,
			'listen-remedy': () => 'Let’s hear the figure again',
			'play-along': () => 'Let’s play it together',
			'change-of-air': () => 'Time for a change of air'
		} satisfies Record<Announcement, (shown: number, of: number, bpm: number) => string>,
		changeOfAirOf: (name: string) => `Time for a change of air: ${name}`,
		replay: 'Replay',
		replaying: 'Replaying…',
		/** The key of “Listen to the figure”: L, for listen. */
		listenKey: 'L',
		replayKey: 'R'
	}
});
