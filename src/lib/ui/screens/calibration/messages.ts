import type { LatencyProvenance } from '$lib/domain/types';
import { defineMessages } from '$lib/i18n/index.svelte';

/** A measure in ms as written in the locale: `−25,1` in French, `−25.1` in English. */
function number(value: number, decimal: string): string {
	const sign = value < 0 ? '−' : '';
	return sign + String(Math.abs(value)).replace('.', decimal);
}

const fr = (value: number) => number(value, ',');
const en = (value: number) => number(value, '.');

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
		/** The compare phase: notes played freely, no click. */
		compareInstruction: (notes: number) =>
			`Joue ${notes} notes, comme tu veux, sans clic. Le micro de l’ordinateur doit entendre ta guitare : par tes enceintes ou tes cordes.`,
		/** On the click, the player's choice. */
		playInstruction: (notes: number) => `Joue ${notes} notes étouffées, chacune sur un clic.`,
		headphones: 'Micro intégré détecté : porte un casque pour éviter le larsen.',
		progress: (done: number, needed: number) => `${done} / ${needed}`,
		level: 'Niveau',
		ok: (ms: number, provenance: LatencyProvenance) =>
			provenance === 'system'
				? `Latence mesurée : ${ms} ms, sans ton jeu.`
				: `Latence mesurée : ${ms} ms, sur ton jeu au clic.`,
		referenceLine: (ms: number, spread: number | null) =>
			`Micro de l’ordinateur sur les clics : ${fr(ms)} ms` +
			(spread === null ? '' : ` (± ${fr(spread)} ms)`),
		offsetLine: (ms: number) => `Interface − micro : ${fr(ms)} ms`,
		pairsLine: (pairs: number, played: number, spread: number | null) =>
			`${pairs} paires sur ${played} notes` +
			(spread === null ? '' : `, dispersion ${fr(spread)} ms`),
		hitsLine: (hits: number, spread: number | null) =>
			`${hits} notes sur le clic` + (spread === null ? '' : `, dispersion ${fr(spread)} ms`),
		referenceMissing: 'Aucun micro d’ordinateur trouvé pour servir de référence.',
		referenceClosed: (mic: string) => `Le micro de l’ordinateur (${mic}) ne s’est pas ouvert.`,
		referenceHeard: (
			mic: string,
			heard: number,
			clicks: number,
			delay: number | null,
			spread: number | null
		) =>
			`Le micro de l’ordinateur (${mic}) a entendu ${heard} clic${heard > 1 ? 's' : ''} sur ${clicks}` +
			(delay === null ? '' : `, à ${fr(delay)} ms`) +
			(delay === null || spread === null ? '' : ` (± ${fr(spread)} ms)`) +
			'.',
		referenceAdvice:
			'Il en faut au moins la moitié, à un écart stable : monte le son des enceintes, rapproche l’ordinateur, et reste silencieux pendant les clics. Dans Firefox, le micro de l’ordinateur entend mal les clics : calibre plutôt dans Chrome.',
		clickChoice: 'Calibrer sur mon jeu au clic',
		clickChoiceNote:
			'Elle mesure aussi ton jeu : la latence obtenue est affichée, jamais utilisée pour juger.',
		bleed: 'Ton entrée entend le clic : pour les exercices de rythme, joue au casque.',
		'no-sound': 'Aucun son détecté. Réessaie plus fort, ou change d’entrée.',
		inconsistent:
			'Les deux entrées ne s’accordent pas assez (dispersion ci-dessous). Ce n’est pas ton jeu : réessaie, en laissant sonner chaque note.',
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
			`Play ${notes} notes, any way you like, with no click. The computer’s mic must hear your guitar: through your speakers or from the strings.`,
		playInstruction: (notes: number) => `Play ${notes} muted notes, each one on a click.`,
		headphones: 'Built-in mic detected: wear headphones to avoid feedback.',
		progress: (done: number, needed: number) => `${done} / ${needed}`,
		level: 'Level',
		ok: (ms: number, provenance: LatencyProvenance) =>
			provenance === 'system'
				? `Measured latency: ${ms} ms, without your playing.`
				: `Measured latency: ${ms} ms, from your playing on the click.`,
		referenceLine: (ms: number, spread: number | null) =>
			`Computer’s mic on the clicks: ${en(ms)} ms` +
			(spread === null ? '' : ` (± ${en(spread)} ms)`),
		offsetLine: (ms: number) => `Interface − mic: ${en(ms)} ms`,
		pairsLine: (pairs: number, played: number, spread: number | null) =>
			`${pairs} pairs out of ${played} notes` +
			(spread === null ? '' : `, spread ${en(spread)} ms`),
		hitsLine: (hits: number, spread: number | null) =>
			`${hits} notes on the click` + (spread === null ? '' : `, spread ${en(spread)} ms`),
		referenceMissing: 'No computer mic found to serve as the reference.',
		referenceClosed: (mic: string) => `The computer’s mic (${mic}) did not open.`,
		referenceHeard: (
			mic: string,
			heard: number,
			clicks: number,
			delay: number | null,
			spread: number | null
		) =>
			`The computer’s mic (${mic}) heard ${heard} click${heard === 1 ? '' : 's'} out of ${clicks}` +
			(delay === null ? '' : `, at ${en(delay)} ms`) +
			(delay === null || spread === null ? '' : ` (± ${en(spread)} ms)`) +
			'.',
		referenceAdvice:
			'It needs at least half of them, at a steady delay: turn the speakers up, bring the computer closer, and stay silent during the clicks. In Firefox the computer’s mic hears the clicks poorly: calibrate in Chrome instead.',
		clickChoice: 'Calibrate on my playing on the click',
		clickChoiceNote:
			'It measures your playing too: the latency it gives is shown, never used to judge.',
		bleed: 'Your input hears the click: wear headphones for the rhythm exercises.',
		'no-sound': 'No sound detected. Try louder, or pick another input.',
		inconsistent:
			'The two inputs do not agree closely enough (spread below). It is not your playing: retry, letting each note ring.',
		'second-input':
			'The computer’s mic did not hear your notes. Bring the guitar closer to the computer and retry.',
		cancelled: 'Calibration cancelled.',
		error: 'The audio input did not open. Check that it is plugged in, then retry.'
	}
});
