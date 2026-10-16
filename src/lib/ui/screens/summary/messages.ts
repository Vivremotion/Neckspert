import { defineMessages } from '$lib/i18n/index.svelte';

export const summaryMessages = defineMessages({
	fr: {
		title: 'Bilan',
		tempo: 'Tempo',
		bpm: (n: number) => `${n} bpm`,
		accuracy: 'Précision à froid',
		accuracyAll: 'Précision',
		median: 'Écart au temps',
		naming: 'Nommer',
		learned: 'Notes apprises',
		pending: (n: number) =>
			n === 1 ? '1 note reprendra la prochaine fois' : `${n} notes reprendront la prochaine fois`,
		known: (n: number) => (n === 1 ? '1 note déjà sue' : `${n} notes déjà sues`),
		noCold: 'Aucune révision à froid cette fois',
		fatigue: 'Fatigue détectée',
		noFatigue: 'Pas de fatigue',
		next: 'Prochaines révisions',
		soon: 'Bientôt',
		inMinutes: (n: number) => (n === 1 ? 'Dans 1 min' : `Dans ${n} min`),
		inHours: (n: number) => (n === 1 ? 'Dans 1 h' : `Dans ${n} h`),
		inDays: (n: number) => (n === 1 ? 'Dans 1 j' : `Dans ${n} j`),
		home: 'Accueil',
		map: 'Carte du manche',
		empty: '—',
		learnedTriads: 'Triades apprises',
		pendingTriads: (n: number) =>
			n === 1
				? '1 triade reprendra la prochaine fois'
				: `${n} triades reprendront la prochaine fois`,
		knownTriads: (n: number) => (n === 1 ? '1 triade déjà sue' : `${n} triades déjà sues`),
		exercise: {
			'gesture-link': 'Relier les formes',
			'gesture-climb': 'Contrainte de déplacement',
			'gesture-zone': 'Rester dans une zone',
			'gesture-jam': 'Jam'
		} as Record<string, string>,
		passages: (succeeded: number, played: number) => `${succeeded} / ${played} passages réussis`,
		changes: (percent: number) => `${percent} % justes et à temps`,
		tempos: (played: number, next: number) => `${played} → ${next} bpm`,
		misses: 'Changements ratés',
		heard: (frets: string) => `Joué ${frets}`,
		nothingHeard: 'Rien entendu',
		expected: (frets: string) => `Attendu ${frets}`,
		playedRight: 'Joué juste',
		contested: 'Contesté',
		levelReached: (shown: number, of: number) => `Niveau atteint : ${shown} sur ${of}`,
		aidLevelReached: 'Niveau atteint : niveau d’aide',
		cyclesSucceeded: (successes: number, cycles: number) =>
			`${successes} ${successes > 1 ? 'cycles réussis' : 'cycle réussi'} sur ${cycles}`,
		successesAided: (n: number) => `dont ${n} avec aide`
	},
	en: {
		title: 'Summary',
		tempo: 'Tempo',
		bpm: (n: number) => `${n} bpm`,
		accuracy: 'Cold accuracy',
		accuracyAll: 'Accuracy',
		median: 'From the beat',
		naming: 'Naming',
		learned: 'Notes learned',
		pending: (n: number) =>
			n === 1 ? '1 note will resume next time' : `${n} notes will resume next time`,
		known: (n: number) => (n === 1 ? '1 note already known' : `${n} notes already known`),
		noCold: 'No cold review this time',
		fatigue: 'Fatigue detected',
		noFatigue: 'No fatigue',
		next: 'Next reviews',
		soon: 'Soon',
		inMinutes: (n: number) => (n === 1 ? 'In 1 min' : `In ${n} min`),
		inHours: (n: number) => (n === 1 ? 'In 1 h' : `In ${n} h`),
		inDays: (n: number) => (n === 1 ? 'In 1 d' : `In ${n} d`),
		home: 'Home',
		map: 'Neck map',
		empty: '—',
		learnedTriads: 'Triads learned',
		pendingTriads: (n: number) =>
			n === 1 ? '1 triad will resume next time' : `${n} triads will resume next time`,
		knownTriads: (n: number) => (n === 1 ? '1 triad already known' : `${n} triads already known`),
		exercise: {
			'gesture-link': 'Link the shapes',
			'gesture-climb': 'Move constraint',
			'gesture-zone': 'Stay in a zone',
			'gesture-jam': 'Jam'
		} as Record<string, string>,
		passages: (succeeded: number, played: number) => `${succeeded} / ${played} passages succeeded`,
		changes: (percent: number) => `${percent} % right and in time`,
		tempos: (played: number, next: number) => `${played} → ${next} bpm`,
		misses: 'Missed changes',
		heard: (frets: string) => `Played ${frets}`,
		nothingHeard: 'Nothing heard',
		expected: (frets: string) => `Expected ${frets}`,
		playedRight: 'Played right',
		contested: 'Contested',
		levelReached: (shown: number, of: number) => `Level reached: ${shown} of ${of}`,
		aidLevelReached: 'Level reached: aid level',
		cyclesSucceeded: (successes: number, cycles: number) =>
			`${successes} ${successes === 1 ? 'cycle' : 'cycles'} succeeded out of ${cycles}`,
		successesAided: (n: number) => `of which ${n} with aid`
	}
});
