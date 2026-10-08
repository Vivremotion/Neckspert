import { TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { occurrenceOfId } from '$lib/domain/triads';
import type { Locale, RefusedChord } from '$lib/domain/types';

/** Between the frets of a shape: a hyphen that never breaks the line. */
const FRET_SEPARATOR = '‑';

/** A refused chord as the summary reads it: what was asked, and the shape the judge heard. */
export function refusedView(
	refused: RefusedChord,
	locale: Locale
): { asked: string; heard: string | null } {
	const presenter = TRIAD_PRESENTERS[refused.mechanic];
	const prompt = presenter?.prompt(
		refused.item,
		{ aid: 'none', stringAid: false },
		locale,
		() => 0
	);
	const heard = refused.heard === null ? null : occurrenceOfId(refused.heard);
	return {
		asked: prompt ? `${prompt.primary} · ${prompt.secondary}` : refused.mechanic,
		heard: heard ? heard.notes.map((note) => note.fret).join(FRET_SEPARATOR) : null
	};
}
