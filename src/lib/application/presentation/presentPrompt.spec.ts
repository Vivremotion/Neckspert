import { describe, expect, it } from 'vitest';
import {
	IDENTIFY_NECK,
	LOCATE_NECK,
	TRIADS_ANCHOR,
	TRIADS_ZONE
} from '$lib/domain/exercise/catalog';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { PlannedItem } from '$lib/domain/types';
import { identifyPresenter } from '$lib/application/mechanics/identify';
import { locatePresenter } from '$lib/application/mechanics/locate';
import { presentPrompt } from './presentPrompt';

const D_ON_B = 'D|maj|3:5,2:1,1:3';
const EBM_ON_B = 'D#|min|3:5,2:1,1:b3';

function planned(
	definition: ExerciseDefinition,
	item: unknown,
	over: Partial<PlannedItem> = {}
): PlannedItem {
	return {
		exerciseId: definition.id,
		mechanic: definition.mechanic,
		item,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		...over
	};
}

describe('presentPrompt', () => {
	it('writes the locate prompt as today: the note, its string, the fret when aided, the string drawn while it fades', () => {
		const items = [
			{ string: 2, pitch: 'F' },
			{ string: 6, pitch: 'A#' },
			{ string: 1, pitch: 'G#' }
		] as const;
		for (const item of items) {
			for (const aid of ['none', 'show-position'] as const) {
				for (const stringAid of [false, true]) {
					for (const locale of ['fr', 'en'] as const) {
						for (const value of [0, 0.9]) {
							const random = () => value;
							const today = locatePresenter.prompt(item, { aid, stringAid }, locale, random);
							const shown = presentPrompt(
								LOCATE_NECK,
								planned(LOCATE_NECK, item, { aid, stringAid }),
								locale,
								random
							);
							expect(shown.primary).toBe(today.primary);
							expect(shown.secondary).toBe(today.secondary);
							expect(shown.aid).toBe(today.aid);
							expect(shown.detail).toBeNull();
							expect(shown.pictures).toEqual(
								today.diagram ? [{ kind: 'string', ...today.diagram }] : []
							);
						}
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

	it('writes the identify prompt as today: the fret, the string, the name when aided', () => {
		const item = { string: 3, fret: 8 } as const;
		for (const aid of ['none', 'show-position'] as const) {
			const today = identifyPresenter.prompt(item, { aid, stringAid: false }, 'en', () => 0.1);
			const shown = presentPrompt(
				IDENTIFY_NECK,
				planned(IDENTIFY_NECK, item, { aid }),
				'en',
				() => 0.1
			);
			expect(shown.primary).toBe(today.primary);
			expect(shown.secondary).toBe(today.secondary);
			expect(shown.aid).toBe(today.aid);
			expect(shown.pictures).toEqual([]);
		}
	});

	it('writes the anchor prompt: the chord, its root string, its strings, the root on the target, the chord on the band', () => {
		const shown = presentPrompt(
			TRIADS_ANCHOR,
			planned(TRIADS_ANCHOR, { voicingKey: EBM_ON_B }),
			'fr',
			() => 0
		);
		expect(shown).toMatchObject({
			primary: 'Ebm',
			secondary: 'fondamentale sur si',
			detail: 'sol‑si‑mi',
			target: 'Eb',
			band: 'Ebm',
			aid: null,
			pictures: []
		});
		expect(
			presentPrompt(TRIADS_ANCHOR, planned(TRIADS_ANCHOR, { voicingKey: D_ON_B }), 'en', () => 0)
		).toMatchObject({ secondary: 'root on B', detail: 'G‑B‑E', target: 'D' });
	});

	it('draws the lowest shape of an aided anchor and nothing when unaided', () => {
		const item = { voicingKey: D_ON_B };
		const aided = presentPrompt(
			TRIADS_ANCHOR,
			planned(TRIADS_ANCHOR, item, { aid: 'show-position' }),
			'fr',
			() => 0
		);
		expect(aided.pictures).toEqual([
			{
				kind: 'shape',
				notes: [
					{ string: 3, fret: 2 },
					{ string: 2, fret: 3 },
					{ string: 1, fret: 2 }
				]
			}
		]);
		const unaided = presentPrompt(TRIADS_ANCHOR, planned(TRIADS_ANCHOR, item), 'fr', () => 0);
		expect(unaided.pictures).toEqual([]);
	});

	it('writes the zone prompt: the chord, around its fret, the root string when aided', () => {
		const item = { voicingKey: D_ON_B, position: 14, fret: 15 };
		expect(presentPrompt(TRIADS_ZONE, planned(TRIADS_ZONE, item), 'fr', () => 0)).toMatchObject({
			primary: 'D',
			secondary: 'vers la case 15',
			detail: 'sol‑si‑mi',
			aid: null
		});
		expect(
			presentPrompt(
				TRIADS_ZONE,
				planned(TRIADS_ZONE, item, { aid: 'show-position' }),
				'en',
				() => 0
			)
		).toMatchObject({ secondary: 'around fret 15', aid: 'root on B' });
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

	it('lists the aided picture first, then the fading one, each only when given', () => {
		const definition: ExerciseDefinition = {
			...LOCATE_NECK,
			presentation: {
				primary: '{note}',
				aided: { picture: 'string' },
				fading: { picture: 'string' }
			}
		};
		const item = { string: 2, pitch: 'F' };
		const count = (over: Partial<PlannedItem>) =>
			presentPrompt(definition, planned(definition, item, over), 'fr', () => 0).pictures.length;
		expect(count({})).toBe(0);
		expect(count({ aid: 'show-position' })).toBe(1);
		expect(count({ stringAid: true })).toBe(1);
		expect(count({ aid: 'show-position', stringAid: true })).toBe(2);
	});

	it('refuses to present a prompt the exercise writes wrongly', () => {
		const definition: ExerciseDefinition = {
			...LOCATE_NECK,
			presentation: { primary: '{chord}' }
		};
		expect(() =>
			presentPrompt(definition, planned(definition, { string: 2, pitch: 'F' }), 'fr', () => 0)
		).toThrow('locate-neck: presentation.primary names field "chord", which locate does not have');
	});
});
