import { defineMessages } from '$lib/i18n/index.svelte';

export const settingsMessages = defineMessages({
	fr: {
		title: 'Réglages',
		language: 'Langue',
		tempo: 'Tempo',
		input: 'Entrée audio',
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
		tempo: 'Tempo',
		input: 'Audio input',
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
