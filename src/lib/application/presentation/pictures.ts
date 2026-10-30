import type { MechanicId } from '$lib/domain/exercise/types';
import type { TriadZoneItem, VoicingFigureItem } from '$lib/domain/mechanics';
import { openPitch, parseVoicingKey, type LocateItem } from '$lib/domain/music';
import { voicingNotes } from '$lib/domain/music/voicingNotes';
import type { StringNumber } from '$lib/domain/music/types';
import { lowestShape, shapeAt, shapeOf } from './triadWords';

/** What a prompt can draw: a string with its open note, or the notes of a chord shape. */
export type Picture =
	| { kind: 'string'; string: StringNumber; label: string }
	| { kind: 'shape'; notes: { string: StringNumber; fret: number }[] };

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
