import type { LatencyProvenance } from '$lib/domain/types';
import { defineMessages } from '$lib/i18n/index.svelte';

export const calibrationMessages = defineMessages({
	fr: {
		title: 'Calibration',
		input: 'Entrée audio',
		unlock: 'Autoriser le micro',
		emptyInputs: 'Aucune entrée visible tant que le micro n’est pas autorisé.',
		listen: 'Écouter le niveau',
		listening: 'Écoute en cours',
		start: 'Calibrer',
		cancel: 'Annuler',
		retry: 'Réessayer',
		/** The listen phase: the clicks, the player silent. */
		listenInstruction:
			'Ne joue pas. Si tu joues au casque, pose-le contre le micro de l’ordinateur.',
		/** The bleed check of the computer's mic as the playing input. */
		bleedInstruction: 'Remets ton casque, et ne joue pas.',
		/** The compare phase: notes played freely. */
		compareInstruction: (notes: number) =>
			`Joue ${notes} notes, comme tu veux, sans retour par les haut-parleurs.`,
		/** The fallback: the player on the click. */
		playInstruction: 'Joue une corde étouffée sur chaque clic du métronome.',
		headphones: 'Micro intégré détecté : porte un casque pour éviter le larsen.',
		progress: (done: number, needed: number) => `${done} / ${needed}`,
		level: 'Niveau',
		ok: (ms: number, provenance: LatencyProvenance) =>
			provenance === 'system'
				? `Latence mesurée : ${ms} ms, sans ton jeu.`
				: `Latence mesurée : ${ms} ms, sur ton jeu au clic.`,
		bleed: 'Ton entrée entend le clic : pour les exercices de rythme, joue au casque.',
		'no-sound': 'Aucun son détecté. Réessaie plus fort, ou change d’entrée.',
		inconsistent: 'Mesures trop dispersées. Réessaie au calme, en suivant la consigne.',
		'second-input':
			'Le micro de l’ordinateur n’a pas entendu tes notes. Rapproche la guitare de l’ordinateur et réessaie.',
		cancelled: 'Calibration annulée.',
		error: 'L’entrée audio ne s’est pas ouverte. Vérifie qu’elle est branchée, puis réessaie.'
	},
	en: {
		title: 'Calibration',
		input: 'Audio input',
		unlock: 'Allow microphone',
		emptyInputs: 'No inputs are listed until the microphone is allowed.',
		listen: 'Listen to level',
		listening: 'Listening',
		start: 'Calibrate',
		cancel: 'Cancel',
		retry: 'Retry',
		listenInstruction:
			'Don’t play. If you play with headphones, hold them against the computer’s mic.',
		bleedInstruction: 'Put your headphones back on, and don’t play.',
		compareInstruction: (notes: number) =>
			`Play ${notes} notes, any way you like, with no sound from the speakers.`,
		playInstruction: 'Play a muted string on every metronome click.',
		headphones: 'Built-in mic detected: wear headphones to avoid feedback.',
		progress: (done: number, needed: number) => `${done} / ${needed}`,
		level: 'Level',
		ok: (ms: number, provenance: LatencyProvenance) =>
			provenance === 'system'
				? `Measured latency: ${ms} ms, without your playing.`
				: `Measured latency: ${ms} ms, from your playing on the click.`,
		bleed: 'Your input hears the click: wear headphones for the rhythm exercises.',
		'no-sound': 'No sound detected. Try louder, or pick another input.',
		inconsistent: 'Measurements too scattered. Retry in a quiet room, following the instruction.',
		'second-input':
			'The computer’s mic did not hear your notes. Bring the guitar closer to the computer and retry.',
		cancelled: 'Calibration cancelled.',
		error: 'The audio input did not open. Check that it is plugged in, then retry.'
	}
});
