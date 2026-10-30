import {
	CHORD_GRID_CONTENT,
	CHORD_VOICING_CONTENT,
	NAME_CONTENT,
	NOTE_CONTENT,
	PITCH_CONTENT
} from '../judges';
import type { FigureItem } from '../mechanics/figure';
import { formNamed, type FormFigureItem } from '../mechanics/formFigure';
import type { VoicingFigureItem } from '../mechanics/voicingFigure';
import { rootPosition } from '../mechanics/triadAnchor';
import { parseVoicingKey } from '../music';
import { movedForm } from '../music/formNotes';
import { voicingNotes } from '../music/voicingNotes';
import { parseNoteName } from '../time/noteName';
import type { ExerciseDefinition, MechanicId } from '../exercise/types';

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
	/**
	 * Set when `derive` gives a list: one content per element, which a figure's entry spreads over
	 * its notes.
	 */
	list?: true;
	/** `definition`: the item's exercise, which holds what an item only names (its forms). */
	derive(item: unknown, definition: ExerciseDefinition): unknown;
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
	'grid-change': { kind: CHORD_GRID_CONTENT, reads: ['chord-grid'], derive: (item) => item },
	'voicing-notes': {
		kind: PITCH_CONTENT,
		reads: ['voicing-figure'],
		list: true,
		derive: (item) => {
			const { voicing, occurrence } = item as VoicingFigureItem;
			return voicingNotes(parseVoicingKey(voicing), occurrence).map(({ midi, string }) => ({
				midi,
				string
			}));
		}
	},
	'form-notes': {
		kind: PITCH_CONTENT,
		reads: ['form-figure'],
		list: true,
		derive: (item, definition) => {
			const { form, first } = item as FormFigureItem;
			const { notes } = formNamed(definition.forms, form);
			return movedForm(notes, parseNoteName(first).midi).map(({ midi, string }) => ({
				midi,
				string
			}));
		}
	}
};

export const ITEM_NUMBERS: Readonly<Record<string, ItemNumber>> = {
	beats: {
		reads: ['voicing-figure', 'form-figure'],
		measure: (item) => {
			const { beats } = item as VoicingFigureItem | FormFigureItem;
			if (beats === undefined) throw new Error('This item has no length in beats');
			return beats;
		}
	},
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

export interface ItemFigure {
	/** The mechanics whose items it reads. */
	reads: readonly MechanicId[];
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
