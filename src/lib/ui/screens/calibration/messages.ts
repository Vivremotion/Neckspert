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
		instruction: 'Joue une corde étouffée sur chaque clic du métronome.',
		headphones: 'Micro intégré détecté : porte un casque pour éviter le larsen.',
		progress: (hits: number, needed: number) => `${hits} / ${needed}`,
		level: 'Niveau',
		ok: (ms: number) => `Latence mesurée : ${ms} ms`,
		'no-sound': 'Aucun son détecté. Réessaie plus fort, ou change d’entrée.',
		inconsistent: 'Mesures trop dispersées. Réessaie en jouant pile sur le clic.',
		cancelled: 'Calibration annulée.'
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
		instruction: 'Play a muted string on every metronome click.',
		headphones: 'Built-in mic detected: wear headphones to avoid feedback.',
		progress: (hits: number, needed: number) => `${hits} / ${needed}`,
		level: 'Level',
		ok: (ms: number) => `Measured latency: ${ms} ms`,
		'no-sound': 'No sound detected. Try louder, or pick another input.',
		inconsistent: 'Hits too scattered. Retry, playing right on the click.',
		cancelled: 'Calibration cancelled.'
	}
});
