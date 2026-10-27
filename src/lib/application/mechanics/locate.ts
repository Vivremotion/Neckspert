import { DEFAULT_PREVIEW_BEATS } from '$lib/domain/exercise/pacing';
import {
	describeAcceptable,
	describeFrequency,
	detuneCents,
	nearestAcceptable,
	noteWithOctave,
	signedCents
} from '$lib/debug/detectionLog';
import { locateRules } from '$lib/domain/mechanics';
import { acceptableMidis, stringLabel, type LocateItem } from '$lib/domain/music';
import type { Midi } from '$lib/domain/music/types';
import type { LocateData } from '$lib/domain/mechanics';
import type { NotePayload } from '$lib/application/session/sensors';
import type { MechanicPresenter } from './types';

/** Within this many cents of an accepted note, the detection log calls a note close. */
const CLOSE_CENTS = 15;

/** Play the note on the guitar: the lane, the clicks, the note sensor. */
export const locatePresenter: MechanicPresenter<LocateItem, { midi: Midi }> = {
	rules: locateRules,
	scene: 'guitar',
	sensors: ['note'],
	previewBeats: DEFAULT_PREVIEW_BEATS,
	attemptData: (item, value): LocateData => {
		const [asked] = value.expectations;
		return {
			item,
			answer: (asked?.answer as LocateData['answer'] | undefined) ?? null,
			confusion: (asked?.confusion as LocateData['confusion'] | undefined) ?? null
		};
	},
	debugLines: (item, payload) => {
		const onset = payload as NotePayload;
		const acceptable = acceptableMidis(item);
		const lines = [
			`cible : ${item.pitch} · ${stringLabel(item.string, 'fr')}`,
			`fréquences acceptées : ${describeAcceptable(acceptable)}`,
			`reçu : ${describeFrequency(onset.frequencyHz)}, MIDI retenu ${onset.midi} (${noteWithOctave(onset.midi)}), clarté ${onset.clarity.toFixed(2)}`
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
