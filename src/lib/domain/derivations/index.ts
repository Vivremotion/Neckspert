import { NAME_CONTENT, PITCH_CONTENT } from '../judges';
import { gridById, gridChanges } from '../grid';
import type { ChangeItem } from '../sets/change';
import type { FigureItem } from '../sets/figure';
import { shapeNamed, type FormFigureItem } from '../sets/placedShape';
import type { VoicingFigureItem } from '../sets/placedVoicing';
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

export const CONTENT_DERIVATIONS: Readonly<Record<string, ContentDerivation>> = {
	'name-of-item': { kind: NAME_CONTENT, reads: ['placed-note'], derive: (item) => item },
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
	/** The beats a change of a grid lasts, until the next. Throws on a grid or rank it cannot find. */
	'change-beats': {
		reads: ['change'],
		measure: (item) => {
			const { grid, index } = item as ChangeItem;
			const change = gridChanges(gridById(grid))[index];
			if (!change) throw new Error(`grid "${grid}" has no change at rank ${index}`);
			return change.length;
		}
	}
};

/** A value a selection's filter reads on an item (`{ item: <name> }`). */
export interface ItemValue {
	/** The sets whose items it reads. */
	reads: readonly string[];
	/** Its shape: one number, or a list of them. */
	kind: 'number' | 'numbers';
	/** Undefined when the item carries none: the filter is then left out. */
	valueOf(item: unknown): number | readonly number[] | undefined;
}

/** The values a filter reads on an item, by name. */
export const ITEM_VALUES: Readonly<Record<string, ItemValue>> = {
	/**
	 * The fret the prompt names; when it names none, the place of the shape asked: 0 for a shape on
	 * open strings, else its position (attempts stored before the cue fret named the position).
	 * Absent only for an item without a position: the filter is then left out, and the voicing is
	 * asked at any of its places.
	 */
	fret: {
		reads: ['voicing-on-strings'],
		kind: 'number',
		valueOf: (item) => {
			const { fret, position } = item as { fret?: number; position?: number | 'open' };
			if (fret !== undefined) return fret;
			return position === 'open' ? 0 : position;
		}
	},
	string: {
		reads: ['note-on-string'],
		kind: 'number',
		valueOf: (item) => (item as { string: number }).string
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
