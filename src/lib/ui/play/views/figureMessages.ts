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

/** A wrong note at its place: its bar and beat from 1, and what tells it (null: not known). */
export interface WrongPlace {
	bar: number;
	beat: number;
	gap: string | null;
}

/** « 3, 6 et 9 »; « 3, 6, 9, 12… » when more follow. */
function barList(bars: readonly number[], more: boolean, and: string): string {
	if (more) return `${bars.join(', ')}…`;
	if (bars.length <= 1) return bars.join('');
	return `${bars.slice(0, -1).join(', ')} ${and} ${bars[bars.length - 1]}`;
}

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
	mark: {
		'on-time': 'à temps',
		early: 'devant',
		late: 'derrière',
		missed: 'oubliée',
		extra: 'en trop',
		'wrong-pitch': 'fausse'
	},
	expected: 'Forme attendue',
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
		wrongNotes: (n: number) => (n === 1 ? '1 fausse note' : `${n} fausses notes`),
		wrongAt: (places: readonly WrongPlace[]) =>
			places
				.map(
					({ bar, beat, gap }, i) =>
						`${i === 0 ? 'Mesure' : 'mesure'} ${bar}, temps ${beat} : ${gap ?? 'fausse note'}`
				)
				.join(' ; '),
		wrongInBars: (n: number, bars: readonly number[], more: boolean) =>
			`${n} fausses notes, ${bars.length === 1 && !more ? 'mesure' : 'mesures'} ${barList(bars, more, 'et')}`,
		uneven: (ms: number) => `Irrégulier (± ${ms} ms)`,
		placement: (offsetMs: number) =>
			`Tu joues ${offsetMs < 0 ? 'devant' : 'derrière'} le temps (${signedMs(offsetMs)})`,
		precision: (ms: number) => `À ${ms} ms du temps en moyenne`,
		inPlace: 'En place',
		perBar: 'ms/mesure'
	},
	/** Once the plain words have faded: the term and its number. */
	brief: {
		lost: (bar: number) => `temps perdu, mesure ${bar}`,
		added: (bar: number) => `temps ajouté, mesure ${bar}`
	},
	/** Written above the bar where a beat was lost or added. */
	shift: { lost: 'temps perdu', added: 'temps ajouté' }
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
	mark: {
		'on-time': 'on time',
		early: 'ahead',
		late: 'behind',
		missed: 'missed',
		extra: 'extra',
		'wrong-pitch': 'wrong'
	},
	expected: 'Expected shape',
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
		wrongNotes: (n) => (n === 1 ? '1 wrong note' : `${n} wrong notes`),
		wrongAt: (places) =>
			places
				.map(
					({ bar, beat, gap }, i) =>
						`${i === 0 ? 'Bar' : 'bar'} ${bar}, beat ${beat}: ${gap ?? 'wrong note'}`
				)
				.join('; '),
		wrongInBars: (n, bars, more) =>
			`${n} wrong notes, ${bars.length === 1 && !more ? 'bar' : 'bars'} ${barList(bars, more, 'and')}`,
		uneven: (ms) => `Uneven (± ${ms} ms)`,
		placement: (offsetMs) =>
			`You play ${offsetMs < 0 ? 'ahead of' : 'behind'} the beat (${signedMs(offsetMs)})`,
		precision: (ms) => `${ms} ms from the beat on average`,
		inPlace: 'In time',
		perBar: 'ms/bar'
	},
	brief: {
		lost: (bar) => `beat lost, bar ${bar}`,
		added: (bar) => `beat added, bar ${bar}`
	},
	shift: { lost: 'beat lost', added: 'beat added' }
};

/** The figure view's copy, by locale: the pure module reads it for a given locale. */
export const FIGURE_MESSAGES: Record<Locale, typeof FR> = { fr: FR, en: EN };

export const figureMessages = defineMessages(FIGURE_MESSAGES);
