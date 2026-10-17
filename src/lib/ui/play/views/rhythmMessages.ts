import { defineMessages } from '$lib/i18n/index.svelte';
import type { Locale } from '$lib/domain/types';

/** A drift of the hold, worded: the click gone, the player speeds up or slows down. */
export type DriftWords = 'rush' | 'drag' | null;

/** A rounded offset with its sign, the minus typographic: « −35 », « +5 », « 0 ». */
export function signed(value: number): string {
	const rounded = Math.round(value);
	if (rounded === 0) return '0';
	return rounded < 0 ? `−${-rounded}` : `+${rounded}`;
}

/** « −35 ms », « +28 ms ». */
const signedMs = (value: number) => `${signed(value)} ms`;

const FR = {
	header: (label: string, level: string, tempo: string) => `${label} · ${level} · ${tempo}`,
	level: (shown: number, of: number) => `niveau ${shown} sur ${of}`,
	aidLevel: 'niveau d’aide',
	tempo: (unit: string, bpm: number) => `${unit} = ${bpm} bpm`,
	bar: (bar: number, of: number) => `mesure ${bar} / ${of}`,
	click: 'clic',
	silence: 'silence',
	phase: {
		'listen-in': 'Écoute le clic',
		'count-in': 'On compte',
		play: '',
		listening: 'On écoute la figure',
		breath: 'Respiration'
	},
	listen: 'Écouter la figure',
	notationFailed: 'La partition n’a pas pu se charger : recharge la page.',
	played: 'Joué',
	toPlay: 'À jouer',
	cycle: (n: number) => `cycle ${n}`,
	passed: 'réussi',
	failed: 'raté',
	announcement: {
		'level-up': (level: string) => `On monte : ${level}`,
		'level-down': (level: string) => `On redescend : ${level}`,
		'aid-level': (level: string) => `Niveau d’aide : ${level}`,
		'listen-remedy': () => 'On réécoute la figure',
		'play-along': () => 'On la joue ensemble',
		'change-of-air': () => 'On change d’air'
	},
	mark: {
		'on-time': 'à temps',
		early: 'devant',
		late: 'derrière',
		missed: 'oubliée',
		extra: 'en trop'
	},
	term: {
		hold: 'tenue',
		placement: 'placement',
		precision: 'précision',
		regularity: 'régularité',
		fidelity: 'fidélité à la figure'
	},
	words: {
		hold: (offsetMs: number | null, drift: DriftWords) => {
			const parts = [
				offsetMs === null
					? null
					: `passes ${offsetMs < 0 ? 'devant' : 'derrière'} (${signedMs(offsetMs)})`,
				drift === 'rush' ? 'accélères' : drift === 'drag' ? 'ralentis' : null
			].filter((part) => part !== null);
			return `Sans clic, tu ${parts.join(' et tu ')}`;
		},
		lost: (bar: number) => `Temps perdu mesure ${bar}`,
		added: (bar: number) => `Temps ajouté mesure ${bar}`,
		forgotten: (n: number) => (n === 1 ? '1 note oubliée' : `${n} notes oubliées`),
		extra: (n: number) => (n === 1 ? '1 note en trop' : `${n} notes en trop`),
		uneven: (ms: number) => `Irrégulier (± ${ms} ms)`,
		placement: (offsetMs: number) =>
			`Tu joues ${offsetMs < 0 ? 'devant' : 'derrière'} le temps (${signedMs(offsetMs)})`,
		precision: (ms: number) => `À ${ms} ms du temps en moyenne`,
		inPlace: 'En place'
	}
};

const EN: typeof FR = {
	header: (label, level, tempo) => `${label} · ${level} · ${tempo}`,
	level: (shown, of) => `level ${shown} of ${of}`,
	aidLevel: 'aid level',
	tempo: (unit, bpm) => `${unit} = ${bpm} bpm`,
	bar: (bar, of) => `bar ${bar} / ${of}`,
	click: 'click',
	silence: 'silence',
	phase: {
		'listen-in': 'Listen to the click',
		'count-in': 'Counting in',
		play: '',
		listening: 'Listening to the figure',
		breath: 'Breathe'
	},
	listen: 'Listen to the figure',
	notationFailed: 'The score could not load: reload the page.',
	played: 'Played',
	toPlay: 'To play',
	cycle: (n) => `cycle ${n}`,
	passed: 'passed',
	failed: 'failed',
	announcement: {
		'level-up': (level) => `Up: ${level}`,
		'level-down': (level) => `Down: ${level}`,
		'aid-level': (level) => `Aid level: ${level}`,
		'listen-remedy': () => 'Let’s hear the figure again',
		'play-along': () => 'Let’s play it together',
		'change-of-air': () => 'Time for a change of air'
	},
	mark: {
		'on-time': 'on time',
		early: 'ahead',
		late: 'behind',
		missed: 'missed',
		extra: 'extra'
	},
	term: {
		hold: 'hold',
		placement: 'placement',
		precision: 'precision',
		regularity: 'regularity',
		fidelity: 'faithfulness to the figure'
	},
	words: {
		hold: (offsetMs, drift) => {
			const parts = [
				offsetMs === null
					? null
					: `${offsetMs < 0 ? 'get ahead' : 'fall behind'} (${signedMs(offsetMs)})`,
				drift === 'rush' ? 'speed up' : drift === 'drag' ? 'slow down' : null
			].filter((part) => part !== null);
			return `Without the click, you ${parts.join(' and ')}`;
		},
		lost: (bar) => `Beat lost in bar ${bar}`,
		added: (bar) => `Beat added in bar ${bar}`,
		forgotten: (n) => (n === 1 ? '1 note missed' : `${n} notes missed`),
		extra: (n) => (n === 1 ? '1 extra note' : `${n} extra notes`),
		uneven: (ms) => `Uneven (± ${ms} ms)`,
		placement: (offsetMs) =>
			`You play ${offsetMs < 0 ? 'ahead of' : 'behind'} the beat (${signedMs(offsetMs)})`,
		precision: (ms) => `${ms} ms from the beat on average`,
		inPlace: 'In time'
	}
};

/** The rhythm view's copy, by locale: the pure module reads it for a given locale. */
export const RHYTHM_MESSAGES: Record<Locale, typeof FR> = { fr: FR, en: EN };

export const rhythmMessages = defineMessages(RHYTHM_MESSAGES);
