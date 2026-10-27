import { CHORD_GRID_CONTENT, CHORD_VOICING_CONTENT, NAME_CONTENT, NOTE_CONTENT } from '../judges';
import { rootPosition } from '../mechanics/triadAnchor';
import { parseVoicingKey } from '../music';
import type { MechanicId } from '../exercise/types';

/**
 * What an exercise's round template can ask of an item, by name: the content a round expects of
 * it, and the numbers measured on it. This is vocabulary: it names the mechanics whose items it
 * reads; the compiler only looks names up here.
 */

export interface ContentDerivation {
	/** The kind of content it gives (the content judge that judges it). */
	kind: string;
	/** The mechanics whose items it reads. */
	reads: readonly MechanicId[];
	derive(item: unknown): unknown;
}

export interface ItemNumber {
	reads: readonly MechanicId[];
	measure(item: unknown): number;
}

interface Voiced {
	voicingKey: string;
	position?: number | 'open';
}

export const CONTENT_DERIVATIONS: Readonly<Record<string, ContentDerivation>> = {
	'note-of-item': { kind: NOTE_CONTENT, reads: ['locate'], derive: (item) => item },
	'name-of-item': { kind: NAME_CONTENT, reads: ['identify'], derive: (item) => item },
	'voicing-root': {
		kind: NOTE_CONTENT,
		reads: ['triad-anchor', 'triad-zone'],
		derive: (item) => rootPosition(parseVoicingKey((item as Voiced).voicingKey))
	},
	'voicing-anywhere': {
		kind: CHORD_VOICING_CONTENT,
		reads: ['triad-anchor', 'triad-zone'],
		derive: (item) => ({ voicingKey: (item as Voiced).voicingKey, position: null })
	},
	'voicing-at-position': {
		kind: CHORD_VOICING_CONTENT,
		reads: ['triad-zone'],
		derive: (item) => {
			const { voicingKey, position } = item as Required<Voiced>;
			return { voicingKey, position };
		}
	},
	'grid-change': { kind: CHORD_GRID_CONTENT, reads: ['chord-grid'], derive: (item) => item }
};

export const ITEM_NUMBERS: Readonly<Record<string, ItemNumber>> = {
	'change-beats': {
		reads: ['chord-grid'],
		measure: (item) => {
			const { changes, index } = item as {
				changes: readonly { length: number }[];
				index: number;
			};
			return changes[index].length;
		}
	}
};
