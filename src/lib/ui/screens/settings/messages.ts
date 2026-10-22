import { defineMessages } from '$lib/i18n/index.svelte';

/** Whole megabytes from 10 up; one decimal below, so a first short take does not read 0. */
function formatMb(mb: number, locale: 'fr' | 'en'): string {
	const text = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace(/\.0$/, '');
	return locale === 'fr' ? text.replace('.', ',') : text;
}

export const settingsMessages = defineMessages({
	fr: {
		title: 'Réglages',
		language: 'Langue',
		chordDiagram: 'Dessin des accords',
		chordDiagramStrings: 'Cordes',
		chordDiagramGrid: 'Grille',
		input: 'Entrée audio',
		builtInGain: 'Niveau du micro intégré',
		builtInGainHint: 'Ne change pas une interface audio.',
		decreaseBuiltInGain: 'Diminuer le niveau du micro intégré',
		increaseBuiltInGain: 'Augmenter le niveau du micro intégré',
		unlock: 'Autoriser le micro',
		emptyInputs: 'Aucune entrée visible tant que le micro n’est pas autorisé.',
		calibration: 'Calibration',
		calibrationLink: 'Ouvrir la calibration',
		latency: (ms: number | null) => (ms === null ? 'Pas encore calibré' : `Latence : ${ms} ms`),
		export: 'Exporter',
		import: 'Importer',
		confirmTitle: 'Remplacer les données actuelles ?',
		confirmBody: 'L’import écrase réglages, cartes, tentatives et sessions.',
		confirm: 'Confirmer',
		cancel: 'Annuler',
		decrease: '−',
		increase: '+',
		backup: 'Sauvegarde',
		diagnostics: 'Diagnostic',
		diagnosticsRecord: 'Enregistrer le son et les détails de la détection',
		diagnosticsToggle: (on: boolean) =>
			`Enregistrer le son et les détails de la détection : ${on ? 'activé' : 'coupé'}`,
		diagnosticsState: (on: boolean) => (on ? 'Activé' : 'Coupé'),
		diagnosticsUsage: (mb: number, budgetMb: number) => `${formatMb(mb, 'fr')} Mo sur ${budgetMb}`,
		diagnosticsBudget: 'Place réservée',
		diagnosticsBudgetOption: (mb: number) => `${mb} Mo`,
		diagnosticsNativeRate: 'Enregistrer au débit natif',
		diagnosticsNativeRateToggle: (on: boolean) =>
			`Enregistrer au débit natif : ${on ? 'activé' : 'coupé'}`,
		diagnosticsNativeRateHint:
			'Développement : garde les attaques au-dessus de 8 kHz, bien plus lourd.',
		diagnosticsExport: 'Exporter le diagnostic',
		diagnosticsClear: 'Effacer'
	},
	en: {
		title: 'Settings',
		language: 'Language',
		chordDiagram: 'Chord drawing',
		chordDiagramStrings: 'Strings',
		chordDiagramGrid: 'Grid',
		input: 'Audio input',
		builtInGain: 'Built-in mic level',
		builtInGainHint: 'Does not change an audio interface.',
		decreaseBuiltInGain: 'Decrease built-in mic level',
		increaseBuiltInGain: 'Increase built-in mic level',
		unlock: 'Allow microphone',
		emptyInputs: 'No inputs are listed until the microphone is allowed.',
		calibration: 'Calibration',
		calibrationLink: 'Open calibration',
		latency: (ms: number | null) => (ms === null ? 'Not calibrated yet' : `Latency: ${ms} ms`),
		export: 'Export',
		import: 'Import',
		confirmTitle: 'Replace current data?',
		confirmBody: 'Import overwrites settings, cards, attempts and sessions.',
		confirm: 'Confirm',
		cancel: 'Cancel',
		decrease: '−',
		increase: '+',
		backup: 'Backup',
		diagnostics: 'Diagnostics',
		diagnosticsRecord: 'Record sound and detection details',
		diagnosticsToggle: (on: boolean) => `Record sound and detection details: ${on ? 'on' : 'off'}`,
		diagnosticsState: (on: boolean) => (on ? 'On' : 'Off'),
		diagnosticsUsage: (mb: number, budgetMb: number) => `${formatMb(mb, 'en')} MB of ${budgetMb}`,
		diagnosticsBudget: 'Space allowed',
		diagnosticsBudgetOption: (mb: number) => `${mb} MB`,
		diagnosticsNativeRate: 'Record at the native rate',
		diagnosticsNativeRateToggle: (on: boolean) => `Record at the native rate: ${on ? 'on' : 'off'}`,
		diagnosticsNativeRateHint: 'Development: keeps attacks above 8 kHz, much heavier.',
		diagnosticsExport: 'Export diagnostics',
		diagnosticsClear: 'Clear'
	}
});
