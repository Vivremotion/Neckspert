import { describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import {
	fretLabel,
	openPitch,
	stringLabel,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music';
import type { Locale, PlannedItem } from '$lib/domain/types';
import { nameAtFret, noteName, promptFretLabel } from './noteWords';
import { presentPrompt } from './presentPrompt';
import { presentationProblem } from './validate';
import {
	GESTURE_CLIMB,
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE
} from '$lib/testing/catalog';

/**
 * The locate prompt as its presenter wrote it before its presentation became data (H5): at the
 * first level of its ladder, the fret under the note and its string drawn.
 */
function locateToday(item: LocateItem, firstLevel: boolean, locale: Locale, random: () => number) {
	return {
		primary: noteName(item.pitch, random),
		secondary: stringLabel(item.string, locale),
		detail: firstLevel ? promptFretLabel(item, locale) : null,
		diagram: firstLevel ? { string: item.string, label: openPitch(item.string) } : null
	};
}

/** The identify prompt as its presenter wrote it before H5: at the first level, the name under it. */
function identifyToday(
	item: IdentifyItem,
	firstLevel: boolean,
	locale: Locale,
	random: () => number
) {
	return {
		primary: fretLabel(item.fret, locale),
		secondary: stringLabel(item.string, locale),
		detail: firstLevel ? nameAtFret(item, random) : null
	};
}

const D_ON_B = 'D|maj|3:5,2:1,1:3';
const EBM_ON_B = 'D#|min|3:5,2:1,1:b3';

function planned(
	definition: ExerciseDefinition,
	item: unknown,
	over: Partial<PlannedItem> = {}
): PlannedItem {
	return {
		exerciseId: definition.id,
		skill: definition.practices,
		exerciseLevel: 0,
		item,
		phase: 'review',
		temperature: 'cold',
		leadBeats: 2,
		...over
	};
}

describe('presentPrompt', () => {
	it('writes the locate prompt as before: the note, its string; at the first level of its ladder the fret under it and its string drawn, above it neither', () => {
		const items = [
			{ string: 2, pitch: 'F' },
			{ string: 6, pitch: 'A#' },
			{ string: 1, pitch: 'G#' }
		] as const;
		for (const item of items) {
			for (const level of [0, 1, 2]) {
				for (const locale of ['fr', 'en'] as const) {
					for (const value of [0, 0.9]) {
						const random = () => value;
						const today = locateToday(item, level === 0, locale, random);
						const shown = presentPrompt(
							LOCATE_NECK,
							planned(LOCATE_NECK, item, { level }),
							locale,
							random
						);
						expect(shown.primary).toBe(today.primary);
						expect(shown.secondary).toBe(today.secondary);
						expect(shown.detail).toBe(today.detail);
						expect(shown.pictures).toEqual(
							today.diagram ? [{ kind: 'string', ...today.diagram }] : []
						);
					}
				}
			}
		}
	});

	it('shows the string alone while the item waits for its prompt', () => {
		const shown = presentPrompt(
			LOCATE_NECK,
			planned(LOCATE_NECK, { string: 2, pitch: 'F' }),
			'fr',
			() => 0
		);
		expect(shown.preview).toBe('corde de B');
		expect(shown.target).toBeNull();
		expect(shown.band).toBeNull();
	});

	it('writes the identify prompt as before: the fret, the string, the name under it at the first level of its ladder', () => {
		const item = { string: 3, fret: 8 } as const;
		for (const level of [0, 1]) {
			const today = identifyToday(item, level === 0, 'en', () => 0.1);
			const shown = presentPrompt(
				IDENTIFY_NECK,
				planned(IDENTIFY_NECK, item, { level }),
				'en',
				() => 0.1
			);
			expect(shown.primary).toBe(today.primary);
			expect(shown.secondary).toBe(today.secondary);
			expect(shown.detail).toBe(today.detail);
			expect(shown.pictures).toEqual([]);
		}
	});

	it('writes the anchor prompt: the chord, its root string, its strings, the root on the target, the chord on the band', () => {
		const shown = presentPrompt(
			TRIADS_ANCHOR,
			planned(TRIADS_ANCHOR, { voicingKey: EBM_ON_B }, { level: 1 }),
			'fr',
			() => 0
		);
		expect(shown).toMatchObject({
			primary: 'Ebm',
			secondary: 'fondamentale sur si',
			detail: 'sol‑si‑mi',
			target: 'Eb',
			band: 'Ebm',
			pictures: []
		});
		expect(
			presentPrompt(TRIADS_ANCHOR, planned(TRIADS_ANCHOR, { voicingKey: D_ON_B }), 'en', () => 0)
		).toMatchObject({ secondary: 'root on B', detail: 'G‑B‑E', target: 'D' });
	});

	it('draws the lowest shape of an anchor at the first level of its ladder, nothing above it', () => {
		const item = { voicingKey: D_ON_B };
		const drawn = (level: number) =>
			presentPrompt(TRIADS_ANCHOR, planned(TRIADS_ANCHOR, item, { level }), 'fr', () => 0).pictures;
		expect(drawn(0)).toEqual([
			{
				kind: 'shape',
				notes: [
					{ string: 3, fret: 2 },
					{ string: 2, fret: 3 },
					{ string: 1, fret: 2 }
				]
			}
		]);
		expect(drawn(1)).toEqual([]);
		expect(drawn(2)).toEqual([]);
	});

	it('writes the zone prompt: the chord, around its fret, its strings and the root string at the first level of its ladder', () => {
		const item = { voicingKey: D_ON_B, position: 14, fret: 15 };
		expect(
			presentPrompt(TRIADS_ZONE, planned(TRIADS_ZONE, item, { level: 1 }), 'fr', () => 0)
		).toMatchObject({
			primary: 'D',
			secondary: 'vers la case 15',
			detail: 'sol‑si‑mi'
		});
		expect(
			presentPrompt(TRIADS_ZONE, planned(TRIADS_ZONE, item, { level: 0 }), 'en', () => 0)
		).toMatchObject({ secondary: 'around fret 15', detail: 'G‑B‑E · root on B' });
		expect(
			presentPrompt(
				TRIADS_ZONE,
				planned(TRIADS_ZONE, { voicingKey: D_ON_B, position: 'open' }),
				'fr',
				() => 0
			).secondary
		).toBe('à vide');
	});

	it('writes a slot per language', () => {
		const definition: ExerciseDefinition = {
			...LOCATE_NECK,
			presentation: {
				primary: { fr: 'Joue {note}', en: 'Play {note}' },
				secondary: '{string} — {string}'
			}
		};
		const item = planned(definition, { string: 2, pitch: 'F' });
		expect(presentPrompt(definition, item, 'fr', () => 0)).toMatchObject({
			primary: 'Joue F',
			secondary: 'corde de B — corde de B'
		});
		expect(presentPrompt(definition, item, 'en', () => 0).primary).toBe('Play F');
	});

	describe('at a level that rewrites the prompt', () => {
		const item = { string: 2, pitch: 'F' };
		const BASE = { primary: '{note}', secondary: '{string}' };
		const REWRITES = { 'presentation.detail': '{fret}', 'presentation.picture': 'string' };
		const STRING_B = { kind: 'string', string: 2, label: 'B' };
		const atLevel = (definition: ExerciseDefinition, exerciseLevel: number) =>
			presentPrompt(definition, planned(definition, item, { exerciseLevel }), 'fr', () => 0);

		it('shows the detail and the picture at the first level that writes them, not at the next', () => {
			const definition: ExerciseDefinition = {
				...LOCATE_NECK,
				presentation: BASE,
				levels: [{ params: REWRITES }, { params: {} }]
			};
			expect(atLevel(definition, 0)).toMatchObject({
				primary: 'F',
				detail: 'case 6',
				pictures: [STRING_B]
			});
			expect(atLevel(definition, 1)).toMatchObject({ primary: 'F', detail: null, pictures: [] });
		});

		it('shows them at the top of three levels only, the level that writes them', () => {
			const definition: ExerciseDefinition = {
				...LOCATE_NECK,
				presentation: BASE,
				levels: [{ params: {} }, { params: {} }, { params: REWRITES }]
			};
			expect([0, 1, 2].map((level) => atLevel(definition, level).detail)).toEqual([
				null,
				null,
				'case 6'
			]);
			expect([0, 1, 2].map((level) => atLevel(definition, level).pictures)).toEqual([
				[],
				[],
				[STRING_B]
			]);
		});

		it('reads an item level of its ladder after its exercise level', () => {
			const definition: ExerciseDefinition = {
				...LOCATE_NECK,
				presentation: BASE,
				params: {
					...LOCATE_NECK.params,
					ladder: [
						{ params: { leadBeats: 4 } },
						{ params: { leadBeats: 2, 'presentation.detail': '{fret}' } }
					]
				}
			};
			const at = (level: number) =>
				presentPrompt(definition, planned(definition, item, { level }), 'fr', () => 0).detail;
			expect([at(0), at(1)]).toEqual([null, 'case 6']);
		});

		it('draws the picture its base presentation names at every level but the one that rewrites it', () => {
			const voicing = { voicingKey: D_ON_B, position: 14, fret: 15 };
			const definition: ExerciseDefinition = {
				...TRIADS_ZONE,
				presentation: { primary: '{chord}', picture: 'lowest-shape' },
				levels: [
					{ params: {} },
					{ params: { 'presentation.picture': 'shape-at-position' } },
					{ params: {} }
				]
			};
			const drawn = (exerciseLevel: number) =>
				presentPrompt(definition, planned(definition, voicing, { exerciseLevel }), 'fr', () => 0)
					.pictures;
			const lowest = drawn(0);
			expect(lowest).toEqual([
				{
					kind: 'shape',
					notes: [
						{ string: 3, fret: 2 },
						{ string: 2, fret: 3 },
						{ string: 1, fret: 2 }
					]
				}
			]);
			expect(drawn(2)).toEqual(lowest);
			expect(drawn(1)).toHaveLength(1);
			expect(drawn(1)).not.toEqual(lowest);
		});
	});

	it('leaves a presentation written wrongly to the check at load', () => {
		const definition: ExerciseDefinition = {
			...LOCATE_NECK,
			presentation: { primary: '{chord}' }
		};
		expect(presentationProblem(definition)).toBe(
			'locate-note-string: presentation.primary names field "chord", which note-on-string does not have'
		);
	});

	it("reads the fields of its round's content, an item field winning over one of the same name", () => {
		const definition: ExerciseDefinition = {
			...GESTURE_CLIMB,
			presentation: { primary: '{symbol}', detail: '{strings} · {toward}', target: '{title}' }
		};
		const item = planned(definition, { grid: 'iohefy-a', index: 1 });
		const content = { strings: 'sol‑si‑mi', toward: '↑ en montant', symbol: 'never' };
		expect(presentPrompt(definition, item, 'fr', () => 0, content)).toMatchObject({
			primary: 'G7',
			detail: 'sol‑si‑mi · ↑ en montant',
			target: 'I Only Have Eyes for You'
		});
		// Without the content's fields, a slot that reads them says what is left.
		expect(presentPrompt(definition, item, 'fr', () => 0).detail).toBe('·');
	});

	it('leaves the picture of the members admitted to the view of its round', () => {
		const definition: ExerciseDefinition = {
			...GESTURE_CLIMB,
			presentation: { primary: '{symbol}', picture: 'admitted' }
		};
		const item = planned(definition, { grid: 'iohefy-a', index: 0 });
		expect(presentPrompt(definition, item, 'fr', () => 0).pictures).toEqual([]);
	});
});
