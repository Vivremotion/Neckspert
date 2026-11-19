import {
	CHORD_GRID_CONTENT,
	CHORD_VOICING_CONTENT,
	NAME_CONTENT,
	NOTE_CONTENT,
	PITCH_CONTENT
} from '../judges';
import type { FigureItem } from '../sets/figure';
import { shapeNamed, type FormFigureItem } from '../sets/placedShape';
import type { VoicingFigureItem } from '../sets/placedVoicing';
import { rootPosition } from '../sets/voicingOnStrings';
import { parseVoicingKey } from '../music';
import { movedShape } from '../music/formNotes';
import { voicingNotes } from '../music/voicingNotes';
import { parseNoteName } from '../time/noteName';
import type { ExerciseDefinition } from '../exercise/types';

/**
 * What an exercise's round template can ask of an item, by name: the content a round expects of
 * it, and the numbers measured on it. This is vocabulary: it names the sets whose items it
 * reads; the compiler only looks names up here.
 */

export interface ContentDerivation {
	/** The kind of content it gives (the content judge that judges it). */
	kind: string;
	/** The sets whose items it reads. */
	reads: readonly string[];
	/**
	 * Set when `derive` gives a list: one content per element, which a figure's entry spreads over
	 * its notes.
	 */
	list?: true;
	/** `definition`: the item's exercise, which holds what an item only names (its shapes). */
	derive(item: unknown, definition: ExerciseDefinition): unknown;
}

export interface ItemNumber {
	reads: readonly string[];
	measure(item: unknown): number;
}

interface Voiced {
	voicingKey: string;
	position?: number | 'open';
}

export const CONTENT_DERIVATIONS: Readonly<Record<string, ContentDerivation>> = {
	'note-of-item': { kind: NOTE_CONTENT, reads: ['note-on-string'], derive: (item) => item },
	'name-of-item': { kind: NAME_CONTENT, reads: ['placed-note'], derive: (item) => item },
	'voicing-root': {
		kind: NOTE_CONTENT,
		reads: ['voicing-on-strings'],
		derive: (item) => rootPosition(parseVoicingKey((item as Voiced).voicingKey))
	},
	'voicing-anywhere': {
		kind: CHORD_VOICING_CONTENT,
		reads: ['voicing-on-strings'],
		derive: (item) => ({ voicingKey: (item as Voiced).voicingKey, position: null })
	},
	'voicing-at-position': {
		kind: CHORD_VOICING_CONTENT,
		reads: ['voicing-on-strings'],
		// An item without a position asks the voicing at any of its places, as `voicing-anywhere`.
		derive: (item) => {
			const { voicingKey, position } = item as Voiced;
			return { voicingKey, position: position ?? null };
		}
	},
	'grid-change': { kind: CHORD_GRID_CONTENT, reads: ['change'], derive: (item) => item },
	'voicing-notes': {
		kind: PITCH_CONTENT,
		reads: ['placed-voicing'],
		list: true,
		derive: (item) => {
			const { voicing, frets } = item as VoicingFigureItem;
			return voicingNotes(parseVoicingKey(voicing), frets).map(({ midi, string }) => ({
				midi,
				string
			}));
		}
	},
	'shape-notes': {
		kind: PITCH_CONTENT,
		reads: ['placed-shape'],
		list: true,
		derive: (item, definition) => {
			const { shape, first } = item as FormFigureItem;
			const { notes } = shapeNamed(definition.shapes, shape);
			return movedShape(notes, parseNoteName(first)).map(({ midi, string, name }) => ({
				midi,
				string,
				name
			}));
		}
	}
};

export const ITEM_NUMBERS: Readonly<Record<string, ItemNumber>> = {
	beats: {
		reads: ['placed-voicing', 'placed-shape'],
		measure: (item) => {
			const { beats } = item as VoicingFigureItem | FormFigureItem;
			if (beats === undefined) throw new Error('This item has no length in beats');
			return beats;
		}
	},
	'change-beats': {
		reads: ['change'],
		measure: (item) => {
			const { changes, index } = item as {
				changes: readonly { length: number }[];
				index: number;
			};
			return changes[index].length;
		}
	}
};

export interface ItemFigure {
	/** The sets whose items it reads. */
	reads: readonly string[];
	/** The id of the figure the item names, among its exercise's `figures`. */
	figureOf(item: unknown): string;
	/** The item that names figure `figureId`, played at exercise level `exerciseLevel`. */
	itemOf(figureId: string, exerciseLevel: number): unknown;
}

/** The figures a template reads on an item (`{ item: <name> }` in a figure entry), by name. */
export const ITEM_FIGURES: Readonly<Record<string, ItemFigure>> = {
	figure: {
		reads: ['figure'],
		figureOf: (item) => (item as FigureItem).figureId,
		itemOf: (figureId, exerciseLevel): FigureItem => ({ figureId, level: exerciseLevel })
	}
};
