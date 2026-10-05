import {
	describeAcceptable,
	describeFrequency,
	detuneCents,
	nearestAcceptable,
	noteWithOctave,
	signedCents
} from '$lib/debug/detectionLog';
import { locateRules } from '$lib/domain/mechanics';
import {
	acceptableMidis,
	formatNote,
	fretLabel,
	fretsForPitch,
	openPitch,
	spellPitch,
	stringLabel,
	type LocateItem
} from '$lib/domain/music';
import { MAX_PROMPT_FRET, type Midi } from '$lib/domain/music/types';
import type { NoteOnset } from '$lib/application/ports';
import type { MechanicPresenter } from './types';

/** Highest fret shown in a correction: fret 12 stands for the open string, which is never prompted. */
const CORRECTION_MAX_FRET = 12;

/** Within this many cents of an accepted note, the detection log calls a note close. */
const CLOSE_CENTS = 15;

/** Play the note on the guitar: the lane, the clicks, the note sensor. */
export const locatePresenter: MechanicPresenter<LocateItem, { midi: Midi }> = {
	rules: locateRules,
	scene: 'guitar',
	sensor: 'note',
	prompt: (item, { aid, stringAid }, locale, random) => {
		const frets = fretsForPitch(item.string, item.pitch, MAX_PROMPT_FRET);
		return {
			primary: formatNote(spellPitch(item.pitch, random)),
			secondary: stringLabel(item.string, locale),
			aid: aid === 'show-position' && frets.length > 0 ? fretLabel(frets[0], locale) : null,
			diagram: stringAid ? { string: item.string, label: openPitch(item.string) } : null
		};
	},
	// A right note is the target; the label spells the target, as the prompt does.
	answerLabel: (_answer, item, _locale, random) => formatNote(spellPitch(item.pitch, random)),
	/** After a miss: the position ("corde de E grave, case 5"). Off beat is a right note: nothing. */
	reveal: (item, { verdict }, locale) => {
		if (verdict !== 'wrong') return null;
		const fret = fretsForPitch(item.string, item.pitch, CORRECTION_MAX_FRET).find((f) => f > 0);
		return `${stringLabel(item.string, locale)}, ${fretLabel(fret ?? CORRECTION_MAX_FRET, locale)}`;
	},
	debugLines: (item, payload) => {
		const onset = payload as NoteOnset;
		const acceptable = acceptableMidis(item);
		const lines = [
			`cible : ${item.pitch} · ${stringLabel(item.string, 'fr')}`,
			`fréquences acceptées : ${describeAcceptable(acceptable)}`,
			`reçu : ${describeFrequency(onset.frequencyHz)}, MIDI retenu ${onset.midi} (${noteWithOctave(onset.midi)}), clarté ${onset.clarity.toFixed(2)}, t brut = ${onset.time.toFixed(3)} s`
		];
		const nearest = nearestAcceptable(onset.frequencyHz, acceptable);
		if (nearest) {
			const way =
				nearest.cents > CLOSE_CENTS
					? 'trop aigu'
					: nearest.cents < -CLOSE_CENTS
						? 'trop grave'
						: 'proche';
			lines.push(
				`écart au plus proche accepté (${noteWithOctave(nearest.midi)}) : ${signedCents(nearest.cents)} (${way})`
			);
			for (const midi of acceptable) {
				if (midi === nearest.midi) continue;
				lines.push(
					`écart à ${noteWithOctave(midi)} : ${signedCents(detuneCents(onset.frequencyHz, midi))}`
				);
			}
		}
		if (!acceptable.includes(onset.midi)) {
			lines.push(`MIDI ${onset.midi} n’est pas dans [${acceptable.join(', ')}]`);
		}
		return lines;
	}
};
