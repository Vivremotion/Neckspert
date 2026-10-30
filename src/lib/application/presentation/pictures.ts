import type { MechanicId } from '$lib/domain/exercise/types';
import type { TriadZoneItem, VoicingFigureItem } from '$lib/domain/mechanics';
import { openPitch, parseVoicingKey, type LocateItem } from '$lib/domain/music';
import { fretOf } from '$lib/domain/music/fretboard';
import { voicingNotes } from '$lib/domain/music/voicingNotes';
import { pitchOfMidi, type StringNumber } from '$lib/domain/music/types';
import { lowestShape, shapeAt, shapeOf } from './triadWords';

/**
 * What a prompt can draw: a string with its open note, the notes of a chord shape, or notes named
 * on the neck, several on a string if need be.
 */
export type Picture =
	| { kind: 'string'; string: StringNumber; label: string }
	| { kind: 'shape'; notes: { string: StringNumber; fret: number }[] }
	| { kind: 'neck'; notes: NeckNote[]; frets?: { low: number; high: number } };

/** A note named at its place on the neck. */
export interface NeckNote {
	string: StringNumber;
	fret: number;
	name: string;
	/** A note of what comes next, not of what plays now. */
	next?: true;
}

/**
 * The picture of a list of derived notes (`{ midi, string, name? }`): each at its fret, named as
 * its derivation spells it, else by its sharp spelling. What gives no place on the neck is left out.
 */
export function neckPicture(contents: readonly unknown[]): Picture {
	const notes = contents.flatMap((content): NeckNote[] => {
		const { midi, string, name } = content as { midi: number; string: StringNumber; name?: string };
		const place = fretOf(midi, string);
		return 'problem' in place
			? []
			: [{ string, fret: place.fret, name: name ?? pitchOfMidi(midi) }];
	});
	return { kind: 'neck', notes };
}

/**
 * The neck of what plays now, the notes of what comes next added once `due`. The frets span both
 * from the start, so the notes do not move when those of what comes next appear. A place both play
 * shows the note played now.
 */
export function neckWithNext(
	now: Picture & { kind: 'neck' },
	next: Picture & { kind: 'neck' },
	due: boolean
): Picture {
	const frets = [...now.notes, ...next.notes].map((note) => note.fret);
	const taken = new Set(now.notes.map((note) => `${note.string}-${note.fret}`));
	return {
		kind: 'neck',
		frets: { low: Math.min(...frets), high: Math.max(...frets) },
		notes: [
			...now.notes,
			...(due
				? next.notes
						.filter((note) => !taken.has(`${note.string}-${note.fret}`))
						.map((note) => ({ ...note, next: true as const }))
				: [])
		]
	};
}

export interface PictureKind {
	/** The mechanics whose items it draws. */
	reads: readonly MechanicId[];
	/** The picture of one item, null when it has nothing to draw. */
	draw(item: unknown): Picture | null;
}

const TRIADS: readonly MechanicId[] = ['triad-anchor', 'triad-zone'];

/** The pictures an exercise can name, by name. */
export const PICTURES: Readonly<Record<string, PictureKind>> = {
	/** The string of the item and its open note. */
	string: {
		reads: ['locate'],
		draw: (item) => {
			const { string } = item as LocateItem;
			return { kind: 'string', string, label: openPitch(string) };
		}
	},
	/** The lowest fretted shape of the item's voicing. */
	'lowest-shape': {
		reads: TRIADS,
		draw: (item) => ({
			kind: 'shape',
			...shapeOf(lowestShape(parseVoicingKey((item as TriadZoneItem).voicingKey)))
		})
	},
	/** The shape of the item's voicing at its position, the lowest when it has none. */
	'shape-at-position': {
		reads: TRIADS,
		draw: (raw) => {
			const item = raw as TriadZoneItem;
			const voicing = parseVoicingKey(item.voicingKey);
			const shape =
				item.position === undefined ? lowestShape(voicing) : shapeAt(voicing, item.position);
			return { kind: 'shape', ...shapeOf(shape) };
		}
	},
	/** The shape of the item's voicing at its occurrence on the neck. */
	shape: {
		reads: ['voicing-figure'],
		draw: (raw) => {
			const { voicing, occurrence } = raw as VoicingFigureItem;
			const notes = voicingNotes(parseVoicingKey(voicing), occurrence);
			return { kind: 'shape', notes: notes.map(({ string, fret }) => ({ string, fret })) };
		}
	}
};

/**
 * The picture of where a derived list of notes comes from, by derivation (`CONTENT_DERIVATIONS`):
 * after a failed round that plays it, the screen shows what was asked (the expected shape).
 */
export const DERIVED_PICTURES: Readonly<Record<string, string>> = {
	'voicing-notes': 'shape'
};
