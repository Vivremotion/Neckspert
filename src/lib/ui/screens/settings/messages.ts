import { defineMessages } from '$lib/i18n/index.svelte';

export const settingsMessages = defineMessages({
	fr: {
		title: 'Réglages',
		language: 'Langue',
		input: 'Entrée audio',
		builtInGain: 'Niveau du micro intégré',
		builtInGainHint: 'Ne change pas une interface audio.',
		decreaseBuiltInGain: 'Diminuer le niveau du micro intégré',
		increaseBuiltInGain: 'Augmenter le niveau du micro intégré',
		unlock: 'Autoriser le micro',
		emptyInputs: 'Aucune entrée visible tant que le micro n’est pas autorisé.',
		calibration: 'Calibration',
		calibrationLink: 'Ouvrir la calibration',
		offset: (ms: number | null) => (ms === null ? 'Pas encore calibré' : `Offset : ${ms} ms`),
		export: 'Exporter',
		import: 'Importer',
		confirmTitle: 'Remplacer les données actuelles ?',
		confirmBody: 'L’import écrase réglages, cartes, tentatives et sessions.',
		confirm: 'Confirmer',
		cancel: 'Annuler',
		decrease: '−',
		increase: '+'
	},
	en: {
		title: 'Settings',
		language: 'Language',
		input: 'Audio input',
		builtInGain: 'Built-in mic level',
		builtInGainHint: 'Does not change an audio interface.',
		decreaseBuiltInGain: 'Decrease built-in mic level',
		increaseBuiltInGain: 'Increase built-in mic level',
		unlock: 'Allow microphone',
		emptyInputs: 'No inputs are listed until the microphone is allowed.',
		calibration: 'Calibration',
		calibrationLink: 'Open calibration',
		offset: (ms: number | null) => (ms === null ? 'Not calibrated yet' : `Offset: ${ms} ms`),
		export: 'Export',
		import: 'Import',
		confirmTitle: 'Replace current data?',
		confirmBody: 'Import overwrites settings, cards, attempts and sessions.',
		confirm: 'Confirm',
		cancel: 'Cancel',
		decrease: '−',
		increase: '+'
	}
});
